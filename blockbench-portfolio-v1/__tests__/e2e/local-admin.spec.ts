import { expect, test } from '@playwright/test';

const name = 'E2E Crystal Sentinel';

test.afterEach(async ({ request }) => {
  await request.delete('/api/admin/creations', { data: { id: 'e2e-crystal-sentinel' } }).catch(() => undefined);
});

test('local admin creates, features, edits and deletes a creation', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText('LOCAL ADMIN')).toBeVisible();
  await page.getByRole('button', { name: /new creation/i }).click();

  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Category').fill('Boss');
  await page.getByText('Featured', { exact: true }).click();
  await page.getByLabel('Featured order').fill('7');
  await page.getByLabel('Add render images').setInputFiles({
    name: 'sentinel.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('button', { name: /save creation/i }).click();

  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(name)).toBeVisible();
  await page.getByText(name).click();
  await expect(page.getByLabel('Featured order')).toHaveValue('7');

  await page.getByLabel('Name').fill(`${name} Updated`);
  await page.getByRole('button', { name: /save creation/i }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(`${name} Updated`)).toBeVisible();

  await page.getByRole('button', { name: `Delete ${name} Updated` }).click();
  await expect(page.getByRole('button', { name: `Confirm delete ${name} Updated` })).toBeVisible();
  await page.getByRole('button', { name: `Confirm delete ${name} Updated` }).click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByText(`${name} Updated`)).toHaveCount(0);
});
