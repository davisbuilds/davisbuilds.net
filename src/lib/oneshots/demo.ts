// The file set a runnable demo needs, and the edits made to serve it.
// Starting from the entry page, it follows local
// references, confined to the run directory. Third-party loads are swapped for
// vendored copies from vendor-map.ts or fail the build. Every served page gets
// a CSP that keeps it offline.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { confinedFile, isRemote } from './files.ts';
import { RunError } from './manifest.ts';
import { DEMO_CSP, FONT_FAMILIES, GOOGLE_FONTS_CSS, PRECONNECT_HOSTS, SCRIPTS, STORAGE_SHIM } from './vendor-map.ts';

export type Substitution = { file: string; from: string; to: string; label: string };
export type DemoFile = { rel: string; bytes: Buffer };
export type VendorFile = { out: string; bytes: Buffer };
export type Demo = { entry: string; files: DemoFile[]; vendor: VendorFile[]; substitutions: Substitution[] };

// HTML is the only document type served, because only HTML pages get the
// offline CSP. SVG is left out: opened as a document (in a frame, or by the
// demo navigating to it) it runs script with no policy.
export const ALLOWED_EXTENSIONS = ['html', 'js', 'mjs', 'css', 'json', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'woff2', 'wav', 'mp3', 'ogg'];
export const MAX_DEMO_BYTES = 5 * 1024 * 1024;

type Options = { nodeModules: string; urlBase: string };

const LOAD_RELS = new Set(['stylesheet', 'preload', 'modulepreload', 'icon', 'shortcut', 'apple-touch-icon', 'manifest', 'prefetch']);
const HINT_RELS = new Set(['preconnect', 'dns-prefetch']);
const URL_ATTRS: Record<string, string[]> = {
  script: ['src'], img: ['src', 'srcset'], source: ['src', 'srcset'], audio: ['src'], video: ['src', 'poster'],
  track: ['src'], iframe: ['src'], embed: ['src'], object: ['data'], input: ['src'], link: ['href'],
};
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g;
const JS_IMPORT_RE = /(?:^|[^\w$.])import\s*(?:[\w*{}\s,$]+\s*from\s*)?(['"])([^'"\n]+)\1|\bimport\(\s*(['"])([^'"\n]+)\3\s*\)|\bnew\s+(?:Shared)?Worker\(\s*(['"])([^'"\n]+)\5/g;

const STORAGE_RE = /\b(?:localStorage|sessionStorage)\b/;
const skippable = (u: string) => u === '' || u.startsWith('#') || /^(data|blob|about|javascript):/i.test(u);
const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);

type Node = DefaultTreeAdapterMap['node'];
type ParentNode = DefaultTreeAdapterMap['parentNode'];
type Element = DefaultTreeAdapterMap['element'];
type Document = DefaultTreeAdapterMap['document'];
type Parsed = { doc: Document; bom: number };

// Parses a page as a browser does. Browsers drop a leading BOM before
// parsing; parse5 would read it as text, so offsets are shifted by `bom`.
function parsePage(html: string): Parsed {
  const bom = html.startsWith('\uFEFF') ? 1 : 0;
  return { doc: parse(html.slice(bom), { sourceCodeLocationInfo: true }), bom };
}

// Every element in document order, template contents included.
function* elements(node: ParentNode): Generator<Element> {
  for (const child of node.childNodes) {
    if (!('tagName' in child)) continue;
    yield child;
    if (child.tagName === 'template') yield* elements((child as DefaultTreeAdapterMap['template']).content);
    yield* elements(child);
  }
}

const textOf = (el: Element) => el.childNodes.map((n) => (n.nodeName === '#text' ? (n as DefaultTreeAdapterMap['textNode']).value : '')).join('');

// Rebuilds a Google Fonts css2 stylesheet from the mapped Fontsource packages,
// keeping Google's family names so the demo's own CSS still matches.
function googleFonts(url: string, slug: string, opts: Options): { css: VendorFile; files: VendorFile[]; out: string; families: string[] } {
  const u = new URL(url);
  const css: string[] = [];
  const files: VendorFile[] = [];
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
      text = text.replace(/url\(\.\/files\/([^)]+)\)/g, (_, f: string) => {
        files.push({ out: `fonts/files/${f}`, bytes: readFileSync(path.join(pkgDir, 'files', f)) });
        return `url(files/${f})`;
      });
      css.push(text);
    }
  }
  if (families.length === 0) throw new RunError(slug, `loads a Google Fonts stylesheet with no families: ${url}`);
  const out = `fonts/${sha8(url)}.css`;
  return { css: { out, bytes: Buffer.from(css.join('\n')) }, files, out, families };
}

// Where the demo's policy goes: right after the page's <head> tag, or after a
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

export function collectDemo(runDir: string, slug: string, entry: string, opts: Options): Demo {
  if (!/\.html?$/i.test(entry)) throw new RunError(slug, `entry "${entry}" is not an HTML page`);
  const root = realpathSync(runDir);
  const files = new Map<string, DemoFile>();
  const vendor = new Map<string, VendorFile>();
  const substitutions: Substitution[] = [];
  const pages: Array<{ rel: string; html: string; parsed: Parsed; subs: Substitution[] }> = [];
  let total = 0;
  const queue: Array<{ ref: string; fromDir: string; what: string }> = [{ ref: entry, fromDir: root, what: 'entry' }];

  while (queue.length) {
    const { ref, fromDir, what } = queue.shift()!;
    const clean = ref.split(/[?#]/)[0];
    let decoded: string;
    try {
      decoded = decodeURIComponent(clean);
    } catch {
      throw new RunError(slug, `${what} "${ref}" is not a valid URL path`);
    }
    if (decoded.startsWith('/')) throw new RunError(slug, `${what} "${ref}" is an absolute path; demos may use relative paths only`);
    const abs = confinedFile(root, decoded, slug, what, fromDir);
    const rel = path.relative(root, abs).split(path.sep).join('/');
    if (files.has(rel)) continue;
    const ext = path.extname(rel).slice(1).toLowerCase();
    if (ext === 'svg') throw new RunError(slug, `${what} "${rel}" is an SVG file; demos can't serve SVG, which runs script without the demo's content security policy`);
    if (!ALLOWED_EXTENSIONS.includes(ext)) throw new RunError(slug, `${what} "${rel}" has a file type demos can't serve (.${ext})`);
    const bytes = readFileSync(abs);
    total += bytes.length;
    if (total > MAX_DEMO_BYTES) throw new RunError(slug, `demo files exceed 5 MB`);
    const dir = path.dirname(abs);
    const follow = (r: string, kind: string) => {
      if (skippable(r)) return;
      if (isRemote(r)) throw new RunError(slug, `${rel} loads ${r} from another host, which the vendor map doesn't cover`);
      queue.push({ ref: r, fromDir: dir, what: `${kind} in ${rel}` });
    };
    const scanCss = (text: string) => {
      for (const m of text.matchAll(CSS_URL_RE)) follow((m[2] ?? m[4]).trim(), 'stylesheet reference');
    };
    const scanJs = (text: string) => {
      for (const m of text.matchAll(JS_IMPORT_RE)) {
        const spec = m[2] ?? m[4] ?? m[6];
        if (isRemote(spec) || spec.startsWith('.') || spec.startsWith('/')) follow(spec, 'script import');
      }
    };

    if (ext === 'css') scanCss(bytes.toString('utf8'));
    if (ext === 'js' || ext === 'mjs') scanJs(bytes.toString('utf8'));
    if (ext !== 'html') {
      files.set(rel, { rel, bytes });
      continue;
    }

    const html = bytes.toString('utf8');
    const parsed = parsePage(html);
    const subs: Substitution[] = [];
    for (const el of elements(parsed.doc)) {
      const name = el.tagName;
      const loc = el.sourceCodeLocation?.startTag;
      const a = new Map(el.attrs.map((x) => [x.name, x.value]));
      if (a.has('style')) scanCss(a.get('style')!);
      if (name === 'style') scanCss(textOf(el));
      if (name === 'script' && !a.has('src')) scanJs(textOf(el));
      if (name !== 'link' && !URL_ATTRS[name]) continue;
      if (!loc) continue; // made by the parser, not written in the page
      const tag = html.slice(parsed.bom + loc.startOffset, parsed.bom + loc.endOffset);
      // The tag with one attribute's value replaced, keeping everything else.
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
          vendor.set(g.css.out, g.css);
          for (const f of g.files) vendor.set(f.out, f);
          subs.push({ file: rel, from: tag, to: withAttr('href', `${opts.urlBase}_vendor/${g.out}`), label: `fonts ${g.families.join(', ')} (instead of fonts.googleapis.com)` });
          continue;
        }
        if (isRemote(href)) throw new RunError(slug, `${rel} loads ${href} from another host, which the vendor map doesn't cover`);
        follow(href, 'link');
        continue;
      }
      for (const attr of URL_ATTRS[name]) {
        const v = a.get(attr);
        if (v === undefined) continue;
        const refs = attr === 'srcset' ? v.split(',').map((s) => s.trim().split(/\s+/)[0]) : [v.trim()];
        for (const r of refs) {
          if (name === 'script' && isRemote(r) && SCRIPTS[r]) {
            const s = SCRIPTS[r];
            vendor.set(s.out, { out: s.out, bytes: readFileSync(path.join(opts.nodeModules, s.pkg, s.file)) });
            subs.push({ file: rel, from: tag, to: withAttr('src', `${opts.urlBase}_vendor/${s.out}`), label: s.label });
            continue;
          }
          follow(r, `${name} ${attr}`);
        }
      }
    }

    pages.push({ rel, html, parsed, subs });
    files.set(rel, { rel, bytes });
  }

  // Head insertions need the whole file set: the storage stand-in goes in only
  // if some file in the demo uses web storage.
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
    // Tag swaps apply everywhere; the head insertion only at its anchor.
    const swapped = subs.reduce((text, s) => text.replaceAll(s.from, s.to), original);
    // Only a doctype and comments precede the anchor (locateHead). A swap
    // inside one of those comments would shift it, and fails here.
    if (!swapped.startsWith(anchor, anchorAt)) throw new RunError(slug, `${rel}: the <head> moved while editing, so the policy couldn't be placed`);
    const html = swapped.slice(0, anchorAt) + inserted + swapped.slice(anchorAt + anchor.length);
    subs.push(...headEdits);
    substitutions.push(...subs);
    files.set(rel, { rel, bytes: Buffer.from(html) });
  }

  return { entry: path.relative(root, confinedFile(root, entry, slug, 'entry')).split(path.sep).join('/'), files: [...files.values()], vendor: [...vendor.values()], substitutions };
}

// Undoes a page's substitutions, newest first. Tests use it to show the served
// page is the original plus exactly the recorded edits.
export function reverseSubstitutions(served: string, subs: Substitution[]): string {
  return [...subs].reverse().reduce((text, s) => text.replaceAll(s.to, s.from), served);
}
