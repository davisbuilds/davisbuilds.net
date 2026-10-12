// Headline numbers and plot points, computed from the manifests.
import type { SyncedRun } from './types.ts';

export type Stats = {
  runs: number;
  models: number;
  medianTurns: number | null;
  turnsRecorded: number;
  longest: { minutes: number; title: string } | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeStats(runs: SyncedRun[]): Stats {
  const turns = runs.flatMap((r) => (r.humanTurns === null ? [] : [r.humanTurns]));
  const timed = runs.filter((r) => r.wallClockMinutes !== null).sort((a, b) => b.wallClockMinutes! - a.wallClockMinutes!);
  return {
    runs: runs.length,
    models: new Set(runs.map((r) => r.agent.model)).size,
    medianTurns: median(turns),
    turnsRecorded: turns.length,
    longest: timed[0] ? { minutes: timed[0].wallClockMinutes!, title: timed[0].title } : null,
  };
}

// Runs that recorded both values, for the autonomy plot.
export const plotPoints = (runs: SyncedRun[]) =>
  runs.flatMap((r) => (r.humanTurns !== null && r.wallClockMinutes !== null ? [{ slug: r.slug, title: r.title, model: r.agent.model, minutes: r.wallClockMinutes, turns: r.humanTurns }] : []));

export type PlotLabel = { x: number; y: number; anchor: 'start' | 'end' };
export type PlotArea = { left: number; right: number; top: number; bottom: number };

// Places each point's label beside it, trying spots in order (right above,
// right below, left above, left below, then level) and taking the first that
// stays inside `area` and clears every point and every label already placed.
// A label with no free spot is left out (null); the tooltip still names it.
export function placeLabels(points: { x: number; y: number; text: string }[], area: PlotArea, charWidth = 6.3): (PlotLabel | null)[] {
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const dots: Box[] = points.map((p) => ({ x0: p.x - 7, x1: p.x + 7, y0: p.y - 7, y1: p.y + 7 }));
  const spots: [number, number, PlotLabel['anchor']][] = [[12, -8, 'start'], [12, 16, 'start'], [-12, -8, 'end'], [-12, 16, 'end'], [12, 3.5, 'start'], [-12, 3.5, 'end']];
  const placed: Box[] = [];
  return points.map((p) => {
    const w = p.text.length * charWidth;
    for (const [dx, dy, anchor] of spots) {
      const x = p.x + dx, y = p.y + dy;
      // Text boxes run from about 9 px above the baseline to 3 below; 2 px of air around each.
      const box = { x0: (anchor === 'start' ? x : x - w) - 2, x1: (anchor === 'start' ? x + w : x) + 2, y0: y - 11, y1: y + 5 };
      if (box.x0 + 2 < area.left || box.x1 - 2 > area.right || box.y0 + 2 < area.top || box.y1 - 2 > area.bottom) continue;
      if (dots.some((d) => hit(box, d)) || placed.some((b) => hit(box, b))) continue;
      placed.push(box);
      return { x, y, anchor };
    }
    return null;
  });
}

export function duration(minutes: number | null): string {
  if (minutes === null) return 'not recorded';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} h`;
}

// Which long-horizon cards span two columns in the three-column grid. Rows
// alternate wide-then-narrow and narrow-then-wide, so every row is full; an odd
// count ends with a row of three narrow cards.
export function wideCards(n: number): boolean[] {
  const zigzag = n % 2 === 0 ? n : Math.max(0, n - 3);
  const flags = Array.from({ length: n }, (_, i) => i < zigzag && (Math.floor(i / 2) % 2 === 0 ? i % 2 === 0 : i % 2 === 1));
  if (n === 1) flags[0] = true;
  return flags;
}

// Long-horizon runs first, each group newest first.
export function ordered(runs: SyncedRun[]) {
  const byDate = (a: SyncedRun, b: SyncedRun) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug);
  return {
    long: runs.filter((r) => r.kind === 'long-horizon').sort(byDate),
    single: runs.filter((r) => r.kind === 'single-file').sort(byDate),
  };
}
