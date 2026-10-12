// What a new reading may publish, given the last published document. The
// snapshot applies these before it
// validates; the validator re-checks the year-to-date rule on the result.
import { ageMs, HOST_STALE_AFTER_MS, UNAVAILABLE_AFTER_MS, type AgentHost, type AgentsSource, type GithubSource, type Status, type TelemetryDocument } from './telemetry-schema.ts';

export type RuleOptions = {
  now: number;
  // GitHub returned the known 2024 total, so a zero from it is believable.
  githubControlOk: boolean;
  // Operator-only: publish a lower year-to-date total, recording why.
  acceptDecrease?: string;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const aged = (readAt: string | null, now: number, staleAfter: number): Status =>
  readAt === null || ageMs(readAt, now) > UNAVAILABLE_AFTER_MS ? 'unavailable' : ageMs(readAt, now) > staleAfter ? 'stale' : 'ok';

/** A source whose read failed: its last values, stale, or unavailable after 7 days. */
export function carryForward<S extends GithubSource | AgentsSource>(previous: S | undefined, now: number): S {
  if (!previous) return { status: 'unavailable', read_at: null } as S;
  return { ...previous, status: aged(previous.read_at, now, -1) === 'unavailable' ? 'unavailable' : 'stale' };
}

/**
 * This run's hosts plus every earlier host, which stays listed: stale
 * after 48 hours without a report, unavailable after 7 days. The source is as
 * old as its oldest counted host.
 */
export function mergeHosts(fresh: AgentHost[], previous: AgentHost[], now: number): AgentsSource {
  const seen = new Set(fresh.map((h) => h.host));
  const carried = previous.filter((h) => !seen.has(h.host)).map((h) => ({ ...h, status: aged(h.read_at, now, HOST_STALE_AFTER_MS) }));
  const hosts = [...fresh, ...carried];
  const counted = hosts.filter((h) => h.status !== 'unavailable');
  const status: Status = counted.length === 0 ? 'unavailable' : counted.some((h) => h.status === 'stale') ? 'stale' : 'ok';
  const oldest = counted.map((h) => h.read_at).sort()[0] ?? hosts.map((h) => h.read_at).sort().at(-1) ?? null;
  return { status, read_at: oldest, hosts };
}

const allTime = (h: AgentHost) => h.harness.reduce((n, x) => n + x.sessions, 0);

// The positive controls. GitHub has reported 21 contributions for 2024 since
// it was first measured, so a source that still says so is reading what it
// should; an agent host's store is intact when its all-time sessions held.
export const GITHUB_CONTROL = { year: 2024, total: 21 } as const;
export const githubControlPasses = (s: GithubSource) =>
  s.contributions_by_year?.some((y) => y.year === GITHUB_CONTROL.year && y.total === GITHUB_CONTROL.total) ?? false;
const GITHUB_COUNTS = ['contributions_ytd', 'pull_requests_52w'] as const;
const AGENT_COUNTS = ['sessions_30d', 'tokens_30d'] as const;
const zeroed = <T,>(next: T, prev: T, keys: readonly (keyof T)[]) => keys.filter((k) => next[k] === 0 && (prev[k] as number) > 0);
const hostHeld = (next: AgentHost, prev: AgentHost) => allTime(next) > 0 && allTime(next) >= allTime(prev);

function githubRules(next: GithubSource, prev: GithubSource | undefined, opts: RuleOptions, notes: string[]): GithubSource {
  if (next.status === 'unavailable' || !prev || prev.status === 'unavailable' && prev.contributions_ytd === undefined) return next;
  const refuse = (why: string) => (notes.push(`github: ${why}; published unavailable with the previous reading`), { ...prev, status: 'unavailable' as const });
  if (next.year === prev.year && next.contributions_ytd! < prev.contributions_ytd!) {
    if (!opts.acceptDecrease) return refuse(`year-to-date fell from ${fmt(prev.contributions_ytd!)} to ${fmt(next.contributions_ytd!)} (a decrease needs --accept-decrease)`);
    notes.push(`github: accepted a year-to-date decrease from ${fmt(prev.contributions_ytd!)}: ${opts.acceptDecrease}`);
    return { ...next, accepted_decrease: { reason: opts.acceptDecrease, previous: prev.contributions_ytd!, at: new Date(opts.now).toISOString().replace('.000Z', 'Z') } };
  }
  const zeros = zeroed(next, prev, GITHUB_COUNTS);
  if (zeros.length && !opts.githubControlOk) return refuse(`${zeros.join(', ')} turned zero and the ${GITHUB_CONTROL.year} control failed`);
  return next;
}

// An agent host's zero is believable only when its all-time session count
// held: the store is still there and still being read. A host refused before
// keeps its last good values, so the same bogus zero is refused again.
function hostRules(next: AgentHost, prev: AgentHost | undefined, notes: string[]): AgentHost {
  if (!prev) return next;
  if (!zeroed(next, prev, AGENT_COUNTS).length || hostHeld(next, prev)) return next;
  notes.push(`agents/${next.host}: a 30-day count turned zero while all-time sessions fell; published unavailable`);
  return { ...prev, status: 'unavailable' };
}

export function applyRules(
  candidate: TelemetryDocument,
  previous: TelemetryDocument | null,
  opts: RuleOptions,
): { document: TelemetryDocument; notes: string[] } {
  const notes: string[] = [];
  const prev = previous?.sources;
  const github = githubRules(candidate.sources.github, prev?.github, opts, notes);
  const prevHosts = new Map((prev?.agents.hosts ?? []).map((h) => [h.host, h]));
  const hosts = candidate.sources.agents.hosts.map((h) => hostRules(h, prevHosts.get(h.host), notes));
  const changed = hosts.some((h, i) => h !== candidate.sources.agents.hosts[i]);
  const agents = changed ? mergeHosts(hosts, [], opts.now) : candidate.sources.agents;
  return { document: { ...candidate, sources: { github, agents } }, notes };
}

/**
 * The validator's re-check of a finished document against the last published
 * one, so a candidate built any other way meets the same rules: no
 * year-to-date drop without a recorded acceptance, and no zero after a
 * non-zero unless the document itself shows its control passing.
 */
export function checkAgainstPrevious(doc: TelemetryDocument, previous: TelemetryDocument | null): string[] {
  const errors: string[] = [];
  const next = doc.sources.github, prev = previous?.sources.github;
  if (prev && next.status !== 'unavailable' && prev.contributions_ytd !== undefined) {
    if (next.year === prev.year && next.contributions_ytd! < prev.contributions_ytd! && next.accepted_decrease?.previous !== prev.contributions_ytd) {
      errors.push(`sources.github.contributions_ytd: fell from ${fmt(prev.contributions_ytd)} to ${fmt(next.contributions_ytd!)} within ${next.year} with no accepted_decrease`);
    }
    if (!githubControlPasses(next)) {
      for (const k of zeroed(next, prev, GITHUB_COUNTS)) errors.push(`sources.github.${k}: turned zero without a passing ${GITHUB_CONTROL.year} control`);
    }
  }
  const prevHosts = new Map((previous?.sources.agents.hosts ?? []).map((h) => [h.host, h]));
  doc.sources.agents.hosts.forEach((h, i) => {
    const p = prevHosts.get(h.host);
    if (!p || h.status === 'unavailable' || hostHeld(h, p)) return;
    for (const k of zeroed(h, p, AGENT_COUNTS)) errors.push(`sources.agents.hosts[${i}].${k}: turned zero while all-time sessions fell`);
  });
  return errors;
}
