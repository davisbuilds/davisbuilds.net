// Turns an Obsidian vault Writing note into a site essay (scripts/import-essay.mjs).
// The vault keeps a superset of the site's frontmatter (it adds `type` and
// the `writing` tag); this drops the vault-only parts and refuses
// anything the site can't publish as written, listing every problem at once.
import { fromMarkdown } from 'mdast-util-from-markdown';
import { parse } from 'yaml';
import { essaySchema } from './essay-schema.ts';

export type Imported = { slug: string; markdown: string };

// Site keys in the order the site file lists them; the vault adds `type`.
const SITE_KEYS = ['title', 'description', 'created', 'updated', 'published', 'status', 'confidence', 'importance', 'tags', 'written_by', 'also_on', 'canonical'] as const;
const REQUIRED = ['title', 'description', 'created', 'updated', 'published', 'status', 'confidence', 'importance', 'written_by'] as const;
const VAULT_ONLY_TAGS = new Set(['writing']);
const DATES = new Set(['created', 'updated', 'published']);

// Obsidian syntax with no meaning on the site, looked for in the body's text
// only: code of any kind (fenced, indented, inline) shows it rather than uses it.
const OBSIDIAN_ONLY: [RegExp, string][] = [
  [/(?<!\\)!?\[\[[^\]]*\]\]/, 'wikilink or embed'],
  [/(?<!\\)==[^=\s](?:[^=]*[^=\s])?==/, 'highlight'],
  [/(?<!\\)%%/, 'comment'],
];
const CALLOUT = /^\[![^\]]+\]/;

// The first frontmatter line of an imported essay names its vault note, as a
// YAML comment the build ignores. The script uses it to refuse overwriting an
// essay that came from a different note (or was written by hand).
const SOURCE_PREFIX = 'imported from vault note ';

export function sourceOf(markdown: string): string | null {
  const m = /^---\n# imported from vault note ("(?:[^"\\]|\\.)*")/.exec(markdown);
  return m ? (JSON.parse(m[1]) as string) : null;
}

export function slugFromFileName(fileName: string): string {
  return fileName
    .replace(/\.md$/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

type MdNode = {
  type: string;
  children?: MdNode[];
  position?: { start: { line: number; offset?: number }; end: { offset?: number } };
};

function bodyProblems(body: string, bodyStartLine: number): string[] {
  const out: string[] = [];
  const walk = (node: MdNode, inQuote: boolean) => {
    if (node.type === 'text' && node.position) {
      // The raw source, not the parsed value: the parser drops backslash
      // escapes, and \[\[x\]\] is written to be shown, not linked.
      const raw = body.slice(node.position.start.offset, node.position.end.offset);
      const report = (index: number, kind: string, match: string) => {
        const line = bodyStartLine - 1 + node.position!.start.line + (raw.slice(0, index).match(/\n/g)?.length ?? 0);
        out.push(`line ${line}: Obsidian ${kind} (${match.slice(0, 60)}) won't render on the site`);
      };
      for (const [re, kind] of OBSIDIAN_ONLY) {
        const m = new RegExp(re.source, 'g').exec(raw);
        if (m) report(m.index, kind, m[0]);
      }
      if (inQuote && CALLOUT.test(raw)) report(0, 'callout', raw.split('\n')[0]);
    }
    for (const child of node.children ?? []) walk(child, inQuote || node.type === 'blockquote');
  };
  walk(fromMarkdown(body) as MdNode, false);
  return out;
}

// One YAML line per key. Text goes out as JSON strings, which YAML reads as
// double-quoted scalars, so a colon or # in a title can't change its meaning.
function frontmatterLine(key: string, value: unknown): string {
  if (DATES.has(key)) return `${key}: ${value}`;
  if (typeof value === 'number') return `${key}: ${value}`;
  if (Array.isArray(value)) return `${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  return `${key}: ${JSON.stringify(value)}`;
}

// `source` identifies the note for the overwrite check: its path within the
// vault, since two folders can each hold a note with the same name.
export function convertNote(text: string, fileName: string, source = fileName): Imported {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) throw new Error(`${fileName}: no frontmatter; a Writing note starts with the vault's article properties`);
  // The core schema keeps dates as the text Obsidian wrote; the site checks them.
  const vault = (parse(m[1], { schema: 'core' }) ?? {}) as Record<string, unknown>;
  const problems: string[] = [];

  if (vault.type !== 'article') problems.push('`type` must be `type: article`; only articles publish');
  const unknown = Object.keys(vault).filter((k) => k !== 'type' && !(SITE_KEYS as readonly string[]).includes(k));
  for (const k of unknown) problems.push(`\`${k}\` isn't a Writing property (misspelled?)`);
  for (const k of REQUIRED) if (blank(vault[k])) problems.push(`\`${k}\` is blank`);

  // A scalar or nested tag would otherwise be coerced or dropped, and with it an
  // ai-generated marker.
  const tagsOk = Array.isArray(vault.tags) && vault.tags.every((t) => typeof t === 'string' && t.trim());
  if (!tagsOk) problems.push('`tags` must be a list of text, one tag per line');
  // Obsidian compares tags trimmed and case-insensitively, so this does too.
  const tags = tagsOk ? (vault.tags as string[]).map((t) => t.trim()) : [];
  if (tags.some((t) => t.toLowerCase() === 'ai-generated')) problems.push('tagged `ai-generated`: an AI wrote this text, so rewrite it in your own words and remove the tag first');
  if (typeof vault.importance === 'string' && !blank(vault.importance)) problems.push('`importance` is saved as text; set the property type to Number in Obsidian');

  const site: Record<string, unknown> = {};
  for (const k of SITE_KEYS) {
    if (k === 'tags') site.tags = tags.filter((t) => !VAULT_ONLY_TAGS.has(t.toLowerCase()));
    else if (!blank(vault[k])) site[k] = vault[k];
  }

  // Validate with the build's own schema, leaving out what's already reported:
  // blank fields, importance saved as text, and malformed tags.
  const reported = new Set<string>([...REQUIRED.filter((k) => blank(vault[k])), ...(typeof vault.importance === 'string' ? ['importance'] : []), ...(tagsOk ? [] : ['tags'])]);
  const result = essaySchema.safeParse(site);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const where = String(issue.path[0] ?? '');
      if (reported.has(where)) continue;
      problems.push(where && !issue.message.includes(`\`${where}\``) ? `\`${where}\`: ${issue.message}` : issue.message);
    }
  }

  const body = src.slice(m[0].length);
  problems.push(...bodyProblems(body, m[0].split('\n').length));

  if (problems.length) throw new Error(`${fileName} can't be imported:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

  const fm = [`# ${SOURCE_PREFIX}${JSON.stringify(source)}; edit it there and re-run scripts/import-essay.mjs`, ...SITE_KEYS.filter((k) => k in site).map((k) => frontmatterLine(k, site[k]))];
  return { slug: slugFromFileName(fileName), markdown: `---\n${fm.join('\n')}\n---\n${body}` };
}
