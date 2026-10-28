import { expect, test, type Page } from '@playwright/test';

// The intro skips automated browsers (navigator.webdriver), which keeps every
// other test on the plain page. These tests stand in for a visitor.
const asVisitor = (page: Page) =>
  page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
const asReturning = (page: Page) => page.addInitScript(() => localStorage.setItem('dg-intro-seen', '1'));
const intro = (page: Page) => page.evaluate(() => document.documentElement.dataset.intro ?? null);
const pageOpacity = (page: Page) => page.locator('.sheet .inner').evaluate((el) => getComputedStyle(el).opacity);
const finished = (page: Page, timeout = 5_000) => expect.poll(() => intro(page), { timeout }).toBeNull();

test.describe('landing intro', () => {
  test('plays on a first visit, hiding the page while the crew builds it, then remembers the visit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await asVisitor(page);
    await page.goto('/');
    expect(await intro(page)).toBe('play');
    await expect(page.locator('canvas.intro')).toHaveCount(1);
    // The page under the canvas is really hidden while it plays.
    expect(await pageOpacity(page)).toBe('0');
    await finished(page);
    await expect(page.locator('canvas.intro')).toHaveCount(0);
    expect(await pageOpacity(page)).toBe('1');
    expect(await page.evaluate(() => localStorage.getItem('dg-intro-seen'))).toBe('1');
    expect(errors).toEqual([]);
  });

  test('a second visit goes straight to the page', async ({ page }) => {
    await asVisitor(page);
    await page.goto('/');
    await finished(page);
    await page.goto('/');
    expect(await intro(page)).toBeNull();
    await expect(page.locator('canvas.intro')).toHaveCount(0);
    expect(await pageOpacity(page)).toBe('1');
  });

  test('a key press or a click skips it', async ({ page }) => {
    await asVisitor(page);
    await page.goto('/');
    expect(await intro(page)).toBe('play');
    await page.keyboard.press('Escape');
    await finished(page, 800);
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    expect(await intro(page)).toBe('play');
    await page.mouse.click(400, 300);
    await finished(page, 800);
  });

  test('reduced motion never plays it, even when asked to replay', async ({ page }) => {
    await asVisitor(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?intro');
    expect(await intro(page)).toBeNull();
    await expect(page.locator('canvas.intro')).toHaveCount(0);
  });

  test('automated browsers and links into the page skip it', async ({ page }) => {
    await page.goto('/');
    expect(await intro(page)).toBeNull();
    await asVisitor(page);
    await page.goto('/#main');
    expect(await intro(page)).toBeNull();
  });

  test('?intro replays it for a returning visitor, then drops from the address', async ({ page }) => {
    await asVisitor(page);
    await asReturning(page);
    await page.goto('/?intro');
    expect(await intro(page)).toBe('play');
    expect(new URL(page.url()).search).toBe('');
    await finished(page);
  });

  test('the palette replays it from any page', async ({ page }) => {
    await asVisitor(page);
    await asReturning(page);
    await page.goto('/now/');
    await page.keyboard.press('ControlOrMeta+k');
    await page.locator('#pal-q').fill('replay');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === '/');
    expect(await intro(page)).toBe('play');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test('plays through and leaves the page in place', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await asVisitor(page);
      await page.goto('/');
      expect(await intro(page)).toBe('play');
      await finished(page);
      expect(await pageOpacity(page)).toBe('1');
      expect(errors).toEqual([]);
    });
  });
});
