// WHY: A production build must confirm the listed repositories are public. Fixture builds and local development can run without GitHub.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { APPS, GITHUB_OWNER, PARTS } from '../data/parts';

export type RepoFacts = { name: string; private: boolean; created_at: string; pushed_at: string };
export type GitHubRead = { read_at: string; repos: RepoFacts[] };
export type Signal = { created: string; pushed: string };
export type Signals =
  | { status: 'ok'; readAt: string; byRepo: Map<string, Signal> }
  | { status: 'unavailable'; reason: string };

const day = (iso: string) => iso.slice(0, 10);

export function signalsFrom(read: GitHubRead, wanted: string[]): Map<string, Signal> {
  const byName = new Map(read.repos.filter((r) => !r.private).map((r) => [r.name, r]));
  const missing = wanted.filter((w) => !byName.has(w));
  if (missing.length) {
    throw new Error(`github: not public repositories of ${GITHUB_OWNER}: ${missing.join(', ')}. The parts list names public repositories only.`);
  }
  return new Map(wanted.map((w) => [w, { created: day(byName.get(w)!.created_at), pushed: day(byName.get(w)!.pushed_at) }]));
}

export function weeksSince(pushed: string, readAt: string): number {
  return Math.max(0, Math.floor((Date.parse(readAt) - Date.parse(pushed)) / (7 * 864e5)));
}

async function fetchRead(): Promise<GitHubRead> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'davisbuilds.net-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repos: RepoFacts[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/users/${GITHUB_OWNER}/repos?type=owner&per_page=100&page=${page}`, { headers });
    if (!res.ok) throw new Error(`github: listing repositories failed (${res.status})`);
    const batch = (await res.json()) as RepoFacts[];
    repos.push(...batch.map(({ name, private: p, created_at, pushed_at }) => ({ name, private: p, created_at, pushed_at })));
    if (batch.length < 100) break;
  }
  return { read_at: new Date().toISOString(), repos };
}

const wanted = () => [...PARTS.map((p) => p.repo), ...APPS.flatMap((a) => (a.repo ? [a.repo] : []))];

let cached: Promise<Signals> | undefined;

export function loadSignals(): Promise<Signals> {
  cached ??= (async (): Promise<Signals> => {
    try {
      const read: GitHubRead = process.env.DAVISBUILDS_FIXTURES
        ? JSON.parse(readFileSync(path.join(process.cwd(), 'tests/fixtures/github/repos.json'), 'utf8'))
        : await fetchRead();
      return { status: 'ok', readAt: read.read_at, byRepo: signalsFrom(read, wanted()) };
    } catch (e) {
      if (!import.meta.env.DEV) throw e;
      console.warn(`${(e as Error).message}; rendering last signals as unavailable`);
      return { status: 'unavailable', reason: (e as Error).message };
    }
  })();
  return cached;
}
