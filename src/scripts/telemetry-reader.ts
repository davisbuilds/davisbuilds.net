// The telemetry reader: fills every [data-readout] from
// /telemetry.json. Values go in with textContent and DOM calls only, so the
// document is always data. A source that's missing, invalid or unavailable
// says "unavailable" (with its last reading when there was one), never zero;
// one older than 3 hours renders stale. Ages count from each source's read_at
// and refresh every minute.
import { ageLabel, agentTotals, isStale, readDocument, type AgentsSource, type GithubSource } from '../lib/telemetry-schema';
import { odometer } from './odometer';
import { weeklyChart } from './crosshair';

type Source = { status: GithubSource['status']; read_at: string | null };
type Sources = { github: GithubSource | null; agents: AgentsSource | null };
type Render = (el: HTMLElement, sources: Sources, now: number) => void;

const fmt = (n: number) => n.toLocaleString('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel);

// Mark a readout's state and age. Returns false when there's nothing to show.
function state(el: HTMLElement, source: Source | null, now: number): boolean {
  const usable = source !== null && source.status !== 'unavailable';
  const stale = usable && isStale(source, now);
  el.dataset.state = !usable ? 'unavailable' : stale ? 'stale' : 'ok';
  el.classList.toggle('is-stale', stale);
  const read = $(el, '[data-read]');
  if (read) {
    if (source?.read_at) read.dataset.readAt = source.read_at;
    else delete read.dataset.readAt;
    read.textContent = readText(el.dataset.state, source?.read_at ?? null, now, source === null);
  }
  const label = $(el, '[data-state]');
  if (label) {
    label.classList.toggle('live', el.dataset.state === 'ok');
    label.classList.toggle('stale-label', stale);
    if (el.dataset.state === 'ok') label.replaceChildren(document.createElement('i'), 'reading');
    else label.textContent = stale ? 'stale reading' : 'no reading';
  }
  if (!usable) {
    const v = $(el, '[data-value]');
    if (v) { v.textContent = 'unavailable'; v.classList.add('unavailable'); }
  }
  return usable;
}

function readText(state: string | undefined, readAt: string | null, now: number, invalid: boolean): string {
  if (!readAt) return invalid ? 'no valid reading' : 'no reading yet';
  const stamp = `${readAt.slice(0, 10)} · ${ageLabel(readAt, now)}`;
  return state === 'unavailable' ? `last read ${stamp}` : state === 'stale' ? `stale · ${stamp}` : stamp;
}

function value(el: HTMLElement, text: string, roll: boolean): void {
  const v = $(el, '[data-value]');
  if (!v) return;
  v.classList.remove('unavailable');
  if (roll) odometer(v, text);
  else v.textContent = text;
}

const RENDER: Record<string, Render> = {
  'contributions-ytd'(el, { github }, now) {
    if (!state(el, github, now)) return;
    value(el, fmt(github!.contributions_ytd!), true);
    const year = $(el, '[data-year]');
    if (year) year.textContent = String(github!.year);
    const years = $(el, '[data-years]');
    if (!years) return;
    const rows = github!.contributions_by_year!;
    const top = Math.max(1, ...rows.map((r) => r.total));
    years.replaceChildren(...rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'yr';
      const track = document.createElement('span');
      track.className = 'track';
      const fill = document.createElement('span');
      fill.className = 'fill';
      fill.style.width = `${((r.total / top) * 100).toFixed(2)}%`;
      track.append(fill);
      const y = document.createElement('span');
      y.textContent = String(r.year);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = fmt(r.total);
      row.append(y, track, n);
      return row;
    }));
    years.hidden = false;
  },
  'pull-requests-52w'(el, { github }, now) {
    if (state(el, github, now)) value(el, fmt(github!.pull_requests_52w!), true);
  },
  'weekly-contributions'(el, { github }, now) {
    if (!state(el, github, now)) return;
    const chart = $(el, '[data-chart]'), cross = $(el, '[data-cross]');
    if (chart && cross) weeklyChart(chart, cross, github!.weekly_contributions!);
  },
  'agent-sessions-30d'(el, { agents }, now) {
    if (state(el, agents, now)) value(el, fmt(agentTotals(agents!).sessions_30d), true);
    hosts(el, agents, now);
  },
  'tokens-30d'(el, { agents }, now) {
    if (state(el, agents, now)) value(el, compact.format(agentTotals(agents!).tokens_30d), true);
    hosts(el, agents, now);
  },
  'harness-sessions'(el, { agents }, now) {
    if (!state(el, agents, now)) return;
    const list = $(el, '.harness');
    const t = agentTotals(agents!);
    list?.replaceChildren(...t.harness.map(({ name, sessions }) => {
      const row = document.createElement('div');
      const a = document.createElement('span');
      a.textContent = name;
      const b = document.createElement('span');
      b.textContent = fmt(sessions);
      row.append(a, b);
      return row;
    }));
    const since = $(el, '[data-since]');
    if (since && t.since) since.textContent = `sessions since ${t.since}`;
  },
  'harness-mix'(el, { agents }, now) {
    // Line 132 says unavailable, or holds the segment labels; line 146 is the
    // total and the reading's age, which state() keeps current.
    const empty = $(el, '[data-empty]'), total = $(el, '[data-total]');
    if (!state(el, agents, now)) return;
    if (empty) empty.textContent = '';
    const { harness } = agentTotals(agents!);
    const sum = harness.reduce((n, h) => n + h.sessions, 0);
    const NS = 'http://www.w3.org/2000/svg';
    const colors = ['var(--signal)', 'var(--ink)', 'var(--muted)', 'var(--rule)'];
    const bar = $(el, '[data-bar]');
    let x = 12;
    bar?.replaceChildren(...harness.flatMap(({ name, sessions }, i) => {
      const w = sum ? (sessions / sum) * 276 : 0;
      const rect = document.createElementNS(NS, 'rect');
      for (const [k, v] of Object.entries({ x: x.toFixed(1), y: 104, width: Math.max(1, w - 1).toFixed(1), height: 14 })) rect.setAttribute(k, String(v));
      rect.style.fill = colors[Math.min(i, colors.length - 1)];
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${name}: ${fmt(sessions)}`;
      rect.append(title);
      const out: Element[] = [rect];
      if (w > 40) {
        const label = document.createElementNS(NS, 'text');
        label.textContent = `${name} ${Math.round((sessions / sum) * 100)}%`;
        // Mono at 9px is about 5.4 units a character: a label that would run
        // past the bar's end is right-aligned to it instead.
        const fits = x + 4 + label.textContent.length * 5.4 <= 288;
        label.setAttribute('x', fits ? (x + 4).toFixed(1) : '288');
        if (!fits) label.setAttribute('text-anchor', 'end');
        label.setAttribute('y', '132');
        out.push(label);
      }
      x += w;
      return out;
    }));
    if (total) total.textContent = `${fmt(sum)} sessions · `;
  },
};

// Agent tiles note any host that has gone quiet: still counted, and named.
function hosts(el: HTMLElement, agents: AgentsSource | null, now: number): void {
  const note = $(el, '[data-hosts]');
  if (!note || !agents) return;
  const quiet = agentTotals(agents).stale_hosts;
  note.textContent = quiet.map((h) => `${h.host} last reported ${ageLabel(h.read_at, now)}`).join(' · ');
  note.hidden = quiet.length === 0;
}

function render(sources: Sources): void {
  const now = Date.now();
  for (const el of document.querySelectorAll<HTMLElement>('[data-readout]')) RENDER[el.dataset.readout!]?.(el, sources, now);
}

// Keep every age and the stale state current without re-rendering values:
// state() only touches a value to say "unavailable", which it already says.
const GITHUB_READOUTS = ['contributions-ytd', 'pull-requests-52w', 'weekly-contributions'];
function tick(sources: Sources): void {
  const now = Date.now();
  for (const el of document.querySelectorAll<HTMLElement>('[data-readout]')) {
    const github = GITHUB_READOUTS.includes(el.dataset.readout!);
    state(el, github ? sources.github : sources.agents, now);
    if (!github) hosts(el, sources.agents, now);
  }
}

async function load(): Promise<void> {
  if (!document.querySelector('[data-readout]')) return;
  let res: Response;
  try {
    res = await fetch('/telemetry.json', { cache: 'no-cache' });
  } catch {
    return; // Offline: the page already says "unavailable".
  }
  if (!res.ok) return;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const sources = readDocument(body);
  render(sources);
  setInterval(() => tick(sources), 60_000);
}

void load();
