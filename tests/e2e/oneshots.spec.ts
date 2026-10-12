import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const RUNS_DIR = 'tests/fixtures/oneshots/runs';
const MANIFESTS = readdirSync(RUNS_DIR).filter((d) => existsSync(path.join(RUNS_DIR, d, 'run.toml')));

// Watches requests to hosts other than the preview server, frames included.
// Chromium reports a request the page's CSP stopped as failed with "csp"; it
// never left the browser. Anything else to another host did leave.
function offsite(page: Page) {
  const attempted = new Set<string>();
  const stoppedByCsp = new Set<string>();
  const isOffsite = (url: string) => {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== 'localhost';
  };
  page.on('request', (req) => { if (isOffsite(req.url())) attempted.add(req.url()); });
  page.on('requestfailed', (req) => { if (isOffsite(req.url()) && req.failure()?.errorText === 'csp') stoppedByCsp.add(req.url()); });
  return {
    attempted: () => [...attempted].sort(),
    stopped: () => [...stoppedByCsp].sort(),
    left: () => [...attempted].filter((u) => !stoppedByCsp.has(u)).sort(),
  };
}

const frameFor = (page: Page, slug: string) => page.frames().find((f) => f.url().includes(`/oneshots/${slug}/files/`));

test.describe('Oneshots index', () => {
  test('one card per manifest, every figure loaded or a placeholder plate', async ({ page }) => {
    await page.goto('/oneshots/');
    const cards = page.locator('.runs .run');
    await expect(cards).toHaveCount(MANIFESTS.length);
    for (const img of await page.locator('.runs .run img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThanOrEqual(300);
    }
    await expect(page.locator('.run[data-runnable] .placeholder')).toHaveCount(1);
  });

  test('headline numbers come from the manifests', async ({ page }) => {
    await page.goto('/oneshots/');
    const tile = (label: string) => page.locator('.tile', { has: page.locator('.label', { hasText: label }) }).locator('.v');
    await expect(tile('Runs')).toHaveText(String(MANIFESTS.length));
    await expect(tile('Median human turns')).toHaveText('1');
    await expect(tile('Longest run')).toHaveText('10 h');
    await expect(page.locator('#plot .pt')).toHaveCount(2);
  });

  test('hovering a plot point shows a tooltip beside it, and leaving hides it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/oneshots/');
    const tip = page.locator('.plot-tip');
    await expect(tip).toBeHidden();
    await expect(page.locator('.chart-cap')).not.toContainText('Hover a point');
    for (const pt of await page.locator('#plot .pt').all()) {
      const dot = pt.locator('circle.dot');
      await dot.hover();
      await expect(tip).toBeVisible();
      await expect(tip).toContainText((await pt.getAttribute('data-title'))!);
      await expect(tip).toContainText(/human turns?/);
      const d = (await dot.boundingBox())!, t = (await tip.boundingBox())!;
      const gap = Math.max(t.x - (d.x + d.width), d.x - (t.x + t.width), t.y - (d.y + d.height), d.y - (t.y + t.height));
      expect(gap).toBeLessThanOrEqual(16);
      // Inside the plot's box, not cut off at an edge.
      const w = (await page.locator('#plot').locator('xpath=..').boundingBox())!;
      expect(t.x).toBeGreaterThanOrEqual(w.x);
      expect(t.x + t.width).toBeLessThanOrEqual(w.x + w.width + 1);
    }
    await page.mouse.move(5, 5);
    await expect(tip).toBeHidden();
  });

  test('filters narrow the cards, and "Runs here" shows the runnable ones', async ({ page }) => {
    await page.goto('/oneshots/');
    await page.getByRole('button', { name: 'Runs here' }).click();
    await expect(page.locator('.runs .run:visible')).toHaveCount(3);
    await page.getByRole('button', { name: 'Long-horizon' }).click();
    await expect(page.locator('.runs .run:visible')).toHaveCount(2);
  });

  test('has no horizontal page scroll at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const url of ['/oneshots/', '/oneshots/fixture-demo/', '/oneshots/fixture-film/']) {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), url).toBeLessThanOrEqual(0);
    }
  });

  test('at 390 px the autonomy plot keeps readable labels and scrolls inside its own box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/oneshots/');
    const plot = page.locator('#plot');
    const heights = await plot.locator('text').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(9);
    const wrap = plot.locator('xpath=..');
    const fit = await wrap.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, overflow: getComputedStyle(el).overflowX }));
    expect(fit.scroll).toBeGreaterThan(fit.client);
    expect(fit.overflow).toBe('auto');
  });
});

test.describe('autonomy plot on a touch screen', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  test('a tapped point keeps its tooltip after the finger lifts, and a tap elsewhere closes it', async ({ page }) => {
    await page.goto('/oneshots/');
    const pt = page.locator('#plot .pt').first();
    await pt.locator('circle.dot').scrollIntoViewIfNeeded();
    await pt.locator('circle.dot').tap();
    await page.waitForTimeout(300);
    await expect(page.locator('.plot-tip')).toBeVisible();
    await expect(page.locator('.plot-tip')).toContainText((await pt.getAttribute('data-title'))!);
    await page.locator('h1').tap();
    await expect(page.locator('.plot-tip')).toBeHidden();
  });
});

test.describe('runnable demos', () => {
  test('Run loads the demo in a scripts-only sandbox, with vendored d3, fonts and storage, and nothing offsite', async ({ page }) => {
    const hits = offsite(page);
    await page.goto('/oneshots/fixture-demo/');
    await expect(page.locator('.vendor-note')).toContainText('d3 7.8.5 (instead of cdnjs.cloudflare.com)');
    await page.getByRole('link', { name: '▶ Run it' }).click();
    const frame = page.locator('iframe.stage-frame');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect.poll(async () => (await frameFor(page, 'fixture-demo')?.locator('#status').textContent()) ?? '').toContain('{');
    const status = JSON.parse((await frameFor(page, 'fixture-demo')!.locator('#status').textContent())!);
    expect(status).toEqual({ d3: '7.8.5', doto: true, visits: '1' });
    expect(hits.attempted()).toEqual([]);
  });

  test('a hostile demo cannot reach the page, the top window, a popup, or another host', async ({ page }) => {
    const hits = offsite(page);
    await page.goto('/oneshots/fixture-hostile/');
    const url = page.url();
    await page.getByRole('link', { name: '▶ Run it' }).click();
    await expect.poll(async () => (await frameFor(page, 'fixture-hostile')?.locator('#results').textContent()) ?? '', { timeout: 10_000 }).toContain('{');
    const r = JSON.parse((await frameFor(page, 'fixture-hostile')!.locator('#results').textContent())!);
    expect(r.parentDom).toMatch(/^blocked/);
    expect(r.parentStorage).toMatch(/^blocked/);
    expect(r.popup).toBe('blocked');
    expect(r.fetch).toBe('blocked');
    expect(r.script).toBe('blocked');
    expect(r.image).toBe('blocked');
    // The demo then tries to navigate its own frame to another host, by script
    // at 2 s and by meta refresh at 3 s. The page's frame-src blocks both before
    // any request (the frame shows an error page). Without that policy the
    // watcher sees the navigation request and the frame lands on example.com.
    await page.waitForTimeout(3_500);
    expect(page.frames().map((f) => f.url()).filter((u) => u.startsWith('http') && !u.includes('localhost'))).toEqual([]);
    expect(page.url()).toBe(url);
    expect(await page.evaluate(() => document.body.dataset.pwned)).toBeUndefined();
    // Control: the watcher sees the injected script and image, which CSP stopped.
    expect(hits.stopped()).toEqual(expect.arrayContaining(['https://example.com/injected.js', 'https://example.com/pixel.png']));
    expect(hits.left()).toEqual([]);
  });

  test('on a phone, Run opens the full-screen page instead of the inline frame', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/oneshots/fixture-plain/');
    await page.getByRole('link', { name: '▶ Run it' }).click();
    await expect(page).toHaveURL(/\/oneshots\/fixture-plain\/play\/$/);
    const frame = page.locator('iframe');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    const box = (await frame.boundingBox())!;
    expect(box.width).toBe(390);
    expect(box.height).toBeGreaterThan(844 * 0.85);
    await expect.poll(async () => (await frameFor(page, 'fixture-plain')?.locator('#hello').textContent()) ?? '').toBe('Plain fixture');
  });

  test('the full-screen page uses the same sandbox', async ({ page }) => {
    await page.goto('/oneshots/fixture-plain/play/');
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
    await expect.poll(async () => (await frameFor(page, 'fixture-plain')?.locator('#hello').textContent()) ?? '').toBe('Plain fixture');
  });

  test('pipeline runs link published assets to the release and mark the rest unpublished', async ({ page }) => {
    await page.goto('/oneshots/fixture-film/');
    await expect(page.getByRole('link', { name: 'fixture_film.mp4' })).toHaveAttribute('href', 'https://example.com/oneshots/releases/download/run-fixture-film/fixture_film.mp4');
    await expect(page.locator('.assets li', { hasText: 'fixture_still.png' })).toContainText('not published yet');
    await page.goto('/oneshots/fixture-unreleased/');
    await expect(page.locator('.sec-head', { hasText: 'Outputs' })).toContainText('not published yet');
  });

  test('a figure hugs its image and caption beside a taller neighbor', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/oneshots/fixture-film/');
    const figures = page.locator('.gallery figure');
    await expect(figures).toHaveCount(3);
    for (const img of await page.locator('.gallery img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    const boxes = await figures.evaluateAll((els) => els.map((f) => ({
      top: f.getBoundingClientRect().top,
      height: f.getBoundingClientRect().height,
      image: f.querySelector('img')!.getBoundingClientRect().height,
      content: f.querySelector('figcaption')!.getBoundingClientRect().bottom - f.getBoundingClientRect().top,
    })));
    // Control: the hero (960 x 600) and the close-up (600 x 900) share a row,
    // so a stretched hero would show here.
    expect(boxes[0].top).toBe(boxes[1].top);
    expect(boxes[1].image).toBeGreaterThan(boxes[0].image + 100);
    for (const b of boxes) expect(b.height - b.content).toBeLessThanOrEqual(2);
  });

  test('the brief stops at the after-delivery marker and says where the rest is', async ({ page }) => {
    await page.goto('/oneshots/fixture-film/');
    await expect(page.locator('pre.brief')).toContainText('Make a fixture film.');
    await expect(page.locator('pre.brief')).not.toContainText('Fixture follow-up');
    await expect(page.locator('.brief-later')).toContainText('full brief on GitHub');
    await expect(page.getByRole('link', { name: 'Brief on GitHub' })).toHaveAttribute('href', /\/runs\/fixture-film\/brief\.md$/);
    // Control: a brief without the marker is shown whole, with no note.
    await page.goto('/oneshots/fixture-demo/');
    await expect(page.locator('pre.brief')).toBeVisible();
    await expect(page.locator('.brief-later')).toHaveCount(0);
  });

  test('briefs and curator notes render as text, never as markup', async ({ page }) => {
    await page.goto('/oneshots/fixture-film/');
    await expect(page.locator('pre.brief')).toContainText('<script>alert(1)</script> stays text.');
    await expect(page.locator('pre.brief script')).toHaveCount(0);
    await expect(page.locator('.curator')).toHaveText('A fixture curator note, shown as plain text.');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('every card shows, and Run links to the full-screen page', async ({ page }) => {
    await page.goto('/oneshots/');
    await expect(page.locator('[data-run-filters]')).toBeHidden();
    await expect(page.locator('.runs .run:visible')).toHaveCount(MANIFESTS.length);
    await page.goto('/oneshots/fixture-demo/');
    await expect(page.getByRole('link', { name: '▶ Run it' })).toHaveAttribute('href', '/oneshots/fixture-demo/play/');
  });
});
