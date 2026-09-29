import { expect, test } from '@playwright/test';
import {
  SCENE_ROUTE,
  expectContentVisible,
  isSceneRequest,
  openScene,
  orbitState,
  settle,
  stats,
  watch,
} from './helpers.js';

// The product promise: semantic HTML first, WebGL second. Whatever fails, the content must not.

test.describe('content survives every failure', () => {
  test('JavaScript disabled', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/');
    await expectContentVisible(page);
    await expect(page.locator('html')).not.toHaveClass(/reveal-enabled/);
    await expect(page.getByRole('link', { name: 'About' })).toBeVisible();
    await expect(page.locator('.progress')).toBeHidden(); // decorative chrome is not left dangling
    await context.close();
  });

  test('three.js fails to load (CDN / import-map failure)', async ({ page }) => {
    const seen = watch(page);
    await page.route(SCENE_ROUTE, (route) => route.abort());
    await page.goto('/');
    await expect.poll(() => orbitState(page)).toBe('unavailable');
    await expectContentVisible(page);
    await expect(page.locator('#scene')).toBeHidden();
    await expect(page.locator('#nav')).toBeVisible();
    // the failed requests are the whole point of this test; nothing else may go wrong
    const unexpected = seen.problems.filter(
      (p) => !/vendor\/three|ERR_FAILED|Failed to load|Failed to fetch/.test(p),
    );
    expect(unexpected).toEqual([]);
  });

  test('the import map is broken', async ({ page }) => {
    test.skip(process.env.ORBIT_TARGET === 'dist', 'the build has no import map: three.js is bundled');
    await page.route('**/*', async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      const body = (await response.text()).replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
      await route.fulfill({ response, body });
    });
    await page.goto('/');
    await expect.poll(() => orbitState(page)).toBe('unavailable');
    await expectContentVisible(page);
  });

  test('WebGL is unavailable: three.js is never even downloaded', async ({ page }) => {
    const seen = watch(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...rest);
      };
    });
    await page.goto('/');
    await expect.poll(() => orbitState(page)).toBe('unavailable');
    await expectContentVisible(page);
    expect(seen.requests.filter(isSceneRequest)).toEqual([]);
    expect(seen.problems).toEqual([]);
    await expect(page.locator('#scene')).toBeHidden();
  });

  test('WebGL probing throws: the page leaves the loading state and keeps its content', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (/webgl/i.test(type)) throw new Error('getContext is blocked by policy');
        return original.call(this, type, ...rest);
      };
    });
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/');
    await expect.poll(() => orbitState(page)).toBe('unavailable');
    await expectContentVisible(page);
    await expect(page.locator('#scene')).toBeHidden();
    expect(errors).toEqual([]); // handled, not an unhandled rejection
  });

  test('WebGL context creation throws inside three.js', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // the availability probe succeeds; the renderer's own request (with powerPreference) does not
      HTMLCanvasElement.prototype.getContext = function (type, attrs, ...rest) {
        if (/webgl/i.test(type) && attrs && attrs.powerPreference) return null;
        return original.call(this, type, attrs, ...rest);
      };
    });
    await page.goto('/');
    await expect.poll(() => orbitState(page)).toBe('unavailable');
    await expectContentVisible(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contact' })).toBeVisible();
  });
});

test.describe('WebGL context loss', () => {
  test('a lost context pauses the scene and a restored one resumes it', async ({ page }) => {
    const seen = watch(page);
    await openScene(page);
    await page.evaluate(() => {
      window.__lose = document
        .getElementById('scene')
        .getContext('webgl2')
        .getExtension('WEBGL_lose_context');
      window.__lose.loseContext();
    });
    await expect.poll(() => orbitState(page)).toBe('lost');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); // the page carries on
    const frozen = (await stats(page)).frames;
    await settle(page, 12);
    expect((await stats(page)).frames).toBe(frozen); // the loop really stopped

    // The scene gives a lost context 5 s to come back and then tears itself down, so restore it while it
    // still can and leave the slow checks (scrolling through every reveal) for afterwards.
    await page.evaluate(() => window.__lose.restoreContext());
    await expect.poll(() => orbitState(page)).toBe('running');
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(frozen + 2);
    await expectContentVisible(page);
    expect(seen.problems).toEqual([]);
  });

  test('a context that never comes back leaves a working page', async ({ page }) => {
    await openScene(page);
    await page.evaluate(() =>
      document.getElementById('scene').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(),
    );
    await expect.poll(() => orbitState(page), { timeout: 15_000 }).toBe('failed');
    await expect(page.locator('#scene')).toBeHidden();
    await expectContentVisible(page);
    await page.getByRole('link', { name: 'Work' }).click();
    await expect(page).toHaveURL(/#work$/);
  });
});
