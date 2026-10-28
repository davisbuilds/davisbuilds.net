import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ageLabel,
  agentTotals,
  checkDocument,
  isStale,
  readDocument,
  type AgentHost,
  type TelemetryDocument,
} from '../../src/lib/telemetry-schema';
import { applyRules, carryForward, checkAgainstPrevious, mergeHosts } from '../../src/lib/telemetry-rules';

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/telemetry/${name}.json`, 'utf8'));
const ok = (): TelemetryDocument => fixture('ok');
const at = (iso: string) => Date.parse(iso);
const errorsOf = (x: unknown) => {
  const r = checkDocument(x);
  return r.ok ? [] : r.errors;
};

describe('checkDocument (the validator gate)', () => {
  it('accepts the ok, stale and unavailable fixtures', () => {
    for (const name of ['ok', 'stale', 'unavailable']) expect(errorsOf(fixture(name)), name).toEqual([]);
  });

  it('rejects a field outside the allowlist, naming it', () => {
    expect(errorsOf(fixture('extra-field')).join('\n')).toMatch(/top_project/);
  });

  it('rejects markup in a label', () => {
    expect(errorsOf(fixture('markup')).join('\n')).toMatch(/harness\[0\]\.name/);
  });

  it('rejects an older schema version', () => {
    expect(errorsOf(fixture('old-schema')).join('\n')).toMatch(/schema/);
  });

  it.each([
    ['a negative count', (d: any) => (d.sources.github.pull_requests_30d = -1)],
    ['a fractional count', (d: any) => (d.sources.github.pull_requests_30d = 1.5)],
    ['a numeric string', (d: any) => (d.sources.agents.hosts[0].sessions_30d = '287')],
    ['a series finer than a day', (d: any) => (d.sources.github.weekly_contributions.bucket = 'hour')],
    ['a daily series where the weekly one belongs', (d: any) => (d.sources.github.weekly_contributions.bucket = 'day')],
    ['an empty weekly series', (d: any) => (d.sources.github.weekly_contributions.counts = [])],
    ['a series start with a time', (d: any) => (d.sources.github.weekly_contributions.start = '2025-10-05T00:00:00Z')],
    ['an impossible date', (d: any) => (d.sources.agents.hosts[0].since = '2026-02-30')],
    ['a timestamp with an offset', (d: any) => (d.sources.github.read_at = '2026-10-07T20:55:00+02:00')],
    ['an unknown status', (d: any) => (d.sources.github.status = 'live')],
    ['an unknown host', (d: any) => (d.sources.agents.hosts[0].host = 'laptop')],
    ['a missing count on an ok source', (d: any) => delete d.sources.github.contributions_ytd],
    ['a null read_at on an ok source', (d: any) => (d.sources.github.read_at = null)],
    ['a top-level extra', (d: any) => (d.note = 'hi')],
  ])('rejects %s', (_, mutate) => {
    const d = ok();
    mutate(d);
    expect(errorsOf(d)).not.toEqual([]);
  });

  it('accepts an operator reason made of plain words, and rejects one with markup', () => {
    const d = ok();
    d.sources.github.accepted_decrease = { reason: 'Deleted the 2026 scratch repos (cleanup).', previous: 5800, at: '2026-10-07T20:55:00Z' };
    expect(errorsOf(d)).toEqual([]);
    d.sources.github.accepted_decrease.reason = '<b>cleanup</b>';
    expect(errorsOf(d)).not.toEqual([]);
  });
});

describe('readDocument (the page reader)', () => {
  it('reads both sources of a valid document', () => {
    const r = readDocument(ok());
    expect(r.github?.contributions_ytd).toBe(5755);
    expect(r.agents?.hosts).toHaveLength(1);
  });

  it('treats an unknown schema as every source unavailable', () => {
    expect(readDocument(fixture('old-schema'))).toEqual({ github: null, agents: null });
    expect(readDocument(null)).toEqual({ github: null, agents: null });
    expect(readDocument('<html>')).toEqual({ github: null, agents: null });
  });

  it('drops only the source that fails its check', () => {
    const r = readDocument(fixture('markup'));
    expect(r.agents).toBeNull();
    expect(r.github?.contributions_ytd).toBe(5755);
  });
});

describe('age and staleness', () => {
  const now = at('2026-10-07T21:00:00Z');
  it('labels minutes, hours and days, and a future reading as just now', () => {
    expect(ageLabel('2026-10-07T20:55:00Z', now)).toBe('5m ago');
    expect(ageLabel('2026-10-07T17:00:00Z', now)).toBe('4h ago');
    expect(ageLabel('2026-10-04T21:00:00Z', now)).toBe('3d ago');
    expect(ageLabel('2026-10-07T21:30:00Z', now)).toBe('just now');
  });

  it('is stale over 3 hours even when the producer said ok', () => {
    expect(isStale({ status: 'ok', read_at: '2026-10-07T18:30:00Z' }, now)).toBe(false);
    expect(isStale({ status: 'ok', read_at: '2026-10-07T17:59:00Z' }, now)).toBe(true);
    expect(isStale({ status: 'stale', read_at: '2026-10-07T20:59:00Z' }, now)).toBe(true);
  });
});

const host = (over: Partial<AgentHost>): AgentHost => ({
  host: 'macbook', status: 'ok', read_at: '2026-10-07T20:50:00Z', since: '2026-02-04',
  sessions_30d: 10, tokens_30d: 1000, harness: [{ name: 'Codex', sessions: 5 }], ...over,
});

describe('agentTotals', () => {
  it('sums every host that reports, stale ones included and listed', () => {
    const t = agentTotals({
      status: 'stale', read_at: '2026-10-05T08:00:00Z',
      hosts: [
        host({}),
        host({ host: 'mac-mini', status: 'stale', read_at: '2026-10-05T08:00:00Z', since: '2026-01-10', sessions_30d: 4, tokens_30d: 50, harness: [{ name: 'Codex', sessions: 2 }, { name: 'Pi', sessions: 1 }] }),
      ],
    });
    expect(t).toEqual({
      sessions_30d: 14, tokens_30d: 1050, since: '2026-01-10',
      harness: [{ name: 'Codex', sessions: 7 }, { name: 'Pi', sessions: 1 }],
      stale_hosts: [{ host: 'mac-mini', read_at: '2026-10-05T08:00:00Z' }],
    });
  });

  it('leaves out an unavailable host', () => {
    const t = agentTotals({ status: 'ok', read_at: '2026-10-07T20:50:00Z', hosts: [host({}), host({ host: 'mac-mini', status: 'unavailable', sessions_30d: 99 })] });
    expect(t.sessions_30d).toBe(10);
  });
});

describe('carryForward and mergeHosts (failed reads)', () => {
  it('keeps the last values, stale within 7 days and unavailable after', () => {
    const prev = ok().sources.github;
    expect(carryForward(prev, at('2026-10-09T00:00:00Z'))).toEqual({ ...prev, status: 'stale' });
    expect(carryForward(prev, at('2026-10-15T00:00:00Z'))).toEqual({ ...prev, status: 'unavailable' });
    expect(carryForward(undefined, at('2026-10-09T00:00:00Z'))).toEqual({ status: 'unavailable', read_at: null });
  });

  it('keeps a host that did not report, marking it stale after 48 hours', () => {
    const now = at('2026-10-07T21:00:00Z');
    const mini = host({ host: 'mac-mini', read_at: '2026-10-05T08:00:00Z' });
    const merged = mergeHosts([host({})], [host({ read_at: '2026-10-06T00:00:00Z', sessions_30d: 3 }), mini], now);
    expect(merged.hosts.map((h) => [h.host, h.status, h.sessions_30d])).toEqual([['macbook', 'ok', 10], ['mac-mini', 'stale', 10]]);
    expect(merged.status).toBe('stale');
    expect(merged.read_at).toBe('2026-10-05T08:00:00Z');
  });

  it('marks a host unavailable after 7 days, and the source unavailable with no reporting host', () => {
    const merged = mergeHosts([], [host({ read_at: '2026-09-29T00:00:00Z' })], at('2026-10-07T21:00:00Z'));
    expect(merged.hosts[0].status).toBe('unavailable');
    expect(merged.status).toBe('unavailable');
  });
});

describe('applyRules, with the zero control', () => {
  const now = at('2026-10-07T22:00:00Z');

  it('publishes an ordinary increase as is', () => {
    const next = ok();
    next.sources.github.contributions_ytd = 5760;
    const { document } = applyRules(next, ok(), { now, githubControlOk: true });
    expect(document.sources.github).toEqual(next.sources.github);
  });

  it('never publishes a year-to-date drop: GitHub turns unavailable with the previous reading', () => {
    const { document, notes } = applyRules(fixture('ytd-decrease'), ok(), { now, githubControlOk: true });
    expect(document.sources.github).toEqual({ ...ok().sources.github, status: 'unavailable' });
    expect(notes.join('\n')).toMatch(/5,600.*5,755|decrease/i);
    expect(document.sources.agents).toEqual(fixture('ytd-decrease').sources.agents);
  });

  it('publishes a drop the operator accepted, recording the reason', () => {
    const { document } = applyRules(fixture('ytd-decrease'), ok(), { now, githubControlOk: true, acceptDecrease: 'Deleted scratch repos' });
    expect(document.sources.github.contributions_ytd).toBe(5600);
    expect(document.sources.github.accepted_decrease).toEqual({ reason: 'Deleted scratch repos', previous: 5755, at: '2026-10-07T22:00:00Z' });
  });

  it('resets the year-to-date rule in a new year', () => {
    const next = ok();
    Object.assign(next.sources.github, { year: 2027, contributions_ytd: 3 });
    expect(applyRules(next, ok(), { now, githubControlOk: true }).document.sources.github.status).toBe('ok');
  });

  it('marks a zero after a non-zero unavailable unless the control passes', () => {
    const z = fixture('zero-after-nonzero');
    const failed = applyRules(z, ok(), { now, githubControlOk: false }).document;
    expect(failed.sources.github).toEqual({ ...ok().sources.github, status: 'unavailable' });
    const passed = applyRules(z, ok(), { now, githubControlOk: true }).document;
    expect(passed.sources.github.pull_requests_30d).toBe(0);
  });

  it('treats an agent host zero as believable only if its all-time sessions did not fall', () => {
    const z = fixture('zero-after-nonzero');
    expect(applyRules(z, ok(), { now, githubControlOk: true }).document.sources.agents.hosts[0].sessions_30d).toBe(0);
    z.sources.agents.hosts[0].harness = [];
    const { document } = applyRules(z, ok(), { now, githubControlOk: true });
    expect(document.sources.agents.hosts[0]).toEqual({ ...ok().sources.agents.hosts[0], status: 'unavailable' });
    expect(document.sources.agents.status).toBe('unavailable');
  });
});

describe('applyRules across runs', () => {
  it('keeps refusing the same bogus agent zero on the run after it was refused', () => {
    const bogus = () => {
      const z = fixture('zero-after-nonzero');
      z.sources.agents.hosts[0].harness = [];
      return z;
    };
    const first = applyRules(bogus(), ok(), { now: at('2026-10-07T22:00:00Z'), githubControlOk: true }).document;
    expect(first.sources.agents.hosts[0].status).toBe('unavailable');
    const second = applyRules(bogus(), first, { now: at('2026-10-07T23:00:00Z'), githubControlOk: true }).document;
    expect(second.sources.agents.hosts[0]).toEqual({ ...ok().sources.agents.hosts[0], status: 'unavailable' });
  });

  it('keeps refusing a year-to-date drop on the run after it was refused', () => {
    const first = applyRules(fixture('ytd-decrease'), ok(), { now: at('2026-10-07T22:00:00Z'), githubControlOk: true }).document;
    const second = applyRules(fixture('ytd-decrease'), first, { now: at('2026-10-07T23:00:00Z'), githubControlOk: true }).document;
    expect(second.sources.github).toEqual({ ...ok().sources.github, status: 'unavailable' });
  });
});

describe('checkAgainstPrevious (the validator re-check)', () => {
  it('rejects a published drop without an acceptance, and allows it with one', () => {
    const d = fixture('ytd-decrease');
    expect(checkAgainstPrevious(d, ok())).not.toEqual([]);
    d.sources.github.accepted_decrease = { reason: 'Deleted scratch repos', previous: 5755, at: '2026-10-07T22:00:00Z' };
    expect(checkAgainstPrevious(d, ok())).toEqual([]);
    expect(checkAgainstPrevious(d, null)).toEqual([]);
  });

  it('rejects a GitHub zero after a non-zero unless the document carries a passing 2024 control', () => {
    const z = fixture('zero-after-nonzero');
    z.sources.agents = ok().sources.agents;
    expect(checkAgainstPrevious(z, ok())).toEqual([]);
    z.sources.github.contributions_by_year[0].total = 0;
    expect(checkAgainstPrevious(z, ok()).join('\n')).toMatch(/pull_requests_30d/);
  });

  it('rejects an agent zero after a non-zero when that host\'s all-time sessions fell', () => {
    const z = fixture('zero-after-nonzero');
    z.sources.github = ok().sources.github;
    expect(checkAgainstPrevious(z, ok())).toEqual([]);
    z.sources.agents.hosts[0].harness = [];
    expect(checkAgainstPrevious(z, ok()).join('\n')).toMatch(/hosts\[0\]/);
    z.sources.agents.hosts[0].status = 'unavailable';
    expect(checkAgainstPrevious(z, ok())).toEqual([]);
  });

  it('ignores an unavailable source and a new year', () => {
    const d = fixture('ytd-decrease');
    d.sources.github.status = 'unavailable';
    expect(checkAgainstPrevious(d, ok())).toEqual([]);
  });
});
