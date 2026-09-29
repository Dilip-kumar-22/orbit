import { expect, test } from '@playwright/test';

const toggle = (page) => page.getByRole('button', { name: 'Menu' });
const links = (page) => page.getByRole('navigation', { name: 'Sections' });

test.describe('small screens', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the links sit behind a Menu button that exposes its state', async ({ page }) => {
    await page.goto('/?quality=low');
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toHaveAttribute('aria-controls', 'nav-panel');
    await expect(links(page)).toBeHidden();
    await expect(page.locator('#nav-panel')).toBeAttached();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(links(page)).toBeVisible();
    for (const name of ['About', 'Work', 'Capabilities', 'Contact']) {
      await expect(links(page).getByRole('link', { name })).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Get the code' })).toBeVisible();
  });

  test('keyboard: Enter opens it, Tab walks the links, Escape closes it and returns focus', async ({
    page,
  }) => {
    await page.goto('/?quality=low');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // brand
    await page.keyboard.press('Tab'); // Menu
    await expect(toggle(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Tab');
    await expect(links(page).getByRole('link', { name: 'About' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(links(page).getByRole('link', { name: 'Work' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toBeFocused();
    await expect(links(page)).toBeHidden();
  });

  test('choosing a link navigates and closes the menu', async ({ page }) => {
    await page.goto('/?quality=low');
    await toggle(page).click();
    await links(page).getByRole('link', { name: 'Capabilities' }).click();
    await expect(page).toHaveURL(/#capabilities$/);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(links(page)).toBeHidden();
    await expect(page.locator('#capabilities')).toBeInViewport({ ratio: 0.3 });
  });

  test('tapping outside closes it, and so does tabbing out of it', async ({ page }) => {
    await page.goto('/?quality=low');
    await toggle(page).click();
    await page.mouse.click(200, 700);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');

    await toggle(page).click();
    await page.getByRole('link', { name: 'Get the code' }).focus();
    await page.keyboard.press('Tab'); // leaves the header
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('the toggle has a visible focus ring and a comfortable target size', async ({ page }) => {
    await page.goto('/?quality=low');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const ring = await toggle(page).evaluate((el) => getComputedStyle(el).outlineWidth);
    expect(parseFloat(ring)).toBeGreaterThanOrEqual(2);
    const box = await toggle(page).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(40);
  });

  test('growing past the breakpoint resets the menu and shows the desktop layout', async ({ page }) => {
    await page.goto('/?quality=low');
    await toggle(page).click();
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(toggle(page)).toBeHidden();
    await expect(links(page)).toBeVisible();
    await expect(page.locator('#nav')).not.toHaveClass(/is-open/);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(links(page)).toBeHidden();
  });

  test('without JavaScript the links stay visible and there is no dead button', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(toggle(page)).toBeHidden();
    await expect(links(page)).toBeVisible();
    for (const name of ['About', 'Work', 'Capabilities', 'Contact']) {
      await expect(links(page).getByRole('link', { name })).toBeVisible();
    }
    await context.close();
  });
});

test('on wide screens there is no menu button and the links are inline', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?quality=low');
  await expect(toggle(page)).toBeHidden();
  await expect(links(page)).toBeVisible();
});
