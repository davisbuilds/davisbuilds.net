// The published telemetry document, shared by the page's
// reader and the operator's validator. Every field is allowlisted: a key, a
// label or a number outside these rules fails the check, so nothing but
// aggregate counts can reach /telemetry.json.

export const SCHEMA_VERSION = 1;

const HOUR = 3_600_000;
export const STALE_AFTER_MS = 3 * HOUR;
export const HOST_STALE_AFTER_MS = 48 * HOUR;
export const UNAVAILABLE_AFTER_MS = 7 * 24 * HOUR;

export const STATUSES = ['ok', 'stale', 'unavailable'] as const;
export const PRODUCERS = ['snapshot', 'scheduled'] as const;
export const HOSTS = ['macbook', 'mac-mini'] as const;
export const HARNESSES = ['Codex', 'Claude Code', 'Antigravity', 'OpenCode', 'Pi', 'Cursor', 'Gemini CLI', 'Other'] as const;
// The weekly chart's series: weekly buckets only, so it can't be drawn at the
// wrong spacing (and nothing finer than a day can ever be published).
export const BUCKETS = ['week'] as const;

export type Status = (typeof STATUSES)[number];
export type Host = (typeof HOSTS)[number];
export type Harness = (typeof HARNESSES)[number];

export type GithubSource = {
  status: Status;
  read_at: string | null;
  // Present unless the source is unavailable.
  year?: number;
  contributions_ytd?: number;
  contributions_by_year?: Array<{ year: number; total: number }>;
  pull_requests_30d?: number;
  weekly_contributions?: { bucket: (typeof BUCKETS)[number]; start: string; counts: number[] };
  // An operator-accepted drop in the year-to-date total (validator --accept-decrease).
  accepted_decrease?: { reason: string; previous: number; at: string };
};

export type AgentHost = {
  host: Host;
  status: Status;
  read_at: string;
  since: string;
  sessions_30d: number;
  tokens_30d: number;
  harness: Array<{ name: Harness; sessions: number }>;
};

export type AgentsSource = { status: Status; read_at: string | null; hosts: AgentHost[] };

export type TelemetryDocument = {
  schema: typeof SCHEMA_VERSION;
  generated_at: string;
  producer: (typeof PRODUCERS)[number];
  sources: { github: GithubSource; agents: AgentsSource };
};

export type Check<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// A small strict checker: each reader records errors under a path, and an
// object check fails on any key it wasn't told about.
type Errors = string[];
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Free text the operator types (an accepted decrease's reason): words and
// punctuation only, so it can't carry markup even if a renderer slipped.
const REASON = /^[A-Za-z0-9 .,;:'()\-]{1,200}$/;

function keys(x: Record<string, unknown>, path: string, required: string[], optional: string[], e: Errors): boolean {
  const before = e.length;
  for (const k of required) if (!(k in x)) e.push(`${path}.${k}: missing`);
  for (const k of Object.keys(x)) if (!required.includes(k) && !optional.includes(k)) e.push(`${path}.${k}: not an allowed field`);
  return e.length === before;
}
function count(x: unknown, path: string, e: Errors): void {
  if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0) e.push(`${path}: not a non-negative whole number`);
}
function oneOf(x: unknown, allowed: readonly string[], path: string, e: Errors): void {
  if (typeof x !== 'string' || !allowed.includes(x)) e.push(`${path}: not one of ${allowed.join(', ')}`);
}
function calendarDate(x: unknown): boolean {
  if (typeof x !== 'string' || !DATE.test(x)) return false;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}
function date(x: unknown, path: string, e: Errors): void {
  if (!calendarDate(x)) e.push(`${path}: not a calendar date (YYYY-MM-DD)`);
}
function timestamp(x: unknown, path: string, e: Errors): void {
  if (typeof x !== 'string' || !TIMESTAMP.test(x) || !calendarDate(x.slice(0, 10)) || Number.isNaN(Date.parse(x))) {
    e.push(`${path}: not a UTC timestamp`);
  }
}
function list(x: unknown, path: string, max: number, e: Errors, each: (item: unknown, path: string) => void, min = 0): void {
  if (!Array.isArray(x)) return void e.push(`${path}: not a list`);
  if (x.length < min) e.push(`${path}: fewer than ${min} entries`);
  if (x.length > max) e.push(`${path}: more than ${max} entries`);
  x.forEach((item, i) => each(item, `${path}[${i}]`));
}
// Status and read_at are common to every source; an unavailable source may
// carry nothing else, and any other status must carry every field.
function head(x: Record<string, unknown>, path: string, e: Errors): boolean {
  oneOf(x.status, STATUSES, `${path}.status`, e);
  if (x.read_at === null && x.status !== 'unavailable') e.push(`${path}.read_at: only an unavailable source may have no reading`);
  else if (x.read_at !== null) timestamp(x.read_at, `${path}.read_at`, e);
  return x.status === 'unavailable';
}

function github(x: unknown, path: string, e: Errors): void {
  if (!isObject(x)) return void e.push(`${path}: not an object`);
  const data = ['year', 'contributions_ytd', 'contributions_by_year', 'pull_requests_30d', 'weekly_contributions'];
  const bare = head(x, path, e) && data.every((k) => !(k in x));
  if (!keys(x, path, bare ? ['status', 'read_at'] : ['status', 'read_at', ...data], ['accepted_decrease'], e)) return;
  if (bare) return;
  count(x.year, `${path}.year`, e);
  count(x.contributions_ytd, `${path}.contributions_ytd`, e);
  count(x.pull_requests_30d, `${path}.pull_requests_30d`, e);
  list(x.contributions_by_year, `${path}.contributions_by_year`, 50, e, (y, p) => {
    if (!isObject(y)) return void e.push(`${p}: not an object`);
    if (!keys(y, p, ['year', 'total'], [], e)) return;
    count(y.year, `${p}.year`, e);
    count(y.total, `${p}.total`, e);
  });
  const w = x.weekly_contributions, wp = `${path}.weekly_contributions`;
  if (!isObject(w)) e.push(`${wp}: not an object`);
  else if (keys(w, wp, ['bucket', 'start', 'counts'], [], e)) {
    oneOf(w.bucket, BUCKETS, `${wp}.bucket`, e);
    date(w.start, `${wp}.start`, e);
    list(w.counts, `${wp}.counts`, 60, e, (n, p) => count(n, p, e), 1);
  }
  if ('accepted_decrease' in x) {
    const a = x.accepted_decrease, ap = `${path}.accepted_decrease`;
    if (!isObject(a)) e.push(`${ap}: not an object`);
    else if (keys(a, ap, ['reason', 'previous', 'at'], [], e)) {
      if (typeof a.reason !== 'string' || !REASON.test(a.reason)) e.push(`${ap}.reason: only words and plain punctuation, up to 200 characters`);
      count(a.previous, `${ap}.previous`, e);
      timestamp(a.at, `${ap}.at`, e);
    }
  }
}

function agentHost(x: unknown, path: string, e: Errors): void {
  if (!isObject(x)) return void e.push(`${path}: not an object`);
  if (!keys(x, path, ['host', 'status', 'read_at', 'since', 'sessions_30d', 'tokens_30d', 'harness'], [], e)) return;
  oneOf(x.host, HOSTS, `${path}.host`, e);
  oneOf(x.status, STATUSES, `${path}.status`, e);
  timestamp(x.read_at, `${path}.read_at`, e);
  date(x.since, `${path}.since`, e);
  count(x.sessions_30d, `${path}.sessions_30d`, e);
  count(x.tokens_30d, `${path}.tokens_30d`, e);
  list(x.harness, `${path}.harness`, HARNESSES.length, e, (h, p) => {
    if (!isObject(h)) return void e.push(`${p}: not an object`);
    if (!keys(h, p, ['name', 'sessions'], [], e)) return;
    oneOf(h.name, HARNESSES, `${p}.name`, e);
    count(h.sessions, `${p}.sessions`, e);
  });
}

function agents(x: unknown, path: string, e: Errors): void {
  if (!isObject(x)) return void e.push(`${path}: not an object`);
  if (!keys(x, path, ['status', 'read_at', 'hosts'], [], e)) return;
  head(x, path, e);
  list(x.hosts, `${path}.hosts`, HOSTS.length, e, (h, p) => agentHost(h, p, e));
}

function envelope(x: unknown, e: Errors): x is Record<string, unknown> & { sources: Record<string, unknown> } {
  if (!isObject(x)) return void e.push('document: not an object'), false;
  if (x.schema !== SCHEMA_VERSION) return void e.push(`schema: expected ${SCHEMA_VERSION}, got ${JSON.stringify(x.schema)}`), false;
  if (!keys(x, 'document', ['schema', 'generated_at', 'producer', 'sources'], [], e)) return false;
  timestamp(x.generated_at, 'generated_at', e);
  oneOf(x.producer, PRODUCERS, 'producer', e);
  if (!isObject(x.sources)) return void e.push('sources: not an object'), false;
  return keys(x.sources, 'sources', ['github', 'agents'], [], e);
}

/** The whole document, strictly: any error rejects it (the validator's gate). */
export function checkDocument(x: unknown): Check<TelemetryDocument> {
  const e: Errors = [];
  if (envelope(x, e)) {
    github(x.sources.github, 'sources.github', e);
    agents(x.sources.agents, 'sources.agents', e);
  }
  return e.length ? { ok: false, errors: e } : { ok: true, value: x as TelemetryDocument };
}

/**
 * The page's read: an unknown schema makes every source unavailable, and a
 * source that fails its own check is unavailable while the other still renders.
 */
export function readDocument(x: unknown): { github: GithubSource | null; agents: AgentsSource | null } {
  if (!envelope(x, [])) return { github: null, agents: null };
  const valid = <T>(check: (v: unknown, p: string, e: Errors) => void, v: unknown): T | null => {
    const e: Errors = [];
    check(v, 'source', e);
    return e.length ? null : (v as T);
  };
  return { github: valid<GithubSource>(github, x.sources.github), agents: valid<AgentsSource>(agents, x.sources.agents) };
}

/** Milliseconds since `readAt`; a reading from the future (a slow clock) is 0. */
export function ageMs(readAt: string, now: number): number {
  return Math.max(0, now - Date.parse(readAt));
}

export function ageLabel(readAt: string, now: number): string {
  const m = Math.floor(ageMs(readAt, now) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

/** Stale when the producer said so or the reading is over 3 hours old. */
export function isStale(source: { status: Status; read_at: string | null }, now: number): boolean {
  return source.status === 'stale' || source.read_at === null || ageMs(source.read_at, now) > STALE_AFTER_MS;
}

/** The agent readouts: every host that isn't unavailable, summed. */
export function agentTotals(agents: AgentsSource): {
  sessions_30d: number;
  tokens_30d: number;
  since: string | null;
  harness: Array<{ name: Harness; sessions: number }>;
  stale_hosts: Array<{ host: Host; read_at: string }>;
} {
  const live = agents.hosts.filter((h) => h.status !== 'unavailable');
  const harness = new Map<Harness, number>();
  for (const h of live) for (const { name, sessions } of h.harness) harness.set(name, (harness.get(name) ?? 0) + sessions);
  return {
    sessions_30d: live.reduce((n, h) => n + h.sessions_30d, 0),
    tokens_30d: live.reduce((n, h) => n + h.tokens_30d, 0),
    since: live.map((h) => h.since).sort()[0] ?? null,
    harness: [...harness].map(([name, sessions]) => ({ name, sessions })).sort((a, b) => b.sessions - a.sessions),
    stale_hosts: live.filter((h) => h.status === 'stale').map(({ host, read_at }) => ({ host, read_at })),
  };
}
