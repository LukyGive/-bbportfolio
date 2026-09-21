import { expect, test } from '@playwright/test';

test('public portfolio browsing works without admin access', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /characters, creatures/i })).toBeVisible();
  await expect(page.getByText('Featured creations')).toBeVisible();

  await page.goto('/creations');
  await page.getByRole('button', { name: 'Boss', exact: true }).click();
  await expect(page.getByText('Vorakh')).toBeVisible();
  await expect(page.getByText('Alchemist NPC')).toHaveCount(0);

  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByRole('searchbox').fill('ice');
  await expect(page.getByText('Vorakh')).toBeVisible();

  await page.goto('/creations/vorakh');
  await expect(page.getByRole('heading', { name: 'Vorakh' })).toBeVisible();
  await expect(page.getByText('Animations')).toBeVisible();
  await expect(page.getByText(/\.bbmodel/i)).toHaveCount(0);

  const missing = await page.goto('/creations/definitely-not-a-real-creation');
  expect(missing?.status()).toBe(404);
});

test('pack archive and detail are public portfolio routes', async ({ page }) => {
  await page.goto('/packs');
  await expect(page.getByRole('heading', { name: 'Packs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Packs', exact: true })).toBeVisible();

  const firstPack = page.locator('.pack-card').first();
  if (await firstPack.count()) {
    await firstPack.click();
    await expect(page.getByText('Included creations')).toBeVisible();
    await expect(page.locator('.pack-hero canvas')).toHaveCount(0);
  }

  const missing = await page.goto('/packs/definitely-not-a-real-pack');
  expect(missing?.status()).toBe(404);
});

test('signed-out admin redirects to login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/creations');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('packs have no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/packs');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
