// WHY: The page a runnable demo is served as, and the edits made to it.
// Starting from the entry page, it follows local
// references, confined to the run directory. Third-party loads are swapped for
// vendored copies from vendor-map.ts or fail the build. Every served page gets
// a CSP that keeps it offline.
//
// A demo is served as that one page. The host's bot check answers any request
// without its cookie with a challenge page, and a sandboxed frame (an opaque
// origin) never sends the cookie, so every request after the page itself would
// fail. Scripts, plain stylesheets and fonts are written into the page;
// anything else it would load separately fails the build.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { bundleModule } from './modules.ts';
import { confinedFile, isRemote } from './files.ts';
import { RunError } from './manifest.ts';
import { DEMO_CSP, FONT_FAMILIES, GOOGLE_FONTS_CSS, PRECONNECT_HOSTS, SCRIPTS, STORAGE_SHIM } from './vendor-map.ts';

export type Substitution = { file: string; from: string; to: string; label: string };
export type DemoFile = { rel: string; bytes: Buffer };
// WHY: `files` is what's served: the entry page alone. `sources` is every file the
// demo uses, as read from the run, for reviewing a lock bump.
export type Demo = { entry: string; files: DemoFile[]; sources: DemoFile[]; substitutions: Substitution[] };

// WHY: HTML is the only document type served, because only HTML pages get the
// offline CSP. SVG is left out: opened as a document (in a frame, or by the
// demo navigating to it) it runs script with no policy.
export const ALLOWED_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'woff2', 'wav', 'mp3', 'ogg'];
export const MAX_DEMO_BYTES = 5 * 1024 * 1024;

type Options = { nodeModules: string };

const LOAD_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'icon', 'shortcut', 'apple-touch-icon', 'manifest', 'prefetch']);
const HINT_RELS = new Set(['preconnect', 'dns-prefetch']);
const URL_ATTRS: Record<string, string[]> = {
  script: ['src'], img: ['src', 'srcset'], source: ['src', 'srcset'], audio: ['src'], video: ['src', 'poster'],
  track: ['src'], iframe: ['src'], embed: ['src'], object: ['data'], input: ['src'], link: ['href'],
};
// WHY: CSS keywords and functions are case-insensitive: URL( and @IMPORT load too.
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/gi;
const JS_IMPORT_RE = /(?:^|[^\w$.])import\s*(?:[\w*{}\s,$]+\s*from\s*)?(['"])([^'"\n]+)\1|\bimport\(\s*(['"])([^'"\n]+)\3\s*\)/g;
const JS_WORKER_RE = /\bnew\s+(?:Shared)?Worker\(\s*(['"])([^'"\n]+)\1/g;
const FONT_MIME: Record<string, string> = { '.ttf': 'font/ttf', '.woff2': 'font/woff2' };

const STORAGE_RE = /\b(?:localStorage|sessionStorage)\b/;
const skippable = (u: string) => u === '' || u.startsWith('#') || /^(data|blob|about|javascript):/i.test(u);

type Node = DefaultTreeAdapterMap['node'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];
type Element = DefaultTreeAdapterMap['element'];
type Document = DefaultTreeAdapterMap['document'];
type Parsed = { doc: Document; bom: number };

// WHY: Parses a page as a browser does. Browsers drop a leading BOM before
// parsing; parse5 would read it as text, so offsets are shifted by `bom`.
function parsePage(html: string): Parsed {
  const bom = html.startsWith('\uFEFF') ? 1 : 0;
  return { doc: parse(html.slice(bom), { sourceCodeLocationInfo: true }), bom };
}

function* elements(node: ParentNode): Generator<Element> {
  for (const child of node.childNodes) {
    if (!('tagName' in child)) continue;
    yield child;
    if (child.tagName === 'template') yield* elements((child as DefaultTreeAdapterMap['template']).content);
    yield* elements(child);
  }
}

const textOf = (el: Element) => el.childNodes.map((n) => (n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : '')).join('');

// WHY: Script text as an inline <script> body. "</script" would close the element
// early; written "<\/script" it means the same in a string, template, regex or
// comment, the only places it can appear. "<!--" can change how the rest of
// the element parses and has no safe rewrite, so it fails instead.
function inlineScriptBody(text: string, slug: string, what: string): string {
  if (text.includes('<!--')) throw new RunError(slug, `${what} contains "<!--", so it can't be written into the page`);
  return text.replace(/<\/(script)/gi, '<\\/$1');
}

// WHY: Rebuilds a Google Fonts css2 stylesheet from the mapped Fontsource packages,
// keeping Google's family names so the demo's own CSS still matches.
function googleFonts(url: string, slug: string, opts: Options): { css: string; families: string[] } {
  const u = new URL(url);
  const css: string[] = [];
  const families: string[] = [];
  for (const spec of u.searchParams.getAll('family')) {
    const [name, axisSpec = ''] = spec.split(':');
    const fam = FONT_FAMILIES[name];
    if (!fam) throw new RunError(slug, `loads font "${name}" from Google Fonts, which the vendor map doesn't cover`);
    families.push(name);
    const [axesPart = '', tuplesPart = ''] = axisSpec.split('@');
    const axes = axesPart ? axesPart.split(',') : [];
    const tuples = tuplesPart ? tuplesPart.split(';').map((t) => t.split(',')) : [];
    const at = (tuple: string[], axis: string) => (axes.indexOf(axis) >= 0 ? tuple[axes.indexOf(axis)] : undefined);
    const italics = new Set(tuples.length ? tuples.map((t) => at(t, 'ital') === '1') : [false]);
    const sheets: string[] = [];
    if (fam.kind === 'variable') {
      if (italics.has(false)) sheets.push(fam.css.normal);
      if (italics.has(true)) {
        if (!fam.css.italic) throw new RunError(slug, `needs italic "${name}", which the vendored package lacks`);
        sheets.push(fam.css.italic);
      }
    } else {
      const wanted = tuples.length ? tuples.map((t) => [at(t, 'wght') ?? '400', at(t, 'ital') === '1'] as const) : [['400', false] as const];
      for (const [w, ital] of wanted) {
        if (!/^\d{3}$/.test(w)) throw new RunError(slug, `requests "${name}" weight "${w}", which a static font can't serve`);
        sheets.push(`${w}${ital ? '-italic' : ''}.css`);
      }
    }
    for (const sheet of [...new Set(sheets)]) {
      const pkgDir = path.join(opts.nodeModules, fam.pkg);
      const file = path.join(pkgDir, sheet);
      if (!existsSync(file)) throw new RunError(slug, `vendored font sheet ${fam.pkg}/${sheet} is missing`);
      let text = readFileSync(file, 'utf8').replaceAll(`font-family: '${fam.sourceName}'`, `font-family: '${name}'`);
      // WHY: Every browser that runs these demos reads woff2, so a woff fallback
      // would only double the page.
      text = text.replace(/,\s*url\(\.\/files\/[^)]+\.woff\)\s*format\('woff'\)/g, '');
      text = text.replace(/url\(\.\/files\/([^)]+)\)/g, (_, f: string) => {
        if (!f.endsWith('.woff2')) throw new RunError(slug, `vendored font ${fam.pkg}/files/${f} is not woff2`);
        return `url(data:font/woff2;base64,${readFileSync(path.join(pkgDir, 'files', f)).toString('base64')})`;
      });
      css.push(text);
    }
  }
  if (families.length === 0) throw new RunError(slug, `loads a Google Fonts stylesheet with no families: ${url}`);
  const text = css.join('\n');
  if (/<\/style/i.test(text)) throw new RunError(slug, `vendored fonts for ${families.join(', ')} contain "</style", so they can't be written into the page`);
  return { css: text, families };
}

// WHY: Where the demo's policy goes: right after the page's <head> tag, or after a
// <meta charset> that opens the head (so the charset stays within the first
// 1024 bytes). The page is parsed as a browser parses it, so a malformed
// comment can't hide markup: nothing but a doctype and comments may come
// before an explicit <head>, or it would run before the policy exists.
function locateHead(html: string, { doc, bom }: Parsed, rel: string, slug: string): { anchorAt: number; anchorEnd: number } {
  const htmlEl = doc.childNodes.find((n): n is Element => n.nodeName === 'html')!;
  const head = htmlEl.childNodes.find((n): n is Element => n.nodeName === 'head')!;
  const headTag = head.sourceCodeLocation?.startTag;
  const before: Node[] = [...doc.childNodes.slice(0, doc.childNodes.indexOf(htmlEl)), ...htmlEl.childNodes.slice(0, htmlEl.childNodes.indexOf(head))];
  if (!headTag || before.some((n) => n.nodeName !== '#documentType' && n.nodeName !== '#comment')) {
    if (!/<head[\s/>]/i.test(html)) throw new RunError(slug, `${rel} has no <head>, so the demo's content security policy can't be added`);
    const first = (head.childNodes[0] ?? htmlEl.childNodes.find((n) => n !== head)) as Element | undefined;
    const what = first?.sourceCodeLocation ? html.slice(bom + first.sourceCodeLocation.startOffset, bom + first.sourceCodeLocation.startOffset + 40) : 'markup';
    throw new RunError(slug, `${rel} has content before its <head> ("${what}"), which would run before the demo's content security policy`);
  }
  const opener = head.childNodes.find((n) => !(n.nodeName === '#text' && /^\s*$/.test((n as DefaultTreeAdapterMap['textNode']).value)));
  const charset = opener?.nodeName === 'meta' && (opener as Element).attrs.length === 1 && (opener as Element).attrs[0].name === 'charset';
  const end = charset ? opener.sourceCodeLocation!.endOffset : headTag.endOffset;
  return { anchorAt: bom + headTag.startOffset, anchorEnd: bom + end };
}

export async function collectDemo(runDir: string, slug: string, entry: string, opts: Options): Promise<Demo> {
  if (!/\.html?$/i.test(entry)) throw new RunError(slug, `entry "${entry}" is not an HTML page`);
  const root = realpathSync(runDir);
  const files = new Map<string, DemoFile>();
  const substitutions: Substitution[] = [];
  type Inline = { whole: string; tag: string; ref: string; fromDir: string };
  const pages: Array<{ rel: string; html: string; parsed: Parsed; subs: Substitution[]; inlines: Inline[]; modules: Inline[]; styles: Inline[] }> = [];
  const read = new Set<string>();
  const written = new Set<string>();
  const stylesheetText = new Map<string, string>();
  let total = 0;
  const queue: Array<{ ref: string; fromDir: string; what: string }> = [{ ref: entry, fromDir: root, what: 'entry' }];
  // WHY: References still in the served page as loads: everything except the
  // script and stylesheet tags that are replaced by the file's text. A file
  // written in once is still a separate request if any of these names it.
  const requested: Array<{ ref: string; fromDir: string; what: string }> = [];

  const resolve = (ref: string, fromDir: string, what: string) => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(ref.split(/[?#]/)[0]);
    } catch {
      throw new RunError(slug, `${what} "${ref}" is not a valid URL path`);
    }
    if (decoded.startsWith('/')) throw new RunError(slug, `${what} "${ref}" is an absolute path; demos may use relative paths only`);
    const abs = confinedFile(root, decoded, slug, what, fromDir);
    return { abs, rel: path.relative(root, abs).split(path.sep).join('/') };
  };

  const track = (abs: string, rel: string) => {
    const existing = files.get(rel);
    if (existing) return existing.bytes;
    const bytes = readFileSync(abs);
    total += bytes.length;
    if (total > MAX_DEMO_BYTES) throw new RunError(slug, `demo files exceed 5 MB`);
    files.set(rel, { rel, bytes });
    return bytes;
  };

  while (queue.length) {
    const { ref, fromDir, what } = queue.shift()!;
    const { abs, rel } = resolve(ref, fromDir, what);
    if (read.has(rel)) continue;
    read.add(rel);
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (ext === 'svg') throw new RunError(slug, `${what} "${rel}" is an SVG file; demos can't serve SVG, which runs script without the demo's content security policy`);
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new RunError(slug, `${what} "${rel}" has a file type demos can't serve (.${ext})`);
    const bytes = track(abs, rel);
    const dir = path.dirname(abs);
    const follow = (r: string, kind: string, writtenIn = false) => {
      if (skippable(r)) return;
      if (isRemote(r)) throw new RunError(slug, `${rel} loads ${r} from another host, which the vendor map doesn't cover`);
      queue.push({ ref: r, fromDir: dir, what: `${kind} in ${rel}` });
      if (!writtenIn) requested.push({ ref: r, fromDir: dir, what: `${kind} in ${rel}` });
    };
    const scanCss = (text: string, inlineFonts = false) => text.replace(CSS_URL_RE, (matched, _quote, url: string | undefined, _importQuote, css: string | undefined) => {
      const ref = (url ?? css!).trim();
      const mime = inlineFonts && url && FONT_MIME[path.extname(ref.split(/[?#]/)[0]).toLowerCase()];
      if (mime && !skippable(ref) && !isRemote(ref)) {
        const font = resolve(ref, dir, `font in ${rel}`);
        const base64 = track(font.abs, font.rel).toString('base64');
        written.add(font.rel);
        return `url(data:${mime};base64,${base64})`;
      }
      follow(ref, 'stylesheet reference');
      return matched;
    });
    const scanJs = (text: string) => {
      for (const m of text.matchAll(JS_IMPORT_RE)) {
        const spec = m[2] ?? m[4];
        if (isRemote(spec) || spec.startsWith('.') || spec.startsWith('/')) follow(spec, 'script import');
      }
      for (const m of text.matchAll(JS_WORKER_RE)) follow(m[2], 'script worker');
    };

    if (ext === 'css') stylesheetText.set(rel, scanCss(bytes.toString('utf8'), true));
    if (ext === 'js' || ext === 'mjs') scanJs(bytes.toString('utf8'));
    if (ext !== 'html') continue;

    const html = bytes.toString('utf8');
    const parsed = parsePage(html);
    const subs: Substitution[] = [];
    const inlines: Inline[] = [];
    const modules: Inline[] = [];
    const styles: Inline[] = [];
    for (const el of elements(parsed.doc)) {
      const name = el.tagName;
      const loc = el.sourceCodeLocation?.startTag;
      const a = new Map(el.attrs.map((x) => [x.name, x.value]));
      if (a.has('style')) scanCss(a.get('style')!);
      if (name === 'style') scanCss(textOf(el));
      if (name === 'script' && !a.has('src')) scanJs(textOf(el));
      if (name !== 'link' && !URL_ATTRS[name]) continue;
      if (!loc) continue; // WHY: made by the parser, not written in the page
      const tag = html.slice(parsed.bom + loc.startOffset, parsed.bom + loc.endOffset);
      const withAttr = (attr: string, value: string) => {
        const at = el.sourceCodeLocation!.attrs![attr];
        const [from, to] = [at.startOffset - loc.startOffset, at.endOffset - loc.startOffset];
        return `${tag.slice(0, from)}${attr}="${value}"${tag.slice(to)}`;
      };
      if (name === 'link') {
        const rels = (a.get('rel') ?? '').toLowerCase().split(/\s+/);
        const href = (a.get('href') ?? '').trim();
        if (skippable(href)) continue;
        if (rels.some((r) => HINT_RELS.has(r))) {
          if (!isRemote(href)) continue;
          const host = new URL(href.startsWith('//') ? `https:${href}` : href).hostname;
          if (!PRECONNECT_HOSTS.has(host)) throw new RunError(slug, `${rel} has a connection hint to ${host}, which the vendor map doesn't cover`);
          if (tag.includes('--')) throw new RunError(slug, `${rel} has a hint tag that can't be commented out safely`);
          subs.push({ file: rel, from: tag, to: `<!--${tag}-->`, label: `connection hint to ${host} commented out` });
          continue;
        }
        if (!rels.some((r) => LOAD_RELS.has(r))) continue;
        if (isRemote(href) && rels.includes('stylesheet') && href.startsWith(`${GOOGLE_FONTS_CSS}?`)) {
          const g = googleFonts(href, slug, opts);
          subs.push({ file: rel, from: tag, to: `<style>${g.css}</style>`, label: `fonts ${g.families.join(', ')} (instead of fonts.googleapis.com)` });
          continue;
        }
        if (isRemote(href)) throw new RunError(slug, `${rel} loads ${href} from another host, which the vendor map doesn't cover`);
        if (rels.includes('stylesheet')) {
          // WHY: Written in as a <style>, it applies where the link stood; only
          // media carries over, so anything else would change what it does.
          if (rels.length !== 1) throw new RunError(slug, `${rel} loads ${href} as "${a.get('rel')}"; only a plain stylesheet can be written into the page`);
          for (const attr of a.keys()) {
            if (attr === 'type' && ['', 'text/css'].includes(a.get('type')!.trim().toLowerCase())) continue;
            if (!['rel', 'href', 'media'].includes(attr)) throw new RunError(slug, `${rel} loads ${href} with ${attr}, which a stylesheet written into the page would lose`);
          }
          const media = el.sourceCodeLocation!.attrs!.media;
          const open = media ? `<style ${tag.slice(media.startOffset - loc.startOffset, media.endOffset - loc.startOffset)}>` : '<style>';
          styles.push({ whole: tag, tag: open, ref: href, fromDir: dir });
          follow(href, 'link', true);
          continue;
        }
        follow(href, 'link');
        continue;
      }
      if (name === 'script' && a.has('src') && !skippable(a.get('src')!.trim())) {
        const src = a.get('src')!.trim();
        const end = el.sourceCodeLocation?.endTag;
        if (!end) throw new RunError(slug, `${rel} has a <script src="${src}"> with no closing tag`);
        const whole = html.slice(parsed.bom + loc.startOffset, parsed.bom + end.endOffset);
        const at = el.sourceCodeLocation!.attrs!.src;
        const bare = `${tag.slice(0, at.startOffset - loc.startOffset).trimEnd()}${tag.slice(at.endOffset - loc.startOffset)}`;
        // WHY: Written in, a script runs where it stands; these would change when.
        const type = (a.get('type') ?? '').trim().toLowerCase();
        for (const flag of ['defer', 'async']) if (a.has(flag)) throw new RunError(slug, `${rel} loads ${src} with ${flag}, which a script written into the page would ignore`);
        if (type === 'module') {
          if (isRemote(src)) throw new RunError(slug, `${rel} loads module ${src} from another host`);
          if (modules.length) throw new RunError(slug, `${rel} has more than one external module entry`);
          for (const attr of a.keys()) {
            if (!['type', 'src', 'id'].includes(attr) && !attr.startsWith('data-')) throw new RunError(slug, `${rel} loads module ${src} with unsupported attribute ${attr}`);
          }
          modules.push({ whole, tag: bare, ref: src, fromDir: dir });
          continue;
        }
        if (type && !['text/javascript', 'application/javascript'].includes(type)) throw new RunError(slug, `${rel} loads ${src} as unsupported script type "${type}"`);
        if (isRemote(src) && SCRIPTS[src]) {
          const s = SCRIPTS[src];
          const body = inlineScriptBody(readFileSync(path.join(opts.nodeModules, s.pkg, s.file), 'utf8'), slug, `vendored ${s.pkg}/${s.file}`);
          subs.push({ file: rel, from: whole, to: `${bare}${body}</script>`, label: s.label });
          continue;
        }
        if (!isRemote(src)) inlines.push({ whole, tag: bare, ref: src, fromDir: dir });
      }
      for (const attr of URL_ATTRS[name]) {
        const v = a.get(attr);
        if (v === undefined) continue;
        const refs = attr === 'srcset' ? v.split(',').map((s) => s.trim().split(/\s+/)[0]) : [v.trim()];
        // WHY: A local script's src is replaced by its text; nothing else here is.
        const writtenIn = name === 'script' && attr === 'src';
        for (const r of refs) follow(r, `${name} ${attr}`, writtenIn);
      }
    }

    pages.push({ rel, html, parsed, subs, inlines, modules, styles });
  }

  const entryRel = resolve(entry, root, 'entry').rel;
  for (const { rel, subs, inlines, modules, styles } of pages) {
    for (const { whole, tag, ref, fromDir } of inlines) {
      const target = resolve(ref, fromDir, `script src in ${rel}`).rel;
      const body = inlineScriptBody(files.get(target)!.bytes.toString('utf8'), slug, target);
      subs.push({ file: rel, from: whole, to: `${tag}${body}</script>`, label: 'its scripts written into the page, so it loads as one file' });
      written.add(target);
    }
    for (const { whole, tag, ref, fromDir } of modules) {
      const target = resolve(ref, fromDir, `module src in ${rel}`);
      const bundle = await bundleModule(root, slug, target.rel, (abs, source) => {
        const text = track(abs, source).toString('utf8');
        written.add(source);
        for (const m of text.matchAll(JS_WORKER_RE)) {
          if (!skippable(m[2])) throw new RunError(slug, `${source} loads worker ${m[2]} as a separate request`);
        }
        return text;
      });
      const body = inlineScriptBody(bundle, slug, target.rel);
      subs.push({ file: rel, from: whole, to: `${tag}${body}</script>`, label: 'its local module imports bundled into the page' });
    }
    for (const { whole, tag, ref, fromDir } of styles) {
      const target = resolve(ref, fromDir, `stylesheet in ${rel}`).rel;
      if (!target.endsWith('.css')) throw new RunError(slug, `${rel} loads ${target} as a stylesheet; only a .css file can be written into the page`);
      // WHY: "</style" would end the element early, and there's no rewrite of it
      // that keeps every CSS context (string, comment, selector) the same.
      const css = stylesheetText.get(target)!;
      if (/<\/style/i.test(css)) throw new RunError(slug, `${target} contains "</style", so it can't be written into the page`);
      subs.push({ file: rel, from: whole, to: `${tag}${css}</style>`, label: 'its stylesheets written into the page, so it loads as one file' });
      written.add(target);
    }
  }

  // WHY: Head insertions need the whole file set: the storage stand-in goes in only
  // if some file in the demo uses web storage.
  const served = new Map<string, DemoFile>();
  const usesStorage = [...files.values()].some((f) => /\.(html?|m?js)$/.test(f.rel) && STORAGE_RE.test(f.bytes.toString('utf8')));
  for (const { rel, html: original, parsed, subs } of pages) {
    const { anchorAt, anchorEnd } = locateHead(original, parsed, rel, slug);
    const anchor = original.slice(anchorAt, anchorEnd);
    let inserted = `${anchor}\n<meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}">`;
    const headEdits: Substitution[] = [{ file: rel, from: anchor, to: inserted, label: 'a content security policy that keeps the demo offline' }];
    if (usesStorage) {
      const prev = inserted;
      inserted = `${inserted}\n<script>${STORAGE_SHIM}</script>`;
      headEdits.push({ file: rel, from: prev, to: inserted, label: 'in-memory web storage, since the sandbox has none (nothing is saved between visits)' });
    }
    for (const s of [...subs, ...headEdits]) {
      if (original.includes(s.to)) throw new RunError(slug, `${rel} already contains a substitution's output, so the edit couldn't be reversed`);
    }
    // WHY: Tag swaps apply everywhere; the head insertion only at its anchor.
    // A function replacement, so "$&" and the like in script text stay literal.
    const swapped = subs.reduce((text, s) => text.replaceAll(s.from, () => s.to), original);
    // WHY: Only a doctype and comments precede the anchor (locateHead). A swap
    // inside one of those comments would shift it, and fails here.
    if (!swapped.startsWith(anchor, anchorAt)) throw new RunError(slug, `${rel}: the <head> moved while editing, so the policy couldn't be placed`);
    const html = swapped.slice(0, anchorAt) + inserted + swapped.slice(anchorAt + anchor.length);
    subs.push(...headEdits);
    substitutions.push(...subs);
    served.set(rel, { rel, bytes: Buffer.from(html) });
  }

  const stillRequested = new Set(requested.map(({ ref, fromDir, what }) => resolve(ref, fromDir, what).rel));
  for (const rel of files.keys()) {
    if (rel !== entryRel && (!written.has(rel) || stillRequested.has(rel))) throw new RunError(slug, `the demo loads ${rel} as a separate request, which the host's bot check blocks inside the sandbox`);
  }
  return { entry: entryRel, files: [...served.values()], sources: [...files.values()], substitutions };
}

// WHY: Undoes a page's substitutions, newest first. Tests use it to show the served
// page is the original plus exactly the recorded edits.
export function reverseSubstitutions(served: string, subs: Substitution[]): string {
  return [...subs].reverse().reduce((text, s) => text.replaceAll(s.to, () => s.from), served);
}
