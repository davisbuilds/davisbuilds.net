import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APPS, PARTS } from '../../src/data/parts';
import { signalsFrom, weeksSince, type GitHubRead } from '../../src/lib/github';

const fixture: GitHubRead = JSON.parse(readFileSync('tests/fixtures/github/repos.json', 'utf8'));
const wanted = [...PARTS.map((p) => p.repo), ...APPS.flatMap((a) => (a.repo ? [a.repo] : []))];

describe('part signals', () => {
  it('dates every part and app repository from the read', () => {
    const signals = signalsFrom(fixture, wanted);
    expect(signals.size).toBe(wanted.length);
    expect(signals.get('dojo')).toEqual({ created: '2026-01-25', pushed: '2026-09-30' });
  });
  it('fails naming a part that is missing from the read', () => {
    const read = { ...fixture, repos: fixture.repos.filter((r) => r.name !== 'engram') };
    expect(() => signalsFrom(read, wanted)).toThrow(/not public repositories of davisbuilds: engram/);
  });
  it('fails on a private repository, even when the read includes it', () => {
    expect(() => signalsFrom(fixture, [...wanted, 'fixture-private-repo'])).toThrow(/fixture-private-repo/);
  });
  it('gives the private product no repository', () => {
    expect(APPS.find((a) => a.name === 'Habits AI')?.repo).toBeUndefined();
  });
});

describe('freshness', () => {
  it('counts whole weeks since the last push, never negative', () => {
    expect(weeksSince('2026-10-01', '2026-10-01T12:00:00Z')).toBe(0);
    expect(weeksSince('2026-09-17', '2026-10-01T12:00:00Z')).toBe(2);
    expect(weeksSince('2026-10-05', '2026-10-01T12:00:00Z')).toBe(0);
  });
});
