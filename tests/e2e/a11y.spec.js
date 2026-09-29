import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Automated checks catch a useful subset of accessibility problems, not all of them: this suite
// backs the README's claims but is not a WCAG conformance audit.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const violationsOf = async (page) => {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return violations.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
};

test.describe('axe', () => {
  test('desktop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); // everything visible, nothing mid-transition
    await page.goto('/?quality=low');
    expect(await violationsOf(page)).toEqual([]);
  });

  test('phone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?quality=low');
    expect(await violationsOf(page)).toEqual([]);
  });

  test('with the mobile menu open', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?quality=low');
    await page.getByRole('button', { name: /menu/i }).click();
    expect(await violationsOf(page)).toEqual([]);
  });

  test('without the 3D backdrop', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      window.ORBIT_CONFIG = { reducedMotionScene: 'disabled' };
    });
    await page.goto('/');
    expect(await violationsOf(page)).toEqual([]);
  });
});

test('keyboard: every stop shows a visible focus indicator and nothing traps focus', async ({ page }) => {
  await page.goto('/?quality=low');
  const stops = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return {
        name: (el.getAttribute('aria-label') || el.textContent || el.tagName)
          .trim()
          .replace(/\s+/g, ' ')
          .slice(0, 40),
        outline: `${s.outlineStyle} ${s.outlineWidth}`,
        visible: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2,
      };
    });
    if (!stop) break; // focus left the document: the cycle is complete
    stops.push(stop);
  }
  expect(stops.length).toBeGreaterThan(8);
  expect(stops.filter((s) => !s.visible)).toEqual([]);
  expect(stops.length).toBeLessThan(40);
});

test('forced colors: gradient text and controls stay legible', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.goto('/?quality=low');
  const accent = await page.$eval('.accent', (el) => {
    const s = getComputedStyle(el);
    return { color: s.color, fill: s.webkitTextFillColor, image: s.backgroundImage };
  });
  expect(accent.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(accent.fill).not.toBe('rgba(0, 0, 0, 0)');
  expect(accent.image).toBe('none');
  // controls keep a visible boundary when their fills are replaced by system colours
  const border = await page.$eval('.btn--primary', (el) => getComputedStyle(el).borderTopWidth);
  expect(parseFloat(border)).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#scene')).toBeHidden();
});

test('the decorative layers are hidden from assistive technology', async ({ page }) => {
  await page.goto('/?quality=low');
  await expect(page.locator('#scene')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.grain')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.progress')).toHaveAttribute('aria-hidden', 'true');
});
