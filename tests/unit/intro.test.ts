import { describe, expect, it } from 'vitest';
import { planIntro, TIMING, type PanelSpec } from '../../src/lib/intro';

const r = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

// The real Home's first screen, measured in Chromium from the production build.
const DESKTOP = { w: 1440, h: 900 };
const DESKTOP_PANELS: PanelSpec[] = [
  { rect: r(209, 73, 1022, 40), foreman: true },
  { rect: r(209, 185, 580, 331) },
  { rect: r(845, 332, 386, 184) },
  { rect: r(210, 640, 340, 140) },
  { rect: r(551, 640, 340, 140) },
  { rect: r(891, 640, 340, 140) },
];
const DESKTOP_LIGHT = { x: 1170, y: 349 };
const PHONE = { w: 390, h: 844 };
const PHONE_PANELS: PanelSpec[] = [
  { rect: r(37, 45, 316, 83), foreman: true },
  { rect: r(37, 168, 316, 363) },
  { rect: r(37, 555, 316, 184) },
  { rect: r(38, 831, 314, 140) },
];
const PHONE_LIGHT = { x: 303, y: 571 };

const desktop = planIntro(DESKTOP_PANELS, DESKTOP, DESKTOP_LIGHT);
const phone = planIntro(PHONE_PANELS, PHONE, PHONE_LIGHT);

describe('the intro plan', () => {
  it('brings each panel in from the left, the right or below, by where it sits', () => {
    expect(desktop.panels.map((p) => p.from)).toEqual(['left', 'left', 'right', 'bottom', 'bottom', 'bottom']);
    expect(phone.panels.map((p) => p.from)).toEqual(['left', 'right', 'bottom']);
  });

  it('leaves out a panel that starts too low on the first screen to be built', () => {
    expect(phone.panels).toHaveLength(3);
    expect(phone.panels.some((p) => p.rect.y === 831)).toBe(false);
  });

  it('gives each panel one to four carriers, by its width', () => {
    expect(desktop.panels.map((p) => p.n)).toEqual([4, 3, 2, 2, 2, 2]);
    expect(phone.panels.map((p) => p.n)).toEqual([2, 2, 2]);
    expect(desktop.crew.length + 1).toBe(15);
  });

  it('lands every panel before anyone leaves, and has everyone gone by the end', () => {
    for (const plan of [desktop, phone]) {
      const lastLanding = Math.max(...plan.panels.map((p) => p.landed));
      expect(lastLanding).toBeLessThanOrEqual(TIMING.exitFrom);
      expect(Math.min(...plan.crew.map((w) => w.leave))).toBeGreaterThan(lastLanding);
      expect(plan.crew.every((w) => w.leave >= w.landed + TIMING.cheer)).toBe(true);
      expect(Math.max(...plan.crew.map((w) => w.gone), plan.switcher!.gone)).toBeLessThanOrEqual(TIMING.end);
    }
  });

  it('files the crew out rightmost first, so no one walks through another in the lane', () => {
    for (const plan of [desktop, phone]) {
      const byLeave = [...plan.crew].sort((a, b) => a.leave - b.leave);
      expect(byLeave.length).toBeGreaterThanOrEqual(5);
      expect(byLeave.map((w) => w.x)).toEqual([...byLeave.map((w) => w.x)].sort((a, b) => b - a));
      expect(new Set(byLeave.map((w) => w.leave)).size).toBe(byLeave.length);
    }
  });

  it('keeps back the carrier of the lit panel nearest the light to switch it on', () => {
    const readout = desktop.panels[2];
    expect(desktop.panels.map((p) => p.lit)).toEqual([false, false, true, false, false, false]);
    expect(desktop.switcher!.x).toBeCloseTo(readout.rect.x + readout.rect.w * 0.75);
    expect(desktop.crew).not.toContainEqual(desktop.switcher);
    expect(desktop.switcher!.tap).toBe(TIMING.tap);
    expect(desktop.checks).toEqual([...desktop.panels.map((p) => p.landed), TIMING.tap]);
  });

  it('with no light on the first screen, has no switcher and one check per panel', () => {
    const plan = planIntro(DESKTOP_PANELS, DESKTOP, null);
    expect(plan.switcher).toBeNull();
    expect(plan.panels.every((p) => !p.lit)).toBe(true);
    expect(plan.checks).toEqual(plan.panels.map((p) => p.landed));
    expect(plan.crew).toHaveLength(15);
  });

  it('stamps the gear after the last landing and before the page fades in', () => {
    for (const plan of [desktop, phone]) {
      expect(plan.panels.length).toBeGreaterThanOrEqual(3);
      expect(plan.gear[0]).toBeGreaterThan(Math.max(...plan.panels.map((p) => p.landed)));
      expect(plan.gear[1]).toBeLessThan(TIMING.reveal);
    }
  });

  it('walks the lane along the bottom edge, faster on a wider screen', () => {
    expect(desktop.lane).toBe(DESKTOP.h - 2);
    expect(phone.lane).toBe(PHONE.h - 2);
    expect(phone.walk).toBeLessThan(desktop.walk);
  });

  it('rests a carrier under its panel, but never below the screen', () => {
    const hero = phone.panels[1];
    expect(phone.crew.concat(phone.switcher!).every((w) => w.y <= PHONE.h - 2)).toBe(true);
    expect(phone.crew.some((w) => w.y === hero.rect.y + hero.rect.h + 28)).toBe(true);
  });
});
