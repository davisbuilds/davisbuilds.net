#!/usr/bin/env node
// The operator's telemetry snapshot. It reads GitHub with the
// owner's `gh` login and this host's agentmonitor through its read-only CLI,
// applies the publishing rules against the last published document, validates
// the result, and writes the candidate. It emits aggregates only: no project,
// repository or session names reach the document.
//
//   node scripts/telemetry/snapshot.mjs [--dry-run] [--previous <published.json>]
//                                       [--out <candidate.json>] [--accept-decrease "<reason>"]
//
// --dry-run prints the document instead of writing it. Exit 1 means the
// document failed validation (nothing written); exit 3 means it was written
// but a source couldn't be read and was carried forward (a failed run).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkDocument, HOSTS, SCHEMA_VERSION } from '../../src/lib/telemetry-schema.ts';
import { CANDIDATE, PUBLISHED } from './state.mjs';
import { applyRules, carryForward, checkAgainstPrevious, GITHUB_CONTROL, githubControlPasses, mergeHosts } from '../../src/lib/telemetry-rules.ts';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    previous: { type: 'string' },
    out: { type: 'string' },
    'accept-decrease': { type: 'string' },
  },
});

const previousPath = values.previous ?? PUBLISHED;
const outPath = values.out ?? CANDIDATE;

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const day = (ms) => iso(ms).slice(0, 10);
const DAY = 86_400_000;
const failures = [];

function loadPrevious() {
  if (!existsSync(previousPath)) return null;
  const checked = checkDocument(JSON.parse(readFileSync(previousPath, 'utf8')));
  if (!checked.ok) throw new Error(`${previousPath} is not a valid published document:\n  ${checked.errors.join('\n  ')}`);
  return checked.value;
}

// ---------- GitHub ----------
// The weekly series is GitHub's own trailing-year calendar (the profile
// graph), which stays inside the API's one-year limit on any weekday.
// The control year (GITHUB_CONTROL, shared with the validator) must be in
// the per-year totals, so the published document carries its own proof.
const FIRST_YEAR = GITHUB_CONTROL.year;

async function readGithub() {
  const year = new Date(now).getUTCFullYear();
  const years = Array.from({ length: year - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);
  const query = `query($prFrom: DateTime!, $now: DateTime!) {
    viewer {
      ${years.map((y) => `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y === year ? iso(now) : `${y}-12-31T23:59:59Z`}") { contributionCalendar { totalContributions } }`).join('\n      ')}
      weekly: contributionsCollection { contributionCalendar { weeks { firstDay contributionDays { contributionCount } } } }
      prs: contributionsCollection(from: $prFrom, to: $now) { totalPullRequestContributions }
    }
  }`;
  const token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'davisbuilds.net-telemetry' },
    body: JSON.stringify({ query, variables: { prFrom: iso(now - 30 * DAY), now: iso(now) } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL answered ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  const v = body.data.viewer;
  const byYear = years.map((y) => ({ year: y, total: v[`y${y}`].contributionCalendar.totalContributions }));
  const control = byYear.find((y) => y.year === GITHUB_CONTROL.year).total;
  const weeks = v.weekly.contributionCalendar.weeks;
  return {
    control,
    source: {
      status: 'ok',
      read_at: iso(now),
      year,
      contributions_ytd: byYear.at(-1).total,
      contributions_by_year: byYear,
      pull_requests_30d: v.prs.totalPullRequestContributions,
      weekly_contributions: {
        bucket: 'week',
        start: weeks[0].firstDay,
        counts: weeks.map((w) => w.contributionDays.reduce((n, d) => n + d.contributionCount, 0)),
      },
    },
  };
}

// ---------- agentmonitor ----------
// Its own read contracts (`amon … --json`), so the numbers match its app:
// sessions from Analytics, tokens (every bucket, as its Monitor counts them)
// from Usage. Harness names map onto the allowlist; anything new is "Other".
const HARNESS = { codex: 'Codex', claude: 'Claude Code', claude_code: 'Claude Code', antigravity: 'Antigravity', opencode: 'OpenCode', pi: 'Pi', cursor: 'Cursor', gemini: 'Gemini CLI' };

const host = execFileSync('hostname', ['-s'], { encoding: 'utf8' }).trim();

function readAgents() {
  if (!HOSTS.includes(host)) throw new Error(`host "${host}" is not a reporting host (${HOSTS.join(', ')})`);
  const amon = (...args) => JSON.parse(execFileSync('amon', [...args, '--json'], { encoding: 'utf8', timeout: 60_000 }));
  const range = ['--date-from', day(now - 29 * DAY), '--date-to', day(now)];
  const sessions = amon('analytics', 'summary', ...range).total_sessions;
  const usage = amon('usage', 'summary', ...range);
  const agents = amon('analytics', 'agents').data;
  const harness = new Map();
  for (const a of agents) {
    const name = HARNESS[a.agent] ?? 'Other';
    harness.set(name, (harness.get(name) ?? 0) + a.session_count);
  }
  return {
    host,
    status: 'ok',
    read_at: iso(now),
    since: agents.map((a) => a.first_started_at.slice(0, 10)).sort()[0] ?? day(now),
    sessions_30d: sessions,
    tokens_30d: usage.total_input_tokens + usage.total_output_tokens + usage.total_cache_read_tokens + usage.total_cache_write_tokens,
    harness: [...harness].map(([name, n]) => ({ name, sessions: n })).sort((a, b) => b.sessions - a.sessions),
  };
}

// ---------- assemble ----------
const previous = loadPrevious();
const prev = previous?.sources;

let github, githubControlOk = false;
try {
  const read = await readGithub();
  githubControlOk = githubControlPasses(read.source);
  if (!githubControlOk) throw new Error(`the ${GITHUB_CONTROL.year} control returned ${read.control}, expected ${GITHUB_CONTROL.total}`);
  github = read.source;
} catch (e) {
  failures.push(`github: ${e.message}`);
  github = carryForward(prev?.github, now);
}

let agents;
try {
  agents = mergeHosts([readAgents()], prev?.agents.hosts ?? [], now);
} catch (e) {
  failures.push(`agents: ${e.message}`);
  // This host's read failed: its last report carries forward as stale. Other
  // hosts keep their own 48-hour clock.
  const hosts = prev?.agents.hosts ?? [];
  const own = hosts.find((h) => h.host === host);
  const carried = own ? [{ ...own, status: carryForward(own, now).status }] : [];
  agents = mergeHosts(carried, hosts, now);
}

const candidate = { schema: SCHEMA_VERSION, generated_at: iso(now), producer: 'snapshot', sources: { github, agents } };
const { document, notes } = applyRules(candidate, previous, { now, githubControlOk, acceptDecrease: values['accept-decrease'] });
const checked = checkDocument(document);
const errors = checked.ok ? checkAgainstPrevious(checked.value, previous) : checked.errors;

for (const n of [...failures, ...notes]) console.error(`note: ${n}`);
if (errors.length) {
  console.error('the candidate failed validation; nothing was written:');
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

const g = document.sources.github, a = document.sources.agents;
console.error(`github: ${g.status}${g.contributions_ytd !== undefined ? ` · ${g.contributions_ytd} contributions in ${g.year} · ${g.pull_requests_30d} PRs (30d)` : ''}`);
console.error(`agents: ${a.status} · ${a.hosts.map((h) => `${h.host} ${h.status}: ${h.sessions_30d} sessions, ${h.tokens_30d} tokens (30d)`).join('; ') || 'no hosts'}`);

const json = `${JSON.stringify(document, null, 2)}\n`;
if (values['dry-run']) {
  process.stdout.write(json);
} else {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(`${outPath}.tmp`, json);
  renameSync(`${outPath}.tmp`, outPath);
  console.error(`wrote ${outPath}`);
  console.error('publish it with: node scripts/telemetry/upload.mjs');
}
process.exit(failures.length ? 3 : 0);
