import { describe, expect, it } from 'vitest';
import { readRevision, type Git } from '../../src/lib/revision';

const fakeGit = (log: string, porcelain: string): Git => (args) => (args[0] === 'log' ? log : porcelain);

describe('readRevision', () => {
  it('reads the short SHA and commit date of a clean build', () => {
    expect(readRevision(fakeGit('2197a8f\n2026-10-07\n', ''))).toEqual({ sha: '2197a8f', date: '2026-10-07', dirty: false });
  });

  it('marks a build with uncommitted changes as dirty', () => {
    expect(readRevision(fakeGit('2197a8f\n2026-10-07\n', ' M src/pages/index.astro\n'))?.dirty).toBe(true);
  });

  it('counts untracked files, such as a new essay, as uncommitted changes', () => {
    const calls: string[][] = [];
    const git: Git = (args) => {
      calls.push(args);
      return args[0] === 'log' ? '2197a8f\n2026-10-07\n' : '?? src/content/writing/new-essay.md\n';
    };
    expect(readRevision(git)?.dirty).toBe(true);
    expect(calls.find((a) => a[0] === 'status')).toContain('--untracked-files=normal');
  });

  it('returns null when git fails or prints something unexpected', () => {
    expect(readRevision(() => { throw new Error('not a git repository'); })).toBeNull();
    expect(readRevision(fakeGit('fatal: bad\n', ''))).toBeNull();
    expect(readRevision(fakeGit('', ''))).toBeNull();
  });

  it('reads this repository (control: the real git path works)', () => {
    expect(readRevision()?.sha).toMatch(/^[0-9a-f]{7,}$/);
  });
});
