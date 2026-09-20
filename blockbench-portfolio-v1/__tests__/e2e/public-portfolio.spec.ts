import { expect, test } from '@playwright/test';

const draftId = 'e2e-hidden-draft';
const draftPayload = {
  id: draftId,
  slug: draftId,
  name: 'E2E Hidden Draft',
  category: 'Boss',
  tags: ['Hidden'],
  description: 'Temporary test fixture',
  coverImage: '/models/_placeholder/creation-placeholder.svg',
  images: [],
  animations: [],
  featured: false,
  published: false,
  createdAt: '2026-09-20',
};

test.beforeEach(async ({ request }) => {
  const form = { payload: JSON.stringify(draftPayload) };
  const response = await request.post('/api/admin/creations', { multipart: form });
  if (![201, 409].includes(response.status())) throw new Error(`Could not seed draft fixture: ${response.status()}`);
});

test.afterEach(async ({ request }) => {
  await request.delete('/api/admin/creations', { data: { id: draftId } }).catch(() => undefined);
});

test('public portfolio browsing works without exposing drafts', async ({ page }) => {
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

  const draftResponse = await page.goto(`/creations/${draftId}`);
  expect(draftResponse?.status()).toBe(404);
});

test('mobile layout has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/creations');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
