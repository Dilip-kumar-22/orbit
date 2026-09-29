import { expect } from '@playwright/test';

// Console noise that comes from the test environment, not from ORBIT.
const ENV_NOISE = [
  /GPU stall due to ReadPixels/i,
  /Automatic fallback to software WebGL has been deprecated/i,
  /\[GroupMarkerNotSet\]/i,
];

// What "the 3D code" is on each target: vendor/three + src/scene.js in the source tree, one lazy chunk in dist.
export const SCENE_ROUTE =
  process.env.ORBIT_TARGET === 'dist' ? '**/assets/scene-*.js' : '**/vendor/three/**';
export const isSceneRequest = (url) =>
  /\/vendor\/three\/|\/src\/scene\.js|\/assets\/scene-[^/]+\.js/.test(url);

/** Records everything that would show up as a problem in a visitor's console. */
export function watch(page) {
  const problems = [];
  const requests = [];
  page.on('console', (msg) => {
    if (!['error', 'warning'].includes(msg.type())) return;
    if (ENV_NOISE.some((re) => re.test(msg.text()))) return;
    problems.push(`console.${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`));
  page.on('request', (req) => requests.push(req.url()));
  return { problems, requests };
}

/** Load a page with the diagnostics handle (?debug) and wait until the scene has rendered frames. */
export async function openScene(page, query = 'quality=low', { frames = 3 } = {}) {
  await page.goto(`/?debug&${query}`);
  await page.waitForFunction((n) => window.orbit?.stats().frames >= n, frames);
}

export const stats = (page) => page.evaluate(() => window.orbit.stats());
export const orbitState = (page) => page.evaluate(() => document.documentElement.dataset.orbit);

/**
 * The content is readable: the hero is visible at once, and every revealed block becomes fully
 * opaque when it is scrolled to (below-the-fold blocks start transparent whenever JS runs, by design).
 */
export async function expectContentVisible(page) {
  await expect(page.locator('h1')).toBeVisible();
  const reveals = page.locator('.reveal');
  for (let i = 0, n = await reveals.count(); i < n; i += 1) {
    const el = reveals.nth(i);
    if (!(await el.isVisible())) continue; // e.g. the scroll cue is display:none on small screens
    await el.scrollIntoViewIfNeeded();
    await expect(el).toHaveCSS('opacity', '1');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
