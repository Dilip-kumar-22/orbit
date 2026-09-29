import { devices, expect, test } from '@playwright/test';
import { expectContentVisible, openScene, stats, watch } from './helpers.js';

const noHorizontalScroll = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const SIZES = [
  { name: 'narrow phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: '200% zoom on a laptop', width: 640, height: 400 },
  { name: '400% zoom on a laptop', width: 320, height: 256 },
];

test.describe('layout', () => {
  for (const { name, width, height } of SIZES) {
    test(`${name} (${width}x${height}): no horizontal scroll, content readable`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/?quality=low');
      expect(await noHorizontalScroll(page)).toBe(true);
      await expectContentVisible(page);
      expect(await noHorizontalScroll(page)).toBe(true);
      // the fixed canvas always covers the viewport
      const box = await page.locator('#scene').boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(width - 1);
      expect(box.height).toBeGreaterThanOrEqual(height - 1);
    });
  }
});

test.describe('touch device', () => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test('starts below the top tier and keeps up through an orientation change', async ({ page }) => {
    const seen = watch(page);
    await openScene(page, 'quality=auto', { frames: 1 });
    const portrait = await stats(page);
    expect(portrait.tier).not.toBe('high'); // coarse pointer: thermally constrained
    expect(portrait.cssWidth).toBeLessThan(portrait.cssHeight);
    expect(portrait.dpr).toBeLessThanOrEqual(2);

    await page.setViewportSize({ width: portrait.cssHeight, height: portrait.cssWidth });
    await expect.poll(async () => (await stats(page)).cssWidth).toBe(portrait.cssHeight);
    const landscape = await stats(page);
    expect(landscape.cssHeight).toBe(portrait.cssWidth);
    expect(landscape.width).toBe(Math.floor(landscape.cssWidth * landscape.dpr));
    expect(await noHorizontalScroll(page)).toBe(true);
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(landscape.frames + 1);
    expect(seen.problems).toEqual([]);
  });
});

test('the drawing buffer is not reallocated by scrolling (mobile URL-bar resize storms)', async ({
  page,
}) => {
  await openScene(page, 'quality=low', { frames: 2 });
  const before = await stats(page);
  await page.evaluate(async () => {
    for (let y = 0; y <= 1500; y += 100) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  const after = await stats(page);
  expect([after.width, after.height, after.dpr]).toEqual([before.width, before.height, before.dpr]);
});
