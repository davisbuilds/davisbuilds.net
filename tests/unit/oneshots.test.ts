import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'parse5';
import { afterEach, describe, expect, it } from 'vitest';
import { collectDemo, reverseSubstitutions } from '../../src/lib/oneshots/demo';
import { labOf, parseManifest } from '../../src/lib/oneshots/manifest';
import { computeStats, median, placeLabels, plotPoints, wideCards } from '../../src/lib/oneshots/stats';
import { syncOneshots, type SyncOptions } from '../../src/lib/oneshots/sync';
import type { SyncedRun } from '../../src/lib/oneshots/types';

const NODE_MODULES = path.resolve('node_modules');
const FIXTURES = path.resolve('tests/fixtures/oneshots');
const WEBP = readFileSync(path.join(FIXTURES, 'runs/fixture-demo/preview/hero.webp'));

const temps: string[] = [];
afterEach(() => {
  for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
});

const manifest = (slug: string, extra = '', top = '') => `schema = 1
slug = "${slug}"
title = "Run ${slug}"
summary = "A generated test run."
date = 2026-09-01
kind = "single-file"
medium = ["web"]
${top}
hero = "preview/hero.webp"
entry = "index.html"

[agent]
model = "Claude Opus 5.5"
harness = "test"

[run]
brief = "unrecorded"
human_turns = 1
${extra}`;

const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><p>ok</p></body></html>';

// A runs/ directory with one good run plus `files` (paths relative to runs/).
function makeRuns(files: Record<string, string | Buffer>) {
  const root = mkdtempSync(path.join(tmpdir(), 'oneshots-test-'));
  temps.push(root);
  const all: Record<string, string | Buffer> = {
    'good/run.toml': manifest('good'),
    'good/index.html': PAGE,
    'good/preview/hero.webp': WEBP,
    ...files,
  };
  for (const [rel, body] of Object.entries(all)) {
    const abs = path.join(root, 'runs', rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  const opts: SyncOptions = {
    runsDir: path.join(root, 'runs'),
    releases: new Map(),
    source: { kind: 'fixtures', repo: 'https://example.com/oneshots', sha: 'f'.repeat(40) },
    generatedDir: path.join(root, 'out/generated'),
    publicDir: path.join(root, 'out/public'),
    nodeModules: NODE_MODULES,
  };
  return { root, opts };
}

// A bad run named `bad`: the build must fail naming it, and nothing is written.
function expectRejected(files: Record<string, string | Buffer>, reason: RegExp, setup?: (root: string) => void) {
  const { root, opts } = makeRuns(files);
  setup?.(root);
  expect(() => syncOneshots(opts)).toThrow(/oneshots run "bad"/);
  expect(() => syncOneshots(opts)).toThrow(reason);
  expect(existsSync(opts.generatedDir)).toBe(false);
  expect(existsSync(opts.publicDir)).toBe(false);
}

const badRun = (toml: string, extra: Record<string, string | Buffer> = {}) => ({
  'bad/run.toml': toml,
  'bad/index.html': PAGE,
  'bad/preview/hero.webp': WEBP,
  ...extra,
});

describe('manifest validation', () => {
  it('control: the good template syncs and writes its outputs', () => {
    const { opts } = makeRuns({});
    const data = syncOneshots(opts);
    expect(data.runs.map((r) => r.slug)).toEqual(['good']);
    expect(existsSync(path.join(opts.publicDir, 'good/files/index.html'))).toBe(true);
    expect(existsSync(path.join(opts.generatedDir, 'good/hero.webp'))).toBe(true);
  });

  it('rejects an unknown schema version, naming the run', () => {
    expectRejected(badRun(manifest('bad').replace('schema = 1', 'schema = 2')), /unsupported manifest schema 2/);
  });

  it('rejects a date that is not a real day, quoted or not', () => {
    const withDate = (d: string) => badRun(manifest('bad').replace('date = 2026-09-01', `date = ${d}`));
    expectRejected(withDate('"2026-99-99"'), /date/);
    expectRejected(withDate('"2026-02-29"'), /date/);
    // TOML parsers roll an impossible unquoted day over (to March 3), so the raw text is checked.
    expectRejected(withDate('2026-02-31'), /date.*2026-02-31/);
  });
  it('control: accepts a leap day, quoted or not', () => {
    for (const d of ['2028-02-29', '"2028-02-29"']) {
      const { opts } = makeRuns({ 'good/run.toml': manifest('good').replace('date = 2026-09-01', `date = ${d}`) });
      expect(syncOneshots(opts).runs[0].date).toBe('2028-02-29');
    }
  });

  it('rejects malformed TOML', () => {
    expectRejected(badRun('schema = 1\ntitle = "unterminated'), /not valid TOML/);
  });

  it('rejects a missing required field', () => {
    expectRejected(badRun(manifest('bad').replace('title = "Run bad"\n', '')), /title/);
  });

  it('rejects a slug that does not match its directory', () => {
    expectRejected(badRun(manifest('other')), /does not match its directory/);
  });

  it('rejects a long-horizon run without a log', () => {
    expectRejected(badRun(manifest('bad').replace('kind = "single-file"', 'kind = "long-horizon"')), /hero and run.log/);
  });

  it('accepts "unrecorded" counts and reads labs from model names', () => {
    const m = parseManifest('x', manifest('x').replace('human_turns = 1', 'human_turns = "unrecorded"'));
    expect(m.run.human_turns).toBe('unrecorded');
    expect(labOf({ model: 'GPT-6 Astra', harness: 'Codex' })).toBe('openai');
    expect(labOf({ model: 'Fable 5', harness: 'x' })).toBe('anthropic');
    expect(labOf({ model: 'Other', harness: 'x' })).toBe('other');
  });
});

describe('brief and the after-delivery marker', () => {
  const withBrief = (slug: string, text: string) => ({
    [`${slug}/run.toml`]: manifest(slug).replace('brief = "unrecorded"', 'brief = "brief.md"'),
    [`${slug}/index.html`]: PAGE,
    [`${slug}/preview/hero.webp`]: WEBP,
    [`${slug}/brief.md`]: text,
  });
  const BRIEF = '# Brief\n\n> Build the thing.\n\n## Mid-run\n\n> Approved\n';
  const LATER = '## After delivery\n\n> Now open a PR.\n';

  it('control: a brief without the marker is shown whole', () => {
    const { opts } = makeRuns(withBrief('good', BRIEF + LATER));
    const run = syncOneshots(opts).runs[0];
    expect(run.brief).toBe(BRIEF + LATER);
    expect(run.briefAfterDelivery).toBe(false);
  });

  it('control: a prompt that quotes the marker is neither a cut nor an error', () => {
    const quoted = `${BRIEF}> Please add \`<!-- after delivery -->\` support\n`;
    const { opts } = makeRuns(withBrief('good', quoted));
    const run = syncOneshots(opts).runs[0];
    expect(run.brief).toBe(quoted);
    expect(run.briefAfterDelivery).toBe(false);
  });

  it('control: a marker shown in a code sample is neither a cut nor an error', () => {
    for (const sample of ['```\n<!-- after delivery -->\n```\n', '```\n``` still code\n<!-- after delivery -->\n```\n', '~~~md\n<!-- after  delivery -->\n~~~\n', '    <!-- after delivery -->\n']) {
      const { opts } = makeRuns(withBrief('good', `${BRIEF}\n${sample}`));
      const run = syncOneshots(opts).runs[0];
      expect(run.briefAfterDelivery, sample).toBe(false);
      expect(run.brief, sample).toContain(sample);
    }
  });

  it('stops the brief at the marker and says so', () => {
    const { opts } = makeRuns(withBrief('good', `${BRIEF}\n<!-- after delivery -->\n\n${LATER}`));
    const run = syncOneshots(opts).runs[0];
    expect(run.brief).toBe(BRIEF);
    expect(run.brief).not.toContain('open a PR');
    expect(run.briefAfterDelivery).toBe(true);
    expect(run.links.brief).toBe(`https://example.com/oneshots/blob/${'f'.repeat(40)}/runs/good/brief.md`);
  });

  it('rejects a near miss, a second marker, and a marker with nothing before it', () => {
    expectRejected(withBrief('bad', `${BRIEF}<!-- after delivery-->\n${LATER}`), /after delivery.*exactly/);
    expectRejected(withBrief('bad', `${BRIEF}  <!-- After Delivery\n${LATER}`), /After Delivery.*exactly/);
    expectRejected(withBrief('bad', `${BRIEF}<!-- after  delivery -->\n${LATER}`), /after  delivery.*exactly/);
    // After a closed fence the marker counts again.
    expectRejected(withBrief('bad', `${BRIEF}\`\`\`\nx\n\`\`\`\n<!-- after delivery -->\n${LATER}<!-- after delivery -->\n`), /more than one/);
    expectRejected(withBrief('bad', `${BRIEF}<!-- after delivery -->\n${LATER}<!-- after delivery -->\n`), /more than one/);
    expectRejected(withBrief('bad', `<!-- after delivery -->\n${LATER}`), /nothing before/);
  });
});

describe('hero confinement', () => {
  const withHero = (hero: string, extra: Record<string, string | Buffer> = {}) =>
    badRun(manifest('bad').replace('hero = "preview/hero.webp"', `hero = "${hero}"`), extra);

  it('rejects a hero outside the run directory', () => {
    expectRejected(withHero('../good/preview/hero.webp'), /points outside the run directory/);
  });
  it('rejects a remote hero', () => {
    expectRejected(withHero('https://example.com/hero.webp'), /is a URL/);
  });
  it('rejects an absolute hero path', () => {
    expectRejected(withHero('/etc/hosts'), /absolute path/);
  });
  it('rejects a hero that is not an image by extension or by content', () => {
    expectRejected(withHero('notes.txt', { 'bad/notes.txt': 'hello' }), /is not an image/);
    expectRejected(withHero('preview/fake.webp', { 'bad/preview/fake.webp': 'not really a webp' }), /not a valid webp/);
  });
  it('rejects a symlinked hero', () => {
    expectRejected(withHero('preview/link.webp'), /symlink/, (root) =>
      symlinkSync(path.join(root, 'runs/good/preview/hero.webp'), path.join(root, 'runs/bad/preview/link.webp')),
    );
  });
});

describe('demo file set', () => {
  const withPage = (head: string, body = '', extra: Record<string, string | Buffer> = {}) =>
    badRun(manifest('bad'), { 'bad/index.html': `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`, ...extra });

  it('rejects a reference outside the run directory', () => {
    expectRejected(withPage('<script src="../good/index.html"></script>'), /points outside the run directory/);
  });
  it('rejects a symlinked demo file', () => {
    expectRejected(withPage('<script src="app.js"></script>'), /symlink/, (root) =>
      symlinkSync(path.join(root, 'runs/good/index.html'), path.join(root, 'runs/bad/app.js')),
    );
  });
  it('rejects a disallowed file type', () => {
    expectRejected(withPage('<script src="tool.py"></script>', '', { 'bad/tool.py': 'print(1)' }), /file type demos can't serve/);
  });
  it('rejects an SVG file, which runs script and loads from any host when opened as a document', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("https://example.com/x")</script></svg>';
    expectRejected(withPage('<iframe src="icon.svg"></iframe>', '', { 'bad/icon.svg': svg }), /SVG/);
    expectRejected(withPage('<img src="icon.svg">', '', { 'bad/icon.svg': svg }), /SVG/);
  });
  it('reads tags as a browser does, so a ">" inside a quoted attribute hides no reference', () => {
    expectRejected(withPage('', '<img alt="1 > 0" src="missing.webp">'), /missing\.webp" does not exist/);
    expectRejected(withPage('<script data-note="a>b" src="https://unpkg.com/three@0.160.0/build/three.module.js"></script>'), /unpkg\.com.*vendor map/);
  });
  it('rejects a demo larger than 5 MB', () => {
    expectRejected(withPage('<script src="big.js"></script>', '', { 'bad/big.js': Buffer.alloc(5 * 1024 * 1024 + 1, 32) }), /exceed 5 MB/);
  });
  it('rejects a missing referenced file', () => {
    expectRejected(withPage('<script src="missing.js"></script>'), /does not exist/);
  });
  it('rejects a site-absolute path', () => {
    expectRejected(withPage('<script src="/app.js"></script>'), /absolute path/);
  });
  it('rejects a third-party script the vendor map does not cover', () => {
    expectRejected(withPage('<script src="https://unpkg.com/three@0.160.0/build/three.module.js"></script>'), /unpkg\.com.*vendor map/);
  });
  it('rejects a Google font family the vendor map does not cover', () => {
    expectRejected(withPage('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Comic+Neue&display=swap">'), /font "Comic Neue"/);
  });
  it('rejects remote loads in CSS and in script imports', () => {
    expectRejected(withPage('<style>@import "https://cdn.example.com/x.css";</style>'), /cdn\.example\.com/);
    expectRejected(withPage('<script type="module">import x from "https://esm.sh/x";</script>'), /esm\.sh/);
  });
  it('rejects a connection hint to an unmapped host', () => {
    expectRejected(withPage('<link rel="preconnect" href="https://cdn.example.com">'), /connection hint to cdn\.example\.com/);
  });
  it('rejects anything that runs or loads before the <head> (and so before the policy)', () => {
    const page = (pre: string) => badRun(manifest('bad'), { 'bad/index.html': `${pre}<head><meta charset="utf-8"></head><body></body></html>`, 'bad/x.webp': WEBP });
    expectRejected(page('<!doctype html><script>fetch("https://example.com")</script>'), /content before its <head>/);
    expectRejected(page('<!doctype html><html><img src="x.webp">'), /content before its <head>/);
    expectRejected(page('<!-- <head> --><!doctype html><p>'), /content before its <head>/);
  });
  it('parses comments as a browser does, so a malformed one cannot hide a script before the policy', () => {
    const page = (pre: string) => badRun(manifest('bad'), { 'bad/index.html': `${pre}<head><meta charset="utf-8"></head><body></body></html>` });
    const script = '<script>fetch("https://example.com")</script>';
    // Each comment ends at its first ">" (or "--!>"), so the script is real markup.
    expectRejected(page(`<!doctype html><!-->${script}-->`), /content before its <head>/);
    expectRejected(page(`<!doctype html><!--->${script}-->`), /content before its <head>/);
    expectRejected(page(`<!doctype html><!-- x --!>${script} -->`), /content before its <head>/);
    expectRejected(page(`<!doctype html><html><!-->${script}-->`), /content before its <head>/);
  });
  it('control: accepts well-formed comments, a BOM, an uppercase doctype and <html> attributes before <head>', () => {
    for (const pre of ['\uFEFF<!DOCTYPE html>', '<!doctype html><!-- a <script> in a comment --><html lang="en">\n<!-- and here -->\n']) {
      const { root } = makeRuns({ 'good/index.html': `${pre}<head><meta charset="utf-8"></head><body><p>ok</p></body></html>` });
      const demo = collectDemo(path.join(root, 'runs/good'), 'good', 'index.html', { nodeModules: NODE_MODULES });
      const served = demo.files[0].bytes.toString('utf8');
      expect(served.indexOf('<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"')).toBeGreaterThan(0);
      expect(reverseSubstitutions(served, demo.substitutions)).toBe(readFileSync(path.join(root, 'runs/good/index.html'), 'utf8'));
    }
  });
  it('inserts the policy once, even when "<head>" appears again later in the page', () => {
    const { root } = makeRuns({ 'good/index.html': '<!doctype html><html><head><meta charset="utf-8"></head><body><script>const doc = "<head><meta charset=\\"utf-8\\">";</script></body></html>' });
    const demo = collectDemo(path.join(root, 'runs/good'), 'good', 'index.html', { nodeModules: NODE_MODULES });
    const served = demo.files[0].bytes.toString('utf8');
    expect(served.split('Content-Security-Policy').length - 1).toBe(1);
    expect(served).toContain('const doc = "<head><meta charset=\\"utf-8\\">";');
    expect(reverseSubstitutions(served, demo.substitutions)).toBe(readFileSync(path.join(root, 'runs/good/index.html'), 'utf8'));
  });
  it('rejects a page with no <head>', () => {
    expectRejected(badRun(manifest('bad'), { 'bad/index.html': '<p>no head</p>' }), /no <head>/);
  });
  it('ignores links and data: URLs, and writes classic scripts into the page', () => {
    const { root } = makeRuns({
      'good/index.html': '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"></head><body><a href="https://example.com/">out</a><script id="m" src="js/main.js"></script></body></html>',
      'good/js/main.js': 'const s = "</script>"; window.ok = s;',
    });
    const demo = collectDemo(path.join(root, 'runs/good'), 'good', 'index.html', { nodeModules: NODE_MODULES });
    const served = demo.files[0].bytes.toString('utf8');
    expect(demo.files.map((f) => f.rel)).toEqual(['index.html']);
    expect(demo.sources.map((f) => f.rel).sort()).toEqual(['index.html', 'js/main.js']);
    expect(served).toContain('<script id="m">const s = "<\\/script>"; window.ok = s;</script>');
    expect(reverseSubstitutions(served, demo.substitutions)).toBe(readFileSync(path.join(root, 'runs/good/index.html'), 'utf8'));
  });
  // The host's bot check answers any request without its cookie with a
  // challenge page, and a sandboxed frame never sends that cookie. So a demo
  // gets exactly one request, its page, and anything else must be written in.
  it('rejects a file the page would still load as a separate request', () => {
    expectRejected(withPage('<link rel="stylesheet" href="a.css">', '', { 'bad/a.css': 'p{}' }), /loads a\.css as a separate request/);
    expectRejected(withPage('', '<img src="x.webp">', { 'bad/x.webp': WEBP }), /loads x\.webp as a separate request/);
    expectRejected(withPage('', '<iframe src="other.html"></iframe>', { 'bad/other.html': PAGE }), /loads other\.html as a separate request/);
    expectRejected(withPage('<script src="a.js"></script>', '', { 'bad/a.js': 'new Worker("./w.js")', 'bad/w.js': '' }), /loads w\.js as a separate request/);
  });
  it('rejects a script that cannot be written in unchanged: a module, deferred, async, or holding "<!--"', () => {
    expectRejected(withPage('<script type="module" src="a.js"></script>', '', { 'bad/a.js': '' }), /a\.js.*module/);
    expectRejected(withPage('<script defer src="a.js"></script>', '', { 'bad/a.js': '' }), /a\.js.*defer/);
    expectRejected(withPage('<script async src="a.js"></script>', '', { 'bad/a.js': '' }), /a\.js.*async/);
    expectRejected(withPage('<script src="a.js"></script>', '', { 'bad/a.js': 'x = "<!--";' }), /a\.js.*<!--/);
  });
});

// What a page loads as separate scripts and stylesheets, read as a browser
// parses it (so markup inside a comment doesn't count).
type Parsed5 = { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Parsed5[]; content?: Parsed5 };
function separateLoads(html: string): string[] {
  const out: string[] = [];
  const walk = (node: Parsed5) => {
    for (const el of [...(node.childNodes ?? []), ...(node.content ? [node.content] : [])]) {
      const attr = (name: string) => el.attrs?.find((a) => a.name === name)?.value;
      if (el.tagName === 'script' && attr('src') !== undefined) out.push(attr('src')!);
      if (el.tagName === 'link' && /\bstylesheet\b/i.test(attr('rel') ?? '')) out.push(attr('href') ?? '');
      walk(el);
    }
  };
  walk(parse(html) as Parsed5);
  return out;
}

describe('vendoring and disclosure', () => {
  const runDir = path.join(FIXTURES, 'runs/fixture-demo');
  const demo = collectDemo(runDir, 'fixture-demo', 'index.html', { nodeModules: NODE_MODULES });
  const original = readFileSync(path.join(runDir, 'index.html'), 'utf8');
  const served = demo.files.find((f) => f.rel === 'index.html')!.bytes.toString('utf8');

  it('reversing the recorded substitutions recovers the original bytes exactly', () => {
    expect(served).not.toBe(original);
    expect(reverseSubstitutions(served, demo.substitutions)).toBe(original);
  });
  it('leaves no third-party URL in a loading position (comments aside)', () => {
    expect(served).toMatch(/<!--<link rel="preconnect" href="https:/);
    expect(served.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/<(script|link)\b[^>]*(src|href)="https?:\/\//);
  });
  it('serves the demo as one page, with its script, d3 and fonts written in', () => {
    expect(demo.files.map((f) => f.rel)).toEqual(['index.html']);
    // Control first: the parser-based detector sees both kinds of load.
    expect(separateLoads('<script src="a.js"></script><!-- <script src="c.js"></script> --><link rel="stylesheet" href="b.css">')).toEqual(['a.js', 'b.css']);
    expect(separateLoads(served)).toEqual([]);
    expect(served).toContain(`<script>${readFileSync(path.join(NODE_MODULES, 'd3/dist/d3.min.js'), 'utf8')}</script>`);
    expect(served).toContain(`<script>${readFileSync(path.join(runDir, 'js/app.js'), 'utf8')}</script>`);
  });
  it('writes fonts in under the Google family names, as data', () => {
    const css = served.slice(served.indexOf('<style>'), served.indexOf('</style>'));
    expect(css).toContain("font-family: 'Doto'");
    expect(css).toContain("font-family: 'IBM Plex Mono'");
    expect(css).not.toContain('Variable');
    expect(css).toMatch(/url\(data:font\/woff2;base64,/);
    expect(css).not.toMatch(/url\((?!data:)/);
  });
  it('puts the CSP after <meta charset> and before every script, with storage support when used', () => {
    const csp = served.indexOf('Content-Security-Policy');
    expect(served.indexOf('<meta charset')).toBeLessThan(csp);
    expect(csp).toBeLessThan(served.indexOf('<script'));
    expect(demo.substitutions.map((s) => s.label)).toContain('in-memory web storage, since the sandbox has none (nothing is saved between visits)');
  });
  it('control: a page without storage gets no stand-in', () => {
    const plain = collectDemo(path.join(FIXTURES, 'runs/fixture-plain'), 'fixture-plain', 'index.html', { nodeModules: NODE_MODULES });
    expect(plain.substitutions.map((s) => s.label)).toEqual(['a content security policy that keeps the demo offline']);
  });
});

describe('stats and layout', () => {
  const run = (slug: string, turns: number | null, minutes: number | null, model = 'M'): SyncedRun =>
    ({ slug, title: slug, humanTurns: turns, wallClockMinutes: minutes, agent: { model } }) as SyncedRun;

  it('computes headline numbers from manifests, skipping unrecorded values', () => {
    const s = computeStats([run('a', 1, 60, 'X'), run('b', 3, 992, 'Y'), run('c', null, null, 'X'), run('d', 2, null, 'Z')]);
    expect(s).toEqual({ runs: 4, models: 3, medianTurns: 2, turnsRecorded: 3, longest: { minutes: 992, title: 'b' } });
    expect(median([])).toBeNull();
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(plotPoints([run('a', 1, 60), run('c', null, 30)]).map((p) => p.slug)).toEqual(['a']);
  });
  it('places plot labels so none overlap a label, a point, or the edge', () => {
    // The live plot's crowded rows: two pairs a label-width apart on one line.
    const area = { left: 48, right: 740, top: 0, bottom: 226 };
    const points = [
      { x: 254, y: 175, text: 'From Gate to Game' },
      { x: 315, y: 175, text: 'Two Kinds of Fire' },
      { x: 330, y: 120, text: 'The Antikythera Engine' },
      { x: 395, y: 120, text: 'One Equation, Three Worlds' },
      { x: 265, y: 66, text: 'Borrowed Seconds' },
      { x: 713, y: 66, text: 'ARTEMIS II' },
    ];
    const W = 6.3;
    const labels = placeLabels(points, area, W);
    const boxes = labels.map((l, i) => {
      expect(l, points[i].text).not.toBeNull();
      const w = points[i].text.length * W;
      const x0 = l!.anchor === 'start' ? l!.x : l!.x - w;
      return { x0, x1: x0 + w, y0: l!.y - 9, y1: l!.y + 3 };
    });
    const hit = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    boxes.forEach((b, i) => {
      expect(b.x0, points[i].text).toBeGreaterThanOrEqual(area.left);
      expect(b.x1, points[i].text).toBeLessThanOrEqual(area.right);
      boxes.forEach((o, j) => { if (j > i) expect(hit(b, o), `${points[i].text} / ${points[j].text}`).toBe(false); });
      points.forEach((p) => expect(hit(b, { x0: p.x - 6, x1: p.x + 6, y0: p.y - 6, y1: p.y + 6 }), `${points[i].text} on a point`).toBe(false));
    });
  });
  it('leaves out a label with no free spot rather than overlapping', () => {
    const area = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(placeLabels([{ x: 50, y: 50, text: 'x'.repeat(40) }], area)).toEqual([null]);
  });
  it('fills every three-column row of long-horizon cards', () => {
    for (let n = 2; n <= 12; n++) {
      const slots = wideCards(n).reduce((sum, w) => sum + (w ? 2 : 1), 0);
      expect(slots % 3, `n=${n}`).toBe(0);
    }
  });
});

describe('fixture sync', () => {
  it('links published assets to the release and marks the rest unpublished', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'oneshots-out-'));
    temps.push(out);
    const releases = JSON.parse(readFileSync(path.join(FIXTURES, 'releases.json'), 'utf8')) as Record<string, string[]>;
    const work = path.join(out, 'runs');
    cpSync(path.join(FIXTURES, 'runs'), work, { recursive: true });
    const data = syncOneshots({
      runsDir: work,
      releases: new Map(Object.entries(releases).map(([t, a]) => [t, new Set(a)])),
      source: { kind: 'fixtures', repo: 'https://example.com/oneshots', sha: 'f'.repeat(40) },
      generatedDir: path.join(out, 'generated'),
      publicDir: path.join(out, 'public'),
      nodeModules: NODE_MODULES,
    });
    const film = data.runs.find((r) => r.slug === 'fixture-film')!;
    expect(film.assets).toEqual([
      { file: 'fixture_film.mp4', description: 'The fixture film', url: 'https://example.com/oneshots/releases/download/run-fixture-film/fixture_film.mp4' },
      { file: 'fixture_still.png', description: 'A still that was never published', url: null },
    ]);
    expect(data.runs.find((r) => r.slug === 'fixture-unreleased')!.release.url).toBeNull();
    expect(data.runs.filter((r) => r.demo).map((r) => r.slug)).toEqual(['fixture-demo', 'fixture-hostile', 'fixture-plain']);
  });
});
