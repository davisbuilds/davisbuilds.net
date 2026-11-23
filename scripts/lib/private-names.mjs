// WHY: Read the private inventory at deploy time because putting it in this repository would publish it.
import { APPS } from '../../src/data/parts.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export const EXTRA_NAMES = 'private/names.txt';

const gh = (args) => execFileSync('gh', args, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);

export function parseNamesFile(text) {
  const names = [];
  const canaries = [];
  for (const line of text.split('\n')) {
    const entry = line.replace(/#.*/, '').trim();
    const canary = /^github:\s*(\S+)$/.exec(entry);
    if (canary) canaries.push(canary[1]);
    else if (entry) names.push(entry);
  }
  return { names, canaries };
}

// WHY: A successful GitHub request can still return a partial inventory if the login lacks access.
export function checkCanaries(listed, canaries) {
  if (!canaries.length) throw new Error(`${EXTRA_NAMES} names no \`github:\` canary, so a partial GitHub list would pass unnoticed`);
  const seen = new Set(listed.map((n) => n.toLowerCase()));
  const missing = canaries.filter((c) => !seen.has(c.toLowerCase()));
  if (missing.length) throw new Error(`the gh login can't see private repositories ${missing.join(', ')}; the private-name scan would be incomplete`);
}

// WHY: Throws unless the token can see every private repository: a classic or
// OAuth token with the `repo` scope. A fine-grained or app token can be
// limited to selected repositories and reports no scopes at all. `response`
// is `gh api -i` output.
export function checkScopes(response) {
  const scopes = /^x-oauth-scopes:(.*)$/im.exec(response)?.[1].split(',').map((s) => s.trim()) ?? [];
  if (!scopes.includes('repo')) throw new Error("the gh login's token lacks the repo scope (a fine-grained or app token may see only some private repositories); log in with `gh auth login`");
}

export function privateNames(self) {
  // WHY: Required: without it the scan would silently skip every project it lists.
  if (!existsSync(EXTRA_NAMES)) throw new Error(`${EXTRA_NAMES} is missing; the private-name scan needs it`);
  const { names: extra, canaries } = parseNamesFile(readFileSync(EXTRA_NAMES, 'utf8'));
  checkScopes(execFileSync('gh', ['api', '-i', 'user'], { encoding: 'utf8' }));
  const listed = gh(['api', '--paginate', 'user/repos?visibility=private&affiliation=owner&per_page=100', '--jq', '.[].name']);
  checkCanaries(listed, canaries);
  const names = new Set([...listed, ...extra, ...canaries].map((n) => n.toLowerCase()));
  names.delete(self.toLowerCase());
  return [...names];
}

export function publicNames() {
  return gh(['api', '--paginate', 'user/repos?visibility=public&affiliation=owner&per_page=100', '--jq', '.[].name']).map((n) => n.toLowerCase());
}

// WHY: Token boundaries prevent a short project name from matching an unrelated longer word.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const tokenRe = (name) => new RegExp(`(?<![a-z0-9_-])${escape(name)}(?![a-z0-9_-])`, 'i');

// WHY: Built files whose text is the site's own. Demo files are copied verbatim from
// the public oneshots repository, where an ordinary word or variable name that
// happens to match a project name is code, not a mention.
const isDemoFile = (file) => /^oneshots\/[^/]+\/files\//.test(file);
export const scannable = (file) => /\.(html|xml|txt|json|js|css|md|svg)$/.test(file) && !isDemoFile(file);

// WHY: File paths also reach the public deployment and can disclose names independently of file contents.
export const scanTargets = (built, read) => [
  ...built.filter(scannable).map((f) => [f, read(f)]),
  ['built paths', built.filter((f) => !isDemoFile(f)).join('\n')],
];

export function findNames(texts, names) {
  const hits = [];
  for (const name of names) {
    const re = tokenRe(name);
    for (const [file, text] of texts) if (re.test(text)) hits.push(`${file}: ${name}`);
  }
  return hits;
}

// WHY: Application brands may be deliberately published without publishing source.
// Scope and canary validation still happen in privateNames before this scan.
export function findPrivateNames(texts, names, apps = APPS) {
  const brands = apps.filter((app) => app.publishedBrand === true && app.url);
  const approved = new Map(brands.map((app) => [app.name.toLowerCase(), app.url]));
  const ordinary = names.filter((name) => !approved.has(name.toLowerCase()));
  const hits = findNames(texts, ordinary);
  for (const name of names.filter((name) => approved.has(name.toLowerCase()))) {
    // WHY: An approved display name is not permission to expose a source URL,
    // another host, or a build path. Only the curated live destination is OK.
    const protectedTexts = texts.map(([file, content]) => {
      const liveUrl = approved.get(name.toLowerCase());
      // WHY: Remove only a complete curated URL, before collecting path tokens.
      // Prefix/suffix matches must not hide a different destination.
      const normalized = content.replace(/\\\//g, '/').replaceAll(liveUrl, (url, offset, full) => {
        const boundary = (c) => c === undefined || /[\s<>"'`()[\]]/.test(c);
        return boundary(full[offset - 1]) && boundary(full[offset + url.length]) ? '' : url;
      });
      const destinations = [
        // WHY: HTML tag boundaries keep a standalone approved name from being interpreted as a path.
        ...(normalized.match(/(?:[a-z0-9._~@%:+-]*[\/\\])+[a-z0-9._~@%:+/\\-]+/gi) ?? []),
        ...(normalized.match(/(?:[a-z0-9_~@%+-]+\.)+[a-z0-9_~@%+-]+/gi) ?? []),
        ...(normalized.match(/(?:https?:\/\/|\/\/|\b(?:[a-z0-9-]+\.)+[a-z]{2,}[/:])[^\s<>"'`\)\]]+/gi) ?? []),
        ...Array.from(normalized.matchAll(/\b(?:href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi), (m) => m[1] ?? m[2] ?? m[3]),
        ...Array.from(normalized.matchAll(/\]\(([^)\s]+)/g), (m) => m[1]),
      ];
      return [file, file === 'built paths' ? content : destinations.join('\n')];
    });
    hits.push(...findNames(protectedTexts, [name]));
  }
  return hits;
}
