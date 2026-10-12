// The weekly contributions chart and its crosshair: built from the telemetry
// series with DOM calls only (no markup strings), so a value can never become
// an element. Pointer or touch reads any week into the caption.
const NS = 'http://www.w3.org/2000/svg';
// The chart is drawn at its box's width (one unit is about one CSS pixel), so
// labels keep their size and nothing scrolls on a phone. Redrawn on resize.
const W_MIN = 260, W_MAX = 760, L = 40, R = 8, T = 18, B = 26;
const MONTH_GAP = 26; // a three-letter month label at 10px, plus air
const WEEK = 7 * 86_400_000;

type Attrs = Record<string, string | number>;
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

// A round axis top: the first 1, 2 or 5 step that fits the peak in 4 ticks.
// Bounded, so a value that isn't a finite count can't spin it forever.
function axisMax(peak: number): { max: number; step: number } {
  if (!Number.isFinite(peak) || peak < 1) peak = 1;
  for (let mag = 1; mag < 1e15; mag *= 10) {
    for (const m of [1, 2, 5]) {
      const step = m * mag;
      if (step * 4 >= peak) return { max: step * 4, step };
    }
  }
  return { max: 4, step: 1 };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function weeklyChart(host: HTMLElement, read: HTMLElement, series: { start: string; counts: number[] }): void {
  if (series.counts.length === 0) return;
  let drawn = 0;
  const draw = () => {
    const W = Math.round(Math.min(W_MAX, Math.max(W_MIN, host.clientWidth || W_MAX)));
    if (W === drawn) return;
    drawn = W;
    host.replaceChildren(chart(W, read, series));
  };
  draw();
  new ResizeObserver(draw).observe(host);
}

function chart(W: number, read: HTMLElement, series: { start: string; counts: number[] }): SVGSVGElement {
  const { counts } = series;
  const H = Math.round(Math.min(230, Math.max(170, W * 0.42)));
  const start = Date.parse(`${series.start}T00:00:00Z`);
  const weekOf = (i: number) => new Date(start + i * WEEK).toISOString().slice(0, 10);
  const peak = counts.reduce((best, v, i) => (v > counts[best] ? i : best), 0);
  const { max, step } = axisMax(Math.max(1, counts[peak]));
  const pw = W - L - R, ph = H - T - B, bw = pw / counts.length;
  const y = (v: number) => T + ph - (v / max) * ph;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  root.setAttribute('aria-label', `Bar chart of weekly GitHub contributions from the week of ${weekOf(0)} to the week of ${weekOf(counts.length - 1)}, peaking at ${fmt(counts[peak])} in the week of ${weekOf(peak)}.`);
  const pattern = svg('pattern', { id: 'hatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('defs', {}, root));
  svg('rect', { width: 2, height: 4, fill: 'var(--signal)' }, pattern);

  for (let t = 0; t <= max; t += step) {
    svg('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), stroke: 'var(--rule)', 'stroke-width': 1, ...(t ? { 'stroke-dasharray': '2 3' } : {}) }, root);
    svg('text', { x: L - 6, y: y(t) + 3.5, 'text-anchor': 'end', class: 'axis' }, root).textContent = fmt(t);
  }
  counts.forEach((v, i) => {
    const h = (v / max) * ph;
    const fill = i === counts.length - 1 ? 'url(#hatch)' : i === peak ? 'var(--signal)' : 'var(--ink)';
    const gap = bw < 6 ? 0.5 : 1;
    svg('rect', { class: 'bar', x: (L + i * bw + gap).toFixed(1), y: (T + ph - h).toFixed(1), width: (bw - 2 * gap).toFixed(1), height: h.toFixed(1), fill }, root);
  });
  // One label per month, skipping any that would crowd the one before it.
  let lastMonth = -1, lastX = -Infinity;
  counts.forEach((_, i) => {
    const d = new Date(start + i * WEEK);
    if (d.getUTCMonth() === lastMonth) return;
    lastMonth = d.getUTCMonth();
    const x = L + i * bw;
    if (x - lastX < MONTH_GAP || x + MONTH_GAP - 6 > W) return;
    lastX = x;
    svg('text', { x: x.toFixed(1), y: H - 8, class: 'axis' }, root).textContent = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  });

  const cross = svg('g', { opacity: 0, 'pointer-events': 'none' }, root);
  const cx = svg('line', { y1: T, y2: T + ph, stroke: 'var(--signal)', 'stroke-width': 1 }, cross);
  const cy = svg('line', { x1: L, x2: W - R, stroke: 'var(--signal)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, cross);
  const tagBg = svg('rect', { width: 34, height: 14, fill: 'var(--signal)' }, cross);
  const tag = svg('text', { class: 'tag', 'text-anchor': 'middle' }, cross);

  const verb = matchMedia('(hover: hover)').matches ? 'hover' : 'tap';
  const idle = () => read.replaceChildren('Peak ', bold(fmt(counts[peak])), ` · week of ${weekOf(peak)} · ${verb} to read any week`);
  const at = (clientX: number) => {
    const r = root.getBoundingClientRect();
    const i = Math.max(0, Math.min(counts.length - 1, Math.floor(((clientX - r.left) / r.width * W - L) / bw)));
    const v = counts[i], px = L + i * bw + bw / 2, py = y(v), ty = Math.max(1, py - 17);
    cx.setAttribute('x1', String(px)); cx.setAttribute('x2', String(px));
    cy.setAttribute('y1', String(py)); cy.setAttribute('y2', String(py));
    tag.textContent = fmt(v); tag.setAttribute('x', String(px)); tag.setAttribute('y', String(ty + 10.5));
    tagBg.setAttribute('x', String(px - 17)); tagBg.setAttribute('y', String(ty));
    cross.setAttribute('opacity', '1');
    read.replaceChildren('Week of ', bold(weekOf(i)), ' · ', bold(fmt(v)), ` contributions${i === counts.length - 1 ? ' · in progress' : ''}`);
  };
  root.addEventListener('pointermove', (e) => at(e.clientX));
  root.addEventListener('pointerdown', (e) => at(e.clientX));
  // A finger lifting also fires pointerleave; a tapped week stays until the next tap.
  root.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    cross.setAttribute('opacity', '0');
    idle();
  });

  idle();
  return root;
}

function bold(text: string): HTMLElement {
  const b = document.createElement('b');
  b.textContent = text;
  return b;
}
