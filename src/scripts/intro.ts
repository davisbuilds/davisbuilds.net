// The first-visit intro on Home: a pixel crew carries the first screen's
// panels in, a foreman checks them off, and the last worker switches on the
// readout's light before the page fades in. The inline script in index.astro
// decides whether it plays (first visit or ?intro, never with reduced motion,
// a link into the page, or an automated browser) and hides the page; this
// draws it from the page's own layout, then shows the page. Any key, click,
// touch or scroll skips to the page.
import { planIntro, STORAGE_KEY, TIMING, type Plan, type PlannedPanel, type Rect } from '../lib/intro';

const root = document.documentElement;
// Started this late, the page has waited long enough: show it.
const LATE_MS = 2500;
const P = 3; // px per sprite pixel

type Colors = Record<'sheet' | 'ink' | 'rule' | 'muted' | 'signal' | 'ok' | 'agent' | 'agentDark' | 'agentHi', string>;
type Drawn = PlannedPanel & { el: Element; bordered: boolean; bars: Rect[]; rules: number[] };

function start() {
  clearTimeout((window as unknown as { __introFailsafe?: number }).__introFailsafe);
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {}
  const url = new URL(location.href);
  if (url.searchParams.has('intro')) {
    url.searchParams.delete('intro');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  if (scrollY > 0 || performance.now() > LATE_MS) return show(true);

  const vp = { w: innerWidth, h: innerHeight };
  const specs = [
    ...[...document.querySelectorAll('.masthead')].map((el) => ({ el, foreman: true })),
    ...[...document.querySelectorAll('.hero > div, .hero .readout, .telemetry .tile')].map((el) => ({ el, foreman: false })),
  ];
  const readout = document.querySelector<HTMLElement>('[data-readout="contributions-ytd"]');
  const label = readout?.querySelector('[data-state]')?.getBoundingClientRect();
  const light = label && label.top > 0 && label.bottom < vp.h ? { x: label.x + label.width / 2, y: label.y + label.height / 2, w: label.width } : null;
  const plan = planIntro(specs.map((s) => ({ rect: rectOf(s.el), foreman: s.foreman })), vp, light);
  const drawn: Drawn[] = plan.panels.map((p) => {
    const el = specs.find((s) => sameRect(rectOf(s.el), p.rect))!.el;
    return { ...p, el, bordered: parseFloat(getComputedStyle(el).borderTopWidth) >= 1, bars: textBars(el, p.rect), rules: rulesIn(el, p.rect) };
  });
  const stamp = document.querySelector('.masthead .stamp');
  const gearD = document.querySelector('.masthead .gear path')?.getAttribute('d');
  const name = document.querySelector('.masthead .name')?.getBoundingClientRect();
  if (!drawn.length) return show(true);

  const canvas = document.createElement('canvas');
  canvas.className = 'intro';
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(vp.w * dpr);
  canvas.height = Math.round(vp.h * dpr);
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const c = colors();
  const scene = {
    plan, drawn, c, light, readout,
    gear: stamp && gearD ? { rect: rectOf(stamp), path: new Path2D(gearD) } : null,
    foremanDx: name ? Math.min(name.right - plan.panels[0].rect.x + 40, plan.panels[0].rect.w - 40) : 120,
    lightColor: '',
  };

  let t0 = 0, raf = 0, done = false;
  const frame = (now: number) => {
    t0 ||= now;
    const t = now - t0;
    if (t >= TIMING.end) return finish(false);
    if (t >= TIMING.reveal && root.dataset.intro === 'play') root.dataset.intro = 'reveal';
    if (t >= TIMING.tap && !scene.lightColor) scene.lightColor = stateColor(readout?.dataset.state, c);
    canvas.style.opacity = String(1 - clamp((t - TIMING.reveal - 100) / (TIMING.end - TIMING.reveal - 100)));
    ctx.clearRect(0, 0, vp.w, vp.h);
    draw(ctx, t, scene);
    raf = requestAnimationFrame(frame);
  };
  const finish = (skipped: boolean) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const [type, fn] of listeners) removeEventListener(type, fn, true);
    canvas.remove();
    show(skipped);
  };
  const skip = () => finish(true);
  const listeners: Array<[string, () => void]> = ['keydown', 'pointerdown', 'touchstart', 'wheel', 'scroll', 'resize'].map((type) => [type, skip]);
  for (const [type, fn] of listeners) addEventListener(type, fn, { capture: true, passive: true });
  raf = requestAnimationFrame(frame);
}

// Hand the page back: the fade-in finishes (or is quick, when skipped).
function show(skipped: boolean) {
  if (!root.dataset.intro) return;
  root.dataset.intro = skipped ? 'skip' : 'reveal';
  setTimeout(() => delete root.dataset.intro, skipped ? 250 : 600);
}

// ---------- measuring the page ----------
function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}
const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

// Skeleton bars where the panel's text lines are, relative to the panel. The
// gear stamp's letters are left out: the gear is stamped on its own.
function textBars(el: Element, at: Rect): Rect[] {
  const bars: Rect[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n && bars.length < 80; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!n.textContent?.trim() || !parent || parent.closest('[hidden], .stamp')) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue;
      bars.push({ x: r.x - at.x, y: r.y - at.y + r.height * 0.22, w: r.width, h: r.height * 0.56 });
    }
  }
  return bars;
}

// Rules inside the panel (a header's bottom border, say) that span most of it.
function rulesIn(el: Element, at: Rect): number[] {
  const ys: number[] = [];
  for (const child of el.querySelectorAll('*')) {
    const r = child.getBoundingClientRect(), cs = getComputedStyle(child);
    if (r.width < at.w * 0.6) continue;
    if (parseFloat(cs.borderBottomWidth) >= 1 && cs.borderBottomStyle !== 'none') ys.push(r.bottom - at.y - 0.5);
    if (parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopStyle !== 'none') ys.push(r.top - at.y + 0.5);
  }
  return ys.filter((y) => y > 1 && y < at.h - 1);
}

function colors(): Colors {
  const s = getComputedStyle(root), v = (k: string) => s.getPropertyValue(`--${k}`).trim();
  return { sheet: v('sheet'), ink: v('ink'), rule: v('rule'), muted: v('muted'), signal: v('signal'), ok: v('ok'), agent: v('agent'), agentDark: v('agent-dark'), agentHi: v('agent-hi') };
}
// The light shows the readout's real state: green only for a fresh reading.
const stateColor = (state: string | undefined, c: Colors) => (state === 'ok' ? c.ok : state === 'stale' ? c.signal : c.muted);

// ---------- drawing ----------
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const back = (x: number) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

const WORKER = ['O......O', 'O.OOOO.O', '.OHOOOO.', '.OEOOEO.', '.OOOOOO.', '..DDDD..', '..DDDD..'];
const LEGS = ['..D..D..', '.D....D.'];
const FOREMAN = ['..KKKK..', '.KKKKKK.', 'KKKKKKKK', '.OOOOOO.', '.OEOOEO.', '.OOOOOO.', '..OOOO..', '.ODDDDO.', '..DDDD..', '..D..D..'];

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, map: Record<string, string>, lift: (row: number) => number = () => 0) {
  const ox = Math.round(x - 4 * P), oy = Math.round(y - rows.length * P);
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === '.') return;
    ctx.fillStyle = map[ch];
    ctx.fillRect(ox + i * P, oy + j * P - lift(j), P, P);
  }));
}
function worker(ctx: CanvasRenderingContext2D, c: Colors, x: number, y: number, legs: number) {
  sprite(ctx, [...WORKER, LEGS[legs]], x, y, { O: c.agent, D: c.agentDark, E: c.ink, H: c.agentHi });
}

type Scene = { plan: Plan; drawn: Drawn[]; c: Colors; light: { x: number; y: number; w: number } | null; gear: { rect: Rect; path: Path2D } | null; foremanDx: number; lightColor: string };

function blockAt(p: PlannedPanel, t: number, vp: { w: number; h: number }) {
  const f = seg(t, p.a, p.landed), r = p.rect;
  let x = r.x, y = r.y;
  if (p.from === 'left') x = lerp(-r.w - 40, r.x, f);
  if (p.from === 'right') x = lerp(vp.w + 40, r.x, f);
  if (p.from === 'bottom') y = lerp(vp.h + 40, r.y, f);
  const settle = seg(t, p.landed, p.landed + 220);
  return { x, y: y - Math.sin(settle * Math.PI) * 5 * (1 - settle), landed: f >= 1, settle };
}

function draw(ctx: CanvasRenderingContext2D, t: number, s: Scene) {
  const { plan, c } = s, vp = { w: innerWidth, h: innerHeight };
  // Panels under way are drawn last, over the ones already placed.
  const order = [...s.drawn].sort((m, n) => Number(blockAt(n, t, vp).landed) - Number(blockAt(m, t, vp).landed));
  for (const p of order) {
    if (t < p.a) continue;
    const { x, y, landed, settle } = blockAt(p, t, vp), r = p.rect;
    ctx.save();
    ctx.translate(x + r.w / 2, y + r.h / 2);
    ctx.rotate(landed ? 0 : Math.sin(t / 70 + p.a) * (8 / Math.max(r.w, 200)));
    ctx.translate(-r.w / 2, -r.h / 2);
    if (p.bordered) {
      ctx.fillStyle = c.sheet; ctx.fillRect(0, 0, r.w, r.h);
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, r.w - 1, r.h - 1);
    } else {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = c.rule; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, r.w - 1, r.h - 1); ctx.setLineDash([]);
    }
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1;
    for (const ry of p.rules) { ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(r.w, ry); ctx.stroke(); }
    ctx.fillStyle = c.rule; ctx.globalAlpha = landed ? 0.55 + 0.45 * settle : 0.55;
    for (const b of p.bars) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
    if (p.lit && s.light) { ctx.save(); ctx.translate(x - r.x, y - r.y); drawLight(ctx, t, s); ctx.restore(); }
    if (p.foreman) drawForeman(ctx, x + s.foremanDx, Math.max(y, FOREMAN.length * P + 2), t, s);
    if (!landed) for (let k = 0; k < p.n; k++) worker(ctx, c, x + r.w * (k + 0.5) / p.n, Math.min(y + r.h + 28, plan.lane), Math.floor((t + k * 45) / 90) % 2);
  }
  // The gear is stamped once the last panel is down.
  const g = seg(t, plan.gear[0], plan.gear[1]);
  if (g > 0 && s.gear) {
    const { rect, path } = s.gear, k = rect.w / 40;
    ctx.save(); ctx.globalAlpha = g;
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2); ctx.rotate((1 - back(g)) * 1.2); ctx.translate(-rect.w / 2, -rect.h / 2); ctx.scale(k, k);
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2 / k; ctx.stroke(path); ctx.restore();
  }
  // The landed crew: a cheer, a wait, then single file off the right edge.
  for (const w of plan.crew) {
    if (t < w.landed || t >= w.gone) continue;
    if (t < w.leave) { cheering(ctx, c, w.x, w.y, t - w.landed); continue; }
    const drop = seg(t, w.leave, w.leave + 170);
    const py = drop < 1 ? lerp(w.y, plan.lane, drop) - Math.sin(drop * Math.PI) * 16 : plan.lane;
    worker(ctx, c, w.x + Math.max(0, t - w.leave - 170) * plan.walk, py, Math.floor(t / 70) % 2);
  }
  // The switcher: up under the light, a tap, a fall to the lane, and off.
  const sw = plan.switcher, L = s.light;
  if (sw && L && t >= sw.landed && t < sw.gone) {
    if (t < sw.jump) cheering(ctx, c, sw.x, sw.y, t - sw.landed);
    else if (t < sw.down) {
      const up = seg(t, sw.jump, sw.tap), fall = seg(t, sw.tap, sw.down), top = { x: L.x, y: L.y + 30 };
      const px = up < 1 ? lerp(sw.x, top.x, up) : top.x;
      const py = up < 1 ? lerp(sw.y, top.y, up) - Math.sin(up * Math.PI) * 30 : lerp(top.y, plan.lane, fall * fall);
      worker(ctx, c, px, py, 0);
    } else worker(ctx, c, L.x + (t - sw.down) * plan.walk, plan.lane, Math.floor(t / 70) % 2);
  }
}

function cheering(ctx: CanvasRenderingContext2D, c: Colors, x: number, y: number, since: number) {
  const f = seg(since, 60, 320);
  worker(ctx, c, x, y - Math.sin(f * Math.PI) * 12, 0);
}

function drawForeman(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, s: Scene) {
  const { c, plan } = s, checks = plan.checks;
  const tap = plan.switcher?.tap ?? Infinity;
  const nod = checks.some((k) => t >= k && t < k + 140) ? 2 : 0, cheer = t >= tap && t < tap + 380 ? 4 : 0;
  sprite(ctx, FOREMAN, x, y, { O: c.agent, D: c.agentDark, E: c.ink, K: c.agentHi }, (j) => cheer - (j < 7 ? nod : 0));
  // The clipboard: one line per check, ticked as it lands.
  const ox = Math.round(x - 4 * P), oy = Math.round(y - FOREMAN.length * P), cx = ox + 27, cy = oy + 9 - cheer;
  ctx.fillStyle = c.sheet; ctx.fillRect(cx, cy, 13, 17);
  ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, cy + 0.5, 12, 16);
  ctx.fillStyle = c.ink; ctx.fillRect(cx + 4, cy - 1, 5, 2);
  checks.forEach((k, i) => { ctx.fillStyle = t >= k ? c.signal : c.rule; ctx.fillRect(cx + 3, cy + 3 + i * (12 / checks.length), t >= k ? 7 : 5, 0.9); });
  // A tick over his head for each check, rising as it fades.
  for (const k of checks) {
    const f = seg(t, k, k + 450);
    if (f <= 0 || f >= 1) continue;
    const tx = x + 2, ty = oy - 6 - f * 14;
    ctx.save(); ctx.globalAlpha = 1 - f; ctx.strokeStyle = c.signal; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(tx - 5, ty); ctx.lineTo(tx - 1.5, ty + 4); ctx.lineTo(tx + 6, ty - 5); ctx.stroke(); ctx.restore();
  }
}

function drawLight(ctx: CanvasRenderingContext2D, t: number, s: Scene) {
  const L = s.light!, tap = s.plan.switcher?.tap ?? Infinity, on = t >= tap, f = seg(t, tap, tap + 500);
  ctx.save();
  if (on && f < 1) {
    ctx.strokeStyle = s.lightColor; ctx.globalAlpha = 1 - f; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(L.x, L.y, 4 + f * 20, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.fillStyle = on ? s.lightColor : s.c.rule;
  ctx.fillRect(L.x - L.w / 2, L.y - 4, L.w, 8);
  ctx.restore();
}

// Last, once every helper above is defined.
if (root.dataset.intro === 'play') start();
