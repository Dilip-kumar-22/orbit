import { expect, test } from '@playwright/test';
import { openScene, stats, watch } from './helpers.js';

const PROFILES = {
  low: { particles: 2500, coreDetail: 16, bloom: false, msaa: 0, dprMax: 1 },
  medium: { particles: 5000, coreDetail: 32, bloom: true, msaa: 0, dprMax: 1.5 },
  high: { particles: 8000, coreDetail: 64, bloom: true, dprMax: 2 },
};

test.describe('quality tiers', () => {
  test.use({ viewport: { width: 640, height: 400 } });

  for (const [tier, expected] of Object.entries(PROFILES)) {
    test(`?quality=${tier} applies its profile`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: 640, height: 400 },
        deviceScaleFactor: 3,
      });
      const page = await context.newPage();
      const seen = watch(page);
      await openScene(page, `quality=${tier}`, { frames: 2 });
      const s = await stats(page);
      expect(s).toMatchObject({
        tier,
        auto: false,
        state: 'running',
        particles: expected.particles,
        coreDetail: expected.coreDetail,
        bloom: expected.bloom,
      });
      if (tier === 'high') expect([2, 4]).toContain(s.msaa);
      else expect(s.msaa).toBe(expected.msaa);
      // a 3x display never exceeds the tier's pixel-ratio ceiling
      expect(s.dpr).toBeLessThanOrEqual(expected.dprMax);
      expect(s.width).toBe(Math.floor(s.cssWidth * s.dpr));
      expect(seen.problems).toEqual([]);
      await context.close();
    });
  }

  test('the core is drawn from an indexed mesh (about 6x fewer vertices than three.js would upload)', async ({
    page,
  }) => {
    await openScene(page, 'quality=high', { frames: 1 });
    const { coreDetail, coreVertices } = await stats(page);
    expect(coreVertices).toBe(10 * (coreDetail + 1) ** 2 + 2);
    expect((20 * (coreDetail + 1) ** 2 * 3) / coreVertices).toBeGreaterThan(5.9);
  });

  test('auto starts from a heuristic tier with the controller attached', async ({ page }) => {
    await openScene(page, 'quality=auto', { frames: 1 });
    const s = await stats(page);
    expect(s.auto).toBe(true);
    expect(['low', 'medium', 'high']).toContain(s.tier);
    expect(s.ceiling).toBe('high');
    expect(s.floored).toBe(false);
  });

  test('setQuality() switches tiers at runtime without a reload, and back to auto', async ({ page }) => {
    await openScene(page, 'quality=high', { frames: 1 });
    await page.evaluate(() => window.orbit.scene.setQuality('low'));
    await expect.poll(async () => (await stats(page)).tier).toBe('low');
    const low = await stats(page);
    expect(low).toMatchObject({ particles: 2500, coreDetail: 16, bloom: false, msaa: 0, auto: false });
    await expect.poll(async () => (await stats(page)).frames).toBeGreaterThan(low.frames + 1); // still rendering

    await page.evaluate(() => window.orbit.scene.setQuality('auto'));
    expect((await stats(page)).auto).toBe(true);
  });

  test('an unknown ?quality value is reported and ignored', async ({ page }) => {
    const seen = watch(page);
    await openScene(page, 'quality=ultra', { frames: 1 });
    expect((await stats(page)).auto).toBe(true);
    expect(seen.problems.join('\n')).toContain('?quality=ultra ignored');
  });
});

test('window.ORBIT_CONFIG overrides the shipped config, and invalid values fall back with a warning', async ({
  page,
}) => {
  const seen = watch(page);
  await page.addInitScript(() => {
    window.ORBIT_CONFIG = {
      quality: { level: 'low', profiles: { low: { particles: 1234 } } },
      bloom: { strength: 99 },
    };
  });
  await openScene(page, 'x=1', { frames: 1 });
  expect(await stats(page)).toMatchObject({ tier: 'low', particles: 1234 });
  expect(seen.problems.join('\n')).toContain('config.bloom.strength');
});
