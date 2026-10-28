// The first-visit intro's choreography, as a pure function of what's on the
// first screen: which way each panel arrives, who carries it, and when each
// worker leaves. src/scripts/intro.ts measures the page and draws the plan.

export type Rect = { x: number; y: number; w: number; h: number };
export type Viewport = { w: number; h: number };
export type Point = { x: number; y: number };
export type PanelSpec = { rect: Rect; foreman?: boolean };
export type From = 'left' | 'right' | 'bottom';

// Milliseconds from the first frame. The light comes on at `tap`, and the
// page fades in from `reveal` to `end`.
export const TIMING = { end: 3000, reveal: 2450, travel: 600, lastStart: 600, cheer: 320, exitFrom: 1550, exitSpan: 500, jump: 2020, tap: 2260, down: 2480 } as const;

// A panel starting lower than this on the first screen is left for the
// fade-in: its carriers would have nowhere to stand.
const MIN_VISIBLE = 80;
// Where a carrier stands under its panel, and the hop down to the lane.
const UNDER = 28;
const DROP = 170;

export const STORAGE_KEY = 'dg-intro-seen';

export type PlannedPanel = PanelSpec & { from: From; a: number; landed: number; n: number; lit: boolean };
export type Worker = { x: number; y: number; landed: number; leave: number; gone: number };
export type Switcher = Worker & { jump: number; tap: number; down: number };
export type Plan = {
  panels: PlannedPanel[];
  crew: Worker[];
  switcher: Switcher | null;
  checks: number[];
  gear: [number, number];
  lane: number;
  walk: number;
};

export function planIntro(specs: PanelSpec[], vp: Viewport, light: Point | null): Plan {
  const shown = specs.filter((p) => p.rect.y < vp.h - MIN_VISIBLE && p.rect.y + p.rect.h > 0);
  const stagger = shown.length > 1 ? Math.min(150, TIMING.lastStart / (shown.length - 1)) : 0;
  const inside = (p: PanelSpec, q: Point) => q.x >= p.rect.x && q.x <= p.rect.x + p.rect.w && q.y >= p.rect.y && q.y <= p.rect.y + p.rect.h;
  const panels: PlannedPanel[] = shown.map((p, i) => {
    // The first panel comes from the left; a low one is lifted up from below;
    // the rest come from the side they sit on.
    const from: From = i === 0 ? 'left' : p.rect.y > vp.h / 2 ? 'bottom' : p.rect.x + p.rect.w / 2 >= vp.w / 2 ? 'right' : 'left';
    const a = Math.round(i * stagger);
    return { ...p, from, a, landed: a + TIMING.travel, n: Math.min(4, Math.max(1, Math.round(p.rect.w / 200))), lit: !!light && inside(p, light) };
  });

  const lane = vp.h - 2;
  const walk = Math.min(2.6, Math.max(0.9, vp.w / 520));
  const offscreen = (x: number) => (vp.w + 50 - x) / walk;
  const all = panels.flatMap((p) => Array.from({ length: p.n }, (_, k) => ({
    x: p.rect.x + p.rect.w * (k + 0.5) / p.n,
    y: Math.min(p.rect.y + p.rect.h + UNDER, lane),
    landed: p.landed,
    lit: p.lit,
  })));

  // The carrier of the lit panel nearest the light stays behind for it.
  const keep = light ? all.filter((w) => w.lit).sort((m, n) => Math.abs(m.x - light.x) - Math.abs(n.x - light.x))[0] : undefined;
  const switcher: Switcher | null = keep && light
    ? { x: keep.x, y: keep.y, landed: keep.landed, jump: TIMING.jump, tap: TIMING.tap, down: TIMING.down, leave: TIMING.down, gone: TIMING.down + offscreen(light.x) }
    : null;

  // Rightmost first: at one walking speed, each worker enters the lane behind
  // the ones already in it, so no one walks through another.
  const leaving = all.filter((w) => w !== keep).sort((m, n) => n.x - m.x || n.y - m.y);
  const gap = leaving.length > 1 ? TIMING.exitSpan / (leaving.length - 1) : 0;
  const crew: Worker[] = leaving.map((w, i) => {
    const leave = Math.round(TIMING.exitFrom + i * gap);
    return { x: w.x, y: w.y, landed: w.landed, leave, gone: leave + DROP + offscreen(w.x) };
  });

  const lastLanding = Math.max(0, ...panels.map((p) => p.landed));
  return {
    panels,
    crew,
    switcher,
    checks: [...panels.map((p) => p.landed), ...(switcher ? [switcher.tap] : [])],
    gear: [lastLanding + 150, lastLanding + 450],
    lane,
    walk,
  };
}
