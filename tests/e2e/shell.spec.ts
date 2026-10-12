import { expect, test } from '@playwright/test';
import { easternParts, statusForHour } from '../../src/lib/status-rules';

const PAGES = ['/', '/404', '/writing/', '/writing/published-essay/', '/oneshots/', '/oneshots/fixture-demo/', '/systems/', '/now/'];

test('home renders the hero without horizontal scroll at 390 px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText("Hi, I'm Davis");
  await expect(page.locator('h1 em')).toHaveCSS('color', 'rgb(183, 70, 10)');
  await expect(page.locator('.hero .sub')).toContainText('Systems engineer');
  await expect(page.locator('.hero .sub em')).toHaveText('building');
  await expect(page.locator('.hero .sub em')).toHaveCSS('color', 'rgb(183, 70, 10)');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const path of PAGES) {
  test(`nothing scrolls horizontally at 390 px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('the nav links Home and marks only the current page', async ({ page }) => {
  const current = () => page.locator('.nav a[aria-current="page"]');
  await page.goto('/systems/');
  await expect(current()).toHaveText('Systems');
  await page.locator('.nav a', { hasText: 'Home' }).click();
  await expect(page).toHaveURL('/');
  await expect(current()).toHaveText('Home');
  await page.goto('/404');
  await expect(current()).toHaveCount(0);
  await expect(page).toHaveTitle('Not found · Davis Gee');
});

test('the title block names the page it is on', async ({ page }) => {
  for (const [path, title] of [
    ['/', 'davisbuilds.net'],
    ['/writing/', 'davisbuilds.net/writing/'],
    ['/writing/published-essay/', 'davisbuilds.net/writing/published-essay/'],
    ['/oneshots/fixture-demo/', 'davisbuilds.net/oneshots/fixture-demo/'],
    ['/no-such-sheet/', 'davisbuilds.net'],
  ]) {
    await page.goto(path);
    await expect(page.locator('.titleblock > div:first-child .v'), path).toHaveText(title);
  }
});

test('links to other sites open in a new tab, links within it do not', async ({ page }) => {
  let external = 0;
  for (const path of PAGES) {
    await page.goto(path);
    const links = await page.locator('a[href]').evaluateAll((as) =>
      as.map((a) => ({ href: a.getAttribute('href')!, target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
    );
    for (const l of links) {
      const absolute = /^(https?:)?\/\//.test(l.href);
      if (absolute && !['davisbuilds.net', 'www.davisbuilds.net'].includes(new URL(l.href, 'https://davisbuilds.net/').hostname)) {
        external++;
        expect([l.target, l.rel], `${path} ${l.href}`).toEqual(['_blank', 'noopener']);
      } else expect(l.target, `${path} ${l.href}`).toBeNull();
    }
  }
  // Control: the footer's profile links alone put external links on every page.
  expect(external).toBeGreaterThanOrEqual(PAGES.length * 5);
});

test('an explicit theme choice overrides the system scheme, both ways', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const darkBg = await bg();
  const btn = page.locator('#theme-btn');
  await btn.click(); // system -> light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const lightBg = await bg();
  expect(lightBg).not.toBe(darkBg);
  await page.emulateMedia({ colorScheme: 'light' });
  await btn.click(); // light -> dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await bg()).toBe(darkBg);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('command palette filters and navigates', async ({ page }) => {
  await page.goto('/404');
  await page.keyboard.press('ControlOrMeta+k');
  const input = page.locator('#pal-q');
  await expect(input).toBeFocused();
  await input.fill('writ');
  expect(await page.locator('#pal-list [role="option"]').count()).toBeGreaterThanOrEqual(1);
  await input.fill('home');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#palette')).toBeHidden();
});

test('the console says hello', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await page.goto('/');
  await expect.poll(() => logs.some((l) => l.includes('DAVISBUILDS.NET'))).toBe(true);
});

test('operator status follows the Eastern-time rule table', async ({ page }) => {
  await page.goto('/');
  const expected = statusForHour(easternParts(new Date()).hour);
  await expect(page.locator('#op-status')).toContainText(expected);
});

test('cursor zone readout tracks the pointer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const box = (await page.locator('#sheet').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.05, box.y + 20);
  await expect(page.locator('#zone-readout')).toHaveText('A1');
});

test('control: with motion allowed, the status pulse is animating', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(running).toBeGreaterThanOrEqual(1);
});

for (const path of PAGES) {
  test(`reduced motion leaves no running animations on ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await page.waitForTimeout(300);
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    expect(running).toBe(0);
  });
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('home content is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText("Hi, I'm Davis");
    await expect(page.locator('.titleblock')).toContainText('davisbuilds.net');
    await expect(page.locator('.titleblock .rights')).toHaveText(/^© \d{4} Davis Gee\. All rights reserved\.$/);
    await expect(page.locator('.titleblock .rev .sha')).toHaveText(/^[0-9a-f]{7,}\+?$/);
    await expect(page.locator('.titleblock .rev .date')).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  });
});

test('unknown paths return the styled 404 with status 404', async ({ page }) => {
  const res = await page.goto('/no-such-drawing/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('.err-code')).toHaveText('404');
});
