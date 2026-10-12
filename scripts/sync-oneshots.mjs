// Fetches the oneshots repository at the pinned commit and writes the site's
// copies of its runs. Reads files only; nothing from that
// repository runs here.
//
//   node scripts/sync-oneshots.mjs [--since <sha>]
//
// To review a lock bump, it lists the demo files that differ from a baseline:
// the commit in the lock at HEAD when the working lock differs from it, or
// the commit given with --since. Both sides go through the current sync code,
// so the list shows what changed in the oneshots repository.
//
// DAVISBUILDS_ONESHOTS=<dir> reads <dir>/runs and <dir>/releases.json instead
// (fixtures). GITHUB_TOKEN, if set, raises the GitHub API rate limit.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syncOneshots } from '../src/lib/oneshots/sync.ts';

const root = path.resolve(import.meta.dirname, '..');
const generatedDir = path.join(root, 'src/generated/oneshots');
const publicDir = path.join(root, 'public/oneshots');
const nodeModules = path.join(root, 'node_modules');

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

// Only the pinned commit's bytes may be published, so a cached checkout is
// reset and cleaned (tracked edits, untracked and ignored files) before use.
function checkout(repo, sha) {
  const dir = path.join(root, '.cache/oneshots', sha);
  if (existsSync(path.join(dir, '.git'))) {
    try {
      if (git(dir, 'rev-parse', 'HEAD') === sha) {
        git(dir, 'reset', '-q', '--hard', sha);
        git(dir, 'clean', '-q', '-ffdx');
        if (git(dir, 'status', '--porcelain', '--untracked-files=all', '--ignored') === '') return dir;
      }
    } catch {}
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'remote', 'add', 'origin', `${repo}.git`);
  git(dir, 'sparse-checkout', 'set', 'runs');
  git(dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', sha);
  git(dir, 'checkout', '-q', 'FETCH_HEAD');
  const head = git(dir, 'rev-parse', 'HEAD');
  if (head !== sha) throw new Error(`oneshots: checked out ${head}, expected ${sha}`);
  return dir;
}

async function releasesFromGitHub(repo) {
  const api = repo.replace('https://github.com/', 'https://api.github.com/repos/');
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'davisbuilds.net-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`${api}/releases?per_page=100`, { headers });
  if (!res.ok) throw new Error(`oneshots: GitHub releases request failed (${res.status}); the build can't tell which run assets are published`);
  const list = await res.json();
  return new Map(list.map((r) => [r.tag_name, new Set(r.assets.map((a) => a.name))]));
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

let opts;
if (process.env.DAVISBUILDS_ONESHOTS) {
  const dir = path.resolve(root, process.env.DAVISBUILDS_ONESHOTS);
  const releases = readJson(path.join(dir, 'releases.json'));
  opts = {
    runsDir: path.join(dir, 'runs'),
    releases: new Map(Object.entries(releases).map(([tag, assets]) => [tag, new Set(assets)])),
    source: { kind: 'fixtures', repo: 'https://example.com/oneshots', sha: 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1' },
  };
} else {
  const lock = readJson(path.join(root, 'src/data/oneshots.lock.json'));
  if (!/^[0-9a-f]{40}$/.test(lock.sha)) throw new Error('oneshots: the lock needs a full 40-character commit SHA');
  opts = {
    runsDir: path.join(checkout(lock.repo, lock.sha), 'runs'),
    releases: await releasesFromGitHub(lock.repo),
    source: { kind: 'repository', repo: lock.repo, sha: lock.sha },
  };
}

const data = syncOneshots({ ...opts, generatedDir, publicDir, nodeModules });

const label = data.source.kind === 'repository' ? `${data.source.repo} @ ${data.source.sha.slice(0, 7)}` : 'fixtures';
const runnable = data.runs.filter((r) => r.demo).length;
console.log(`oneshots: ${data.runs.length} runs from ${label}; ${runnable} runnable demos`);

if (data.source.kind === 'repository') {
  const since = process.argv.includes('--since') ? process.argv[process.argv.indexOf('--since') + 1] : null;
  let base = since;
  if (!base) {
    let committed = null;
    try {
      committed = JSON.parse(execFileSync('git', ['show', 'HEAD:src/data/oneshots.lock.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    } catch {
      console.log('  (no lock at HEAD to compare with; pass --since <sha> to list changed demo files)');
    }
    if (committed && committed.sha !== data.source.sha) base = committed.sha;
    else if (committed) console.log('  (lock unchanged since HEAD; pass --since <sha> to list demo files changed since another commit)');
  }
  if (base) {
    if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('oneshots: --since needs a full 40-character commit SHA');
    const tmp = mkdtempSync(path.join(tmpdir(), 'oneshots-baseline-'));
    try {
      syncOneshots({ ...opts, runsDir: path.join(checkout(data.source.repo, base), 'runs'), source: { ...data.source, sha: base }, generatedDir: path.join(tmp, 'generated'), publicDir: path.join(tmp, 'public'), nodeModules });
      const before = readJson(path.join(tmp, 'generated/demo-files.json')).files;
      const after = readJson(path.join(generatedDir, 'demo-files.json')).files;
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => before[k] !== after[k]).sort();
      console.log(`  demo files changed since ${base.slice(0, 7)}: ${changed.length}`);
      for (const k of changed) console.log(`  ${!(k in before) ? 'added  ' : !(k in after) ? 'removed' : 'changed'} ${k}`);
    } catch (e) {
      console.log(`  baseline ${base.slice(0, 7)} doesn't sync with the current code, so every demo file is new to review: ${e.message}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}
