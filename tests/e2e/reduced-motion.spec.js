import { expect, test } from '@playwright/test';
import {
  expectContentVisible,
  isSceneRequest,
  openScene,
  openStatic,
  orbitState,
  settle,
  stats,
  watch,
} from './helpers.js';

test.describe('prefers-reduced-motion', () => {
  test('enabled before load: no animation, no hidden content, still frame stays sharp on resize', async ({
    page,
  }) => {
    const seen = watch(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1024, height: 700 });
    await openStatic(page);

    await expect(page.locator('html')).not.toHaveClass(/reveal-enabled/);
    await expectContentVisible(page);

    const first = await stats(page);
    expect(first.reducedMotion).toBe(true);
    await settle(page, 45);
    expect((await stats(page)).frames).toBe(first.frames); // nothing animates

    // scroll and pointer input do not move a reduced-motion scene either
    await page.mouse.move(200, 200);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await settle(page, 30);
    expect((await stats(page)).frames).toBe(first.frames);

    // ...but a resize / orientation change re-renders the still frame at the new size
    await page.setViewportSize({ width: 700, height: 1024 });
    await expect.poll(async () => (await stats(page)).cssWidth).toBe(700);
    const rotated = await stats(page);
    expect(rotated.cssHeight).toBe(1024);
    expect(rotated.frames).toBeGreaterThan(first.frames);
    expect(rotated.width).toBe(Math.floor(700 * rotated.dpr));
    expect(seen.problems).toEqual([]);
  });

  test('toggled while the page is open: the scene follows the preference in both directions', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openScene(page);
    expect(await orbitState(page)).toBe('running');
    await expect(page.locator('html')).toHaveClass(/reveal-enabled/);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => orbitState(page)).toBe('static');
    await expect(page.locator('html')).not.toHaveClass(/reveal-enabled/);
    await expectContentVisible(page);
    const still = await stats(page);
    expect(still.reducedMotion).toBe(true);
    await settle(page, 40);
    expect((await stats(page)).frames).toBe(still.frames);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => orbitState(page)).toBe('running');
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(still.frames + 2);
  });

  test("reducedMotionScene: 'disabled' removes the canvas and never downloads three.js", async ({ page }) => {
    const seen = watch(page);
    await page.addInitScript(() => {
      window.ORBIT_CONFIG = { reducedMotionScene: 'disabled' };
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?quality=low');
    await expect.poll(() => orbitState(page)).toBe('disabled');
    await expect(page.locator('#scene')).toBeHidden();
    await expectContentVisible(page);
    expect(seen.requests.filter(isSceneRequest)).toEqual([]);

    // the preference turns off: the backdrop comes back
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => orbitState(page), { timeout: 20_000 }).toBe('running');
    await expect(page.locator('#scene')).toBeVisible();

    // ...and goes away again
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => orbitState(page)).toBe('disabled');
    await expect(page.locator('#scene')).toBeHidden();
    expect(seen.problems).toEqual([]);
  });
});
