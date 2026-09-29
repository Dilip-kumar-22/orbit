#!/usr/bin/env node
// Captures the README screenshots from the running site: the high quality tier with a fixed particle
// seed, so a re-run looks the same. `npm run screenshots` (software WebGL takes a few seconds a frame).
import { join } from 'node:path';
import { ROOT } from './headers.mjs';
import { withBrowser } from './browser.mjs';

const out = (name) => join(ROOT, 'assets', name);
const SEED = 7;

async function settle(page, frames = 3) {
  await page.waitForFunction((n) => window.orbit?.stats().frames >= n, frames);
  await page.evaluate(() => document.querySelector('.orbit-debug')?.remove()); // the ?debug overlay
}

await withBrowser(async ({ browser, origin }) => {
  const init = (page) =>
    page.addInitScript((seed) => {
      window.ORBIT_CONFIG = { particles: { seed } };
    }, SEED);

  // desktop: hero and the "work" stage, JPEG keeps the noisy particle field small
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  await init(desktop);
  await desktop.goto(`${origin}/?debug&quality=high`);
  await settle(desktop);
  await desktop.waitForTimeout(1500); // reveal transitions
  await desktop.screenshot({ path: out('screenshot-desktop.jpg'), type: 'jpeg', quality: 86 });
  await desktopContext.close(); // software WebGL is CPU-bound: never leave a scene rendering in the background

  // phone: the hero with the menu open
  const phoneContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phone = await phoneContext.newPage();
  await init(phone);
  await phone.goto(`${origin}/?debug&quality=medium`);
  await settle(phone);
  await phone.waitForTimeout(1500);
  await phone.getByRole('button', { name: 'Menu' }).click();
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: out('screenshot-mobile.jpg'), type: 'jpeg', quality: 86 });
});
console.log('wrote assets/screenshot-desktop.jpg and assets/screenshot-mobile.jpg');
