import { expect, test } from '@playwright/test';
import { openScene, watch } from './helpers.js';

const sectionsNav = (page) => page.getByRole('navigation', { name: 'Sections' });

test('loads, renders the story and stays quiet in the console', async ({ page }) => {
  const seen = watch(page);
  await openScene(page);
  await expect(page).toHaveTitle(/ORBIT/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Scroll through');
  for (const landmark of ['banner', 'main', 'contentinfo']) {
    await expect(page.getByRole(landmark)).toHaveCount(1);
  }
  await expect(sectionsNav(page)).toBeVisible();
  await expect(page.locator('#scene')).toHaveAttribute('aria-hidden', 'true'); // decorative
  expect(seen.problems).toEqual([]);
});

test('every third-party request is gone: the page only talks to its own origin', async ({ page }) => {
  const seen = watch(page);
  await openScene(page);
  const foreign = seen.requests.filter(
    (url) => !url.startsWith('http://127.0.0.1') && !url.startsWith('data:'),
  );
  expect(foreign).toEqual([]);
});

test('the heading outline is intact', async ({ page }) => {
  await page.goto('/?quality=low');
  const headings = await page.getByRole('heading').allTextContents();
  expect(headings.map((h) => h.replace(/\s+/g, ' ').trim())).toEqual([
    'Scroll through a quiet galaxy of your work.',
    'A template that reads like a story, not a slideshow.',
    'Selected work slots, ready for yours.',
    'Nebula Analytics',
    'Halcyon Brand Site',
    'Field Notes',
    'Your next project',
    'Built for craft and speed.',
    'Make it yours.',
  ]);
});

test.describe('navigation', () => {
  test('a nav link scrolls to its section and is marked as the current location', async ({ page }) => {
    await page.goto('/?quality=low');
    await expect(page.locator('[aria-current]')).toHaveCount(0); // hero: no link for it

    const nav = sectionsNav(page);
    for (const [name, id] of [
      ['About', 'about'],
      ['Work', 'work'],
      ['Capabilities', 'capabilities'],
      ['Contact', 'contact'],
    ]) {
      await nav.getByRole('link', { name }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport({ ratio: 0.4 });
      await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'location');
      await expect(page.locator('[aria-current]')).toHaveCount(1); // and only that one
    }

    await page.getByRole('link', { name: 'ORBIT home' }).click();
    await expect(page.locator('[aria-current]')).toHaveCount(0);
  });

  test('the active link is right even where a section is taller than the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto('/?quality=low');
    const work = await page.locator('#work').boundingBox();
    expect(work.height).toBeGreaterThan(600 * 1.5);
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      work.y + work.height / 2 - 300 + (await page.evaluate(() => scrollY)),
    );
    await expect(page.locator('[aria-current="location"]')).toHaveText('Work');
  });

  test('the skip link is the first tab stop and moves focus into the content', async ({ page }) => {
    await page.goto('/?quality=low');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await expect(page.locator('#main')).toBeFocused();
  });

  test('the progress bar follows the scroll', async ({ page }) => {
    await page.goto('/?quality=low');
    const scale = () => page.$eval('#progress-bar', (el) => new DOMMatrix(getComputedStyle(el).transform).a);
    expect(await scale()).toBe(0);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(scale).toBeCloseTo(1, 2);
  });
});

test('links that open a new tab are safe', async ({ page }) => {
  await page.goto('/?quality=low');
  const unsafe = await page.$$eval('a[target="_blank"]', (links) =>
    links.filter((a) => !/\bnoopener\b/.test(a.rel)).map((a) => a.href),
  );
  expect(unsafe).toEqual([]);
});

test('scrolling never triggers layout-affecting resizes of the canvas', async ({ page }) => {
  await openScene(page);
  const rect = () => page.$eval('#scene', (c) => [c.clientWidth, c.clientHeight]);
  const before = await rect();
  await page.evaluate(() => window.scrollTo(0, 1200));
  expect(await rect()).toEqual(before);
});
