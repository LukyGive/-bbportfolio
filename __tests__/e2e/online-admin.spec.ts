import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const canRunAdmin = Boolean(adminEmail && adminPassword);

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(adminEmail!);
  await page.getByLabel('Password').fill(adminPassword!);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('online admin', () => {
  test.skip(!canRunAdmin, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to run authenticated admin E2E.');

  test('creates a public creation with a private bbmodel, then deletes it', async ({ page }) => {
    await login(page);
    const name = `E2E Private Source ${Date.now()}`;

    await page.getByRole('button', { name: /new creation/i }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Category').fill('Items');
    await page.getByLabel('Blockbench source').setInputFiles({
      name: 'e2e-private.bbmodel',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('{}'),
    });
    await page.getByRole('button', { name: /save creation/i }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(name)).toBeVisible();

    await page.getByText(name).click();
    await expect(page.getByText('e2e-private.bbmodel')).toBeVisible();
    const download = page.getByRole('link', { name: /download/i });
    await expect(download).toHaveAttribute('href', /\/api\/admin\/bbmodel\//);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await page.goto(`/creations/${slug}`);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText(/\.bbmodel/i)).toHaveCount(0);

    await page.goto('/admin');
    const deleteButton = page.getByRole('button', { name: `Delete ${name}` });
    await deleteButton.click();
    await page.getByRole('button', { name: `Confirm delete ${name}` }).click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test('creates a pack from existing creations, publishes it, then deletes it', async ({ page }) => {
    await login(page);
    const name = `E2E Pack ${Date.now()}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await page.getByRole('button', { name: /^packs$/i }).click();
    await page.getByRole('button', { name: /new pack/i }).click();
    await page.getByLabel('Name').fill(name);

    const addButtons = page.getByRole('button', { name: /add .*$/i });
    await expect(addButtons.first()).toBeVisible();
    await addButtons.first().click();

    await page.getByRole('button', { name: /save pack/i }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /^packs$/i }).click();
    await expect(page.getByText(name)).toBeVisible();

    await page.goto(`/packs/${slug}`);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.locator('.pack-hero canvas')).toHaveCount(0);

    await page.goto('/admin');
    await page.getByRole('button', { name: /^packs$/i }).click();
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('button', { name: `Confirm delete ${name}` }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /^packs$/i }).click();
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
