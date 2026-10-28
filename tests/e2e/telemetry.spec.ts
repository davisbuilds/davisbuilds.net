import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Each case serves one fixture as /telemetry.json and pins the page clock, so
// ages are exact. Fixtures never ship: the fixture build has no telemetry.json.
const fixture = (name: string) => readFileSync(`tests/fixtures/telemetry/${name}.json`, 'utf8');

async function serve(page: Page, body: string, at = '2026-10-07T21:00:00Z') {
  await page.clock.setFixedTime(new Date(at));
  await page.route('**/telemetry.json', (route) => route.fulfill({ contentType: 'application/json', body }));
}
const readout = (page: Page, key: string) => page.locator(`[data-readout="${key}"]`);
const value = (page: Page, key: string) => readout(page, key).locator('[data-value]');

test.describe('telemetry reader', () => {
  // Values land without the odometer roll, so each assertion reads final text.
  test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: 'reduce' }));

  test('ok: every Home readout shows its number and its age', async ({ page }) => {
    await serve(page, fixture('ok'));
    await page.goto('/');
    await expect(value(page, 'contributions-ytd')).toHaveText('5,755');
    await expect(readout(page, 'contributions-ytd').locator('[data-year]')).toHaveText('2026');
    await expect(readout(page, 'contributions-ytd').locator('[data-read]')).toHaveText('2026-10-07 · 5m ago');
    await expect(readout(page, 'contributions-ytd').locator('[data-state]')).toHaveText('reading');
    await expect(readout(page, 'contributions-ytd').locator('.yr .n')).toHaveText(['21', '248', '5,755']);
    await expect(value(page, 'agent-sessions-30d')).toHaveText('287');
    await expect(value(page, 'tokens-30d')).toHaveText('4.6B');
    await expect(value(page, 'pull-requests-30d')).toHaveText('414');
    await expect(readout(page, 'agent-sessions-30d').locator('[data-read]')).toHaveText('2026-10-07 · 10m ago');
    await expect(readout(page, 'agent-sessions-30d').locator('[data-hosts]')).toBeHidden();
    await expect(readout(page, 'harness-sessions').locator('.harness > div')).toHaveText(['Codex985', 'Claude Code239', 'Antigravity62']);
    for (const key of ['contributions-ytd', 'tokens-30d', 'weekly-contributions']) {
      await expect(readout(page, key)).toHaveAttribute('data-state', 'ok');
      await expect(readout(page, key)).not.toHaveClass(/is-stale/);
    }
  });

  test('ok: the weekly chart draws every week and the crosshair reads one', async ({ page }) => {
    await serve(page, fixture('ok'));
    await page.goto('/');
    const chart = readout(page, 'weekly-contributions');
    await expect(chart.locator('svg rect.bar')).toHaveCount(53);
    await expect(chart.locator('[data-cross]')).toHaveText('Peak 348 · week of 2026-09-27 · hover to read any week');
    const box = (await chart.locator('svg').boundingBox())!;
    await chart.locator('svg').hover({ position: { x: box.width - 12, y: box.height / 2 } });
    await expect(chart.locator('[data-cross]')).toHaveText('Week of 2026-10-04 · 63 contributions · in progress');
  });

  test('ok: at 390 px the weekly chart fits its box, with readable labels that do not collide', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serve(page, fixture('ok'));
    await page.goto('/');
    const chart = readout(page, 'weekly-contributions');
    await expect(chart.locator('svg rect.bar')).toHaveCount(53);
    const fit = await chart.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    const labels = await chart.locator('svg text.axis').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { text: e.textContent, left: r.left, right: r.right, top: r.top, height: r.height };
    }));
    for (const l of labels) expect(l.height, `${l.text} renders at a readable size`).toBeGreaterThanOrEqual(9);
    const months = labels.filter((l) => /^[A-Z][a-z]{2}$/.test(l.text ?? '')).sort((a, b) => a.left - b.left);
    expect(months.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < months.length; i++) expect(months[i].left, `${months[i].text} clears ${months[i - 1].text}`).toBeGreaterThan(months[i - 1].right + 2);
    // The crosshair still reads the last week from the right edge.
    const box = (await chart.locator('svg').boundingBox())!;
    await chart.locator('svg').click({ position: { x: box.width - 3, y: box.height / 2 } });
    await expect(chart.locator('[data-cross]')).toHaveText('Week of 2026-10-04 · 63 contributions · in progress');
  });

  test('ok: the Systems figure draws the harness mix', async ({ page }) => {
    await serve(page, fixture('ok'));
    await page.goto('/systems/');
    const mix = readout(page, 'harness-mix');
    await expect(mix.locator('[data-empty]')).toHaveText('');
    await expect(mix.locator('[data-total]')).toHaveText('1,286 sessions · ');
    await expect(mix.locator('[data-read]')).toHaveText('2026-10-07 · 10m ago');
    await expect(mix.locator('[data-bar] rect')).toHaveCount(3);
    await expect(mix.locator('[data-bar] text')).toHaveText(['Codex 77%', 'Claude Code 19%']);
  });

  test('stale: a source over 3 hours old renders stale, with its age', async ({ page }) => {
    await serve(page, fixture('stale'));
    await page.goto('/');
    const ytd = readout(page, 'contributions-ytd');
    await expect(ytd).toHaveClass(/is-stale/);
    await expect(ytd.locator('[data-read]')).toHaveText('stale · 2026-10-07 · 5h ago');
    await expect(ytd.locator('[data-state]')).toHaveText('stale reading');
    await expect(value(page, 'contributions-ytd')).toHaveText('5,755');
    const sessions = readout(page, 'agent-sessions-30d');
    await expect(sessions).toHaveClass(/is-stale/);
    await expect(sessions.locator('[data-read]')).toHaveText('stale · 2026-10-05 · 2d ago');
    await expect(sessions.locator('[data-hosts]')).toHaveText('macbook last reported 2d ago');
  });

  test('stale: the Systems harness mix dims and shows its age', async ({ page }) => {
    await serve(page, fixture('stale'));
    await page.goto('/systems/');
    const mix = readout(page, 'harness-mix');
    await expect(mix).toHaveClass(/is-stale/);
    await expect(mix.locator('[data-read]')).toHaveText('stale · 2026-10-05 · 2d ago');
    expect(Number(await mix.locator('[data-bar]').evaluate((g) => getComputedStyle(g).opacity))).toBeLessThan(1);
  });

  test('unavailable: the Systems harness mix says so, with its last reading', async ({ page }) => {
    await serve(page, fixture('unavailable'));
    await page.goto('/systems/');
    const mix = readout(page, 'harness-mix');
    await expect(mix.locator('[data-empty]')).toHaveText('harness mix unavailable');
    await expect(mix.locator('[data-read]')).toHaveText('no reading yet');
    await expect(mix.locator('[data-bar] rect')).toHaveCount(0);
  });

  test('stale: an ok reading turns stale once it is over 3 hours old', async ({ page }) => {
    await serve(page, fixture('ok'), '2026-10-08T00:30:00Z');
    await page.goto('/');
    await expect(readout(page, 'contributions-ytd')).toHaveClass(/is-stale/);
    await expect(readout(page, 'contributions-ytd').locator('[data-read]')).toHaveText('stale · 2026-10-07 · 3h ago');
  });

  test('a reading from the future (a slow visitor clock) says just now', async ({ page }) => {
    await serve(page, fixture('ok'), '2026-10-07T20:00:00Z');
    await page.goto('/');
    await expect(readout(page, 'contributions-ytd').locator('[data-read]')).toHaveText('2026-10-07 · just now');
  });

  test('unavailable: the word, with the last reading, never a number', async ({ page }) => {
    await serve(page, fixture('unavailable'));
    await page.goto('/');
    await expect(value(page, 'contributions-ytd')).toHaveText('unavailable');
    await expect(readout(page, 'contributions-ytd').locator('[data-read]')).toHaveText('last read 2026-09-28 · 9d ago');
    await expect(value(page, 'agent-sessions-30d')).toHaveText('unavailable');
    await expect(readout(page, 'agent-sessions-30d').locator('[data-read]')).toHaveText('no reading yet');
    for (const v of await page.locator('[data-readout] [data-value]').all()) await expect(v).not.toHaveText(/\d/);
  });

  for (const [name, body] of [['an older schema', fixture('old-schema')], ['a body that is not JSON', '<html>oops</html>']] as const) {
    test(`${name}: every readout is unavailable`, async ({ page }) => {
      await serve(page, body);
      await page.goto('/');
      await expect(readout(page, 'contributions-ytd')).toHaveAttribute('data-state', 'unavailable');
      await expect(readout(page, 'contributions-ytd').locator('[data-read]')).toHaveText('no valid reading');
      for (const v of await page.locator('[data-readout] [data-value]').all()) await expect(v).toHaveText('unavailable');
    });
  }

  test('markup in a label injects nothing and runs nothing', async ({ page }) => {
    const problems: string[] = [];
    page.on('dialog', (d) => { problems.push(`dialog: ${d.message()}`); void d.dismiss(); });
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(e.message));
    await serve(page, fixture('markup'));
    await page.goto('/');
    await expect(value(page, 'contributions-ytd')).toHaveText('5,755');
    await expect(readout(page, 'agent-sessions-30d')).toHaveAttribute('data-state', 'unavailable');
    await expect(readout(page, 'harness-sessions')).toHaveAttribute('data-state', 'unavailable');
    expect(await page.locator('[data-readout] img, [data-readout] script, [onerror]').count()).toBe(0);
    expect(await page.title()).not.toBe('pwned');
    expect(problems).toEqual([]);
  });

  test('control: the markup check would see an injected element', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.querySelector('[data-readout] [data-value]')!.insertAdjacentHTML('beforeend', '<img src=x onerror="void 0">'));
    expect(await page.locator('[data-readout] img, [data-readout] script, [onerror]').count()).toBe(1);
  });
});

test.describe('ages keep counting on an open page', () => {
  test.beforeEach(({ page }) => page.emulateMedia({ reducedMotion: 'reduce' }));
  const open = async (page: Page, name: string) => {
    await page.clock.install({ time: new Date('2026-10-07T21:00:00Z') });
    await page.route('**/telemetry.json', (route) => route.fulfill({ contentType: 'application/json', body: fixture(name) }));
    await page.goto('/');
  };

  test('an unavailable source\'s last reading', async ({ page }) => {
    await open(page, 'unavailable');
    const read = readout(page, 'contributions-ytd').locator('[data-read]');
    await expect(read).toHaveText('last read 2026-09-28 · 9d ago');
    await page.clock.fastForward('24:00:00');
    await expect(read).toHaveText('last read 2026-09-28 · 10d ago');
  });

  test('a quiet host\'s last report', async ({ page }) => {
    await open(page, 'stale');
    const note = readout(page, 'agent-sessions-30d').locator('[data-hosts]');
    await expect(note).toHaveText('macbook last reported 2d ago');
    await page.clock.fastForward('24:00:00');
    await expect(note).toHaveText('macbook last reported 3d ago');
  });

  test('control: an ok reading\'s age advances', async ({ page }) => {
    await open(page, 'ok');
    const read = readout(page, 'contributions-ytd').locator('[data-read]');
    await expect(read).toHaveText('2026-10-07 · 5m ago');
    await page.clock.fastForward('01:00:00');
    await expect(read).toHaveText('2026-10-07 · 1h ago');
  });
});

test('the odometer rolls into the number and settles to plain text', async ({ page }) => {
  // A fake clock that only moves when told, so the roll can be caught midway.
  await page.clock.install({ time: new Date('2026-10-07T21:00:00Z') });
  await page.route('**/telemetry.json', (route) => route.fulfill({ contentType: 'application/json', body: fixture('ok') }));
  await page.goto('/');
  const v = value(page, 'contributions-ytd');
  await expect(v.locator('.odo')).toHaveCount(1);
  await expect(v.locator('.sr-only')).toHaveText('5,755');
  await page.clock.runFor(3000);
  await expect(v.locator('.odo')).toHaveCount(0);
  await expect(v).toHaveText('5,755');
});

test.describe('on a touch screen', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the chart caption says tap, not hover', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await serve(page, fixture('ok'));
    await page.goto('/');
    await expect(readout(page, 'weekly-contributions').locator('[data-cross]')).toHaveText('Peak 348 · week of 2026-09-27 · tap to read any week');
  });

  test('a tapped week stays in the caption after the finger lifts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await serve(page, fixture('ok'));
    await page.goto('/');
    const chart = readout(page, 'weekly-contributions');
    await chart.locator('svg rect.bar').first().waitFor({ state: 'attached' });
    const box = (await chart.locator('svg').boundingBox())!;
    await chart.locator('svg').tap({ position: { x: box.width - 3, y: box.height / 2 } });
    await page.waitForTimeout(300);
    await expect(chart.locator('[data-cross]')).toHaveText('Week of 2026-10-04 · 63 contributions · in progress');
  });
});
