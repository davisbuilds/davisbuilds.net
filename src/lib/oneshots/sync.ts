// Reads a checkout of the oneshots repository's runs/ directory, validates
// every run, and only then writes the site's copies. If any
// run fails, nothing is written, so no file from a bad run reaches the build.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectDemo, type Demo } from './demo.ts';
import { confinedFile, IMAGE_EXTENSIONS, readImage } from './files.ts';
import { labOf, parseManifest, RunError } from './manifest.ts';
import type { SyncedData, SyncedRun } from './types.ts';

// Release tag → names of the assets attached to it.
export type ReleaseIndex = Map<string, Set<string>>;

export type SyncOptions = {
  runsDir: string;
  releases: ReleaseIndex;
  source: SyncedData['source'];
  generatedDir: string; // src/generated/oneshots
  publicDir: string; // public/oneshots
  nodeModules: string;
};

const MAX_PREVIEWS = 12;
const MAX_BRIEF_BYTES = 64 * 1024;

const caption = (file: string) => path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ');
export const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

// oneshots RUNS.md: a line reading exactly this comes before messages sent
// after the work was delivered (repository moves, PR requests). The page
// shows the brief up to it and links to the full file.
export const DELIVERY_MARKER = '<!-- after delivery -->';

// The indexes of lines outside fenced code blocks, where a marker counts. A
// prompt that shows the marker in a code sample is quoting it. Same rule as
// the oneshots validator (scripts/validate_runs.py).
function proseLines(lines: string[]): number[] {
  const out: number[] = [];
  let fence: string | null = null;
  lines.forEach((line, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      // A closer is the fence character alone, at least as long, then only
      // whitespace; anything else on the line is still code.
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !line.slice(m[0].length).trim()) fence = null;
    } else if (m) fence = m[1];
    else out.push(i);
  });
  return out;
}

export function splitBrief(text: string, dir: string): { brief: string; afterDelivery: boolean } {
  const lines = text.split('\n');
  const prose = proseLines(lines.map((l) => l.replace(/\r$/, '')));
  const line = (i: number) => lines[i].replace(/\r$/, '');
  const at = prose.filter((i) => line(i) === DELIVERY_MARKER);
  // A marker in another case or spacing would leave the later messages on
  // the page unnoticed. Other typos aren't caught.
  // Only a line that is itself a comment (indented under 4 spaces, so not
  // code) counts: a prompt may quote the marker inline.
  const near = prose.map(line).find((l) => l !== DELIVERY_MARKER && /^ {0,3}<!--/.test(l) && /after\s*delivery/i.test(l));
  if (near) throw new RunError(dir, `brief line "${near.trim()}" looks like the delivery marker; write it exactly as ${DELIVERY_MARKER}`);
  if (at.length > 1) throw new RunError(dir, `brief has more than one ${DELIVERY_MARKER} line`);
  if (at.length === 0) return { brief: text, afterDelivery: false };
  const before = lines.slice(0, at[0]).join('\n').trimEnd();
  if (!before) throw new RunError(dir, `brief has nothing before its ${DELIVERY_MARKER} line`);
  return { brief: `${before}\n`, afterDelivery: true };
}

type Staged = { run: SyncedRun; images: { name: string; bytes: Buffer }[]; demo: Demo | null };

function stageRun(runsDir: string, dir: string, opts: SyncOptions): Staged {
  const runDir = path.join(runsDir, dir);
  const m = parseManifest(dir, readFileSync(path.join(runDir, 'run.toml'), 'utf8'));
  const images: Staged['images'] = [];

  let hero: string | null = null;
  if (m.hero) {
    const abs = confinedFile(runDir, m.hero, dir, 'hero');
    images.push({ name: `hero${path.extname(abs).toLowerCase()}`, bytes: readImage(abs, dir, 'hero') });
    hero = images[0].name;
  }

  const previews: SyncedRun['previews'] = [];
  const previewDir = path.join(runDir, 'preview');
  if (existsSync(previewDir)) {
    const names = readdirSync(previewDir)
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase()) && !/^hero\./i.test(f))
      .sort()
      .slice(0, MAX_PREVIEWS);
    for (const f of names) {
      const abs = confinedFile(runDir, `preview/${f}`, dir, 'preview');
      const name = `preview-${f.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
      images.push({ name, bytes: readImage(abs, dir, 'preview') });
      previews.push({ file: name, caption: caption(f) });
    }
  }

  let brief: string | null = null;
  let briefAfterDelivery = false;
  if (m.run.brief !== 'unrecorded') {
    const buf = readFileSync(confinedFile(runDir, m.run.brief, dir, 'brief'));
    if (buf.length > MAX_BRIEF_BYTES) throw new RunError(dir, 'brief is larger than 64 KB');
    ({ brief, afterDelivery: briefAfterDelivery } = splitBrief(buf.toString('utf8'), dir));
  }

  const isHtml = /\.html?$/i.test(m.entry);
  const demo = isHtml ? collectDemo(runDir, dir, m.entry, { nodeModules: opts.nodeModules, urlBase: '/oneshots/' }) : null;
  if (!isHtml) confinedFile(runDir, m.entry, dir, 'entry');

  const tag = `run-${m.slug}`;
  const released = opts.releases.get(tag);
  const { repo, sha } = opts.source;
  const at = (p: string) => `${repo}/blob/${sha}/runs/${m.slug}/${p}`;

  const run: SyncedRun = {
    slug: m.slug,
    title: m.title,
    summary: m.summary,
    date: m.date,
    kind: m.kind,
    medium: m.medium,
    curatorNote: m.curator_note.trim(),
    agent: { model: m.agent.model, modelId: m.agent.model_id ?? null, harness: m.agent.harness, reasoning: m.agent.reasoning ?? null },
    lab: labOf(m.agent),
    humanTurns: typeof m.run.human_turns === 'number' ? m.run.human_turns : null,
    wallClockMinutes: typeof m.run.wall_clock_minutes === 'number' ? m.run.wall_clock_minutes : null,
    brief,
    briefAfterDelivery,
    hero,
    previews,
    links: { tree: `${repo}/tree/${sha}/runs/${m.slug}`, brief: brief ? at(m.run.brief) : null, log: m.run.log ? at(m.run.log) : null },
    demo: demo
      ? {
          src: `/oneshots/${m.slug}/files/${demo.entry}`,
          substitutions: [...new Map(demo.substitutions.map((s) => [s.label, { file: s.file, label: s.label }])).values()],
        }
      : null,
    assets: m.assets.map((a) => ({
      file: a.file,
      description: a.description,
      url: released?.has(a.file) ? `${repo}/releases/download/${tag}/${a.file}` : null,
    })),
    release: { tag, url: released ? `${repo}/releases/tag/${tag}` : null },
  };
  return { run, images, demo };
}

export function syncOneshots(opts: SyncOptions): SyncedData {
  const dirs = readdirSync(opts.runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(opts.runsDir, d.name, 'run.toml')))
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) throw new Error(`oneshots: no runs with a run.toml under ${opts.runsDir}`);

  // Phase 1: validate everything. Any RunError stops here, before any write.
  const staged = dirs.map((d) => stageRun(opts.runsDir, d, opts));

  // Phase 2: write.
  rmSync(opts.generatedDir, { recursive: true, force: true });
  rmSync(opts.publicDir, { recursive: true, force: true });
  for (const { run, images, demo } of staged) {
    const imgDir = path.join(opts.generatedDir, run.slug);
    mkdirSync(imgDir, { recursive: true });
    for (const img of images) writeFileSync(path.join(imgDir, img.name), img.bytes);
    if (!demo) continue;
    for (const f of demo.files) {
      const out = path.join(opts.publicDir, run.slug, 'files', ...f.rel.split('/'));
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, f.bytes);
    }
    for (const v of demo.vendor) {
      const out = path.join(opts.publicDir, '_vendor', ...v.out.split('/'));
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, v.bytes);
    }
  }
  const data: SyncedData = { source: opts.source, runs: staged.map((s) => s.run) };
  const files = Object.fromEntries(
    staged.flatMap(({ run, demo }) => (demo?.files ?? []).map((f) => [`${run.slug}/${f.rel}`, sha256(f.bytes)])),
  );
  writeFileSync(path.join(opts.generatedDir, 'runs.json'), JSON.stringify(data, null, 2));
  writeFileSync(path.join(opts.generatedDir, 'demo-files.json'), JSON.stringify({ source: opts.source.kind, files }, null, 2));
  return data;
}
