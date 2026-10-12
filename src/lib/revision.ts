// The build's revision, shown in the title block's "Rev." cell: the short
// commit SHA and its date, read from git when the site is built.
import { execFileSync } from 'node:child_process';

export type Revision = { sha: string; date: string; dirty: boolean };

export type Git = (args: string[]) => string;

const runGit: Git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Returns null when git can't describe the build (no repository, no commits).
export function readRevision(git: Git = runGit): Revision | null {
  try {
    const [sha, date] = git(['log', '-1', '--format=%h%n%cs', '--abbrev=7']).trim().split('\n');
    if (!/^[0-9a-f]{7,}$/.test(sha ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null;
    // Untracked files count: a new essay is published from the working tree.
    const dirty = git(['status', '--porcelain', '--untracked-files=normal']).trim() !== '';
    return { sha, date, dirty };
  } catch {
    return null;
  }
}
