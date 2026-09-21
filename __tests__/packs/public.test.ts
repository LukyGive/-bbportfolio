import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(async () => ({ data: [], error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  return { chain, from: vi.fn(() => chain) };
});

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ from: db.from })),
}));

import { PUBLIC_PACK_SELECT, getPackBySlug, getPublishedPacks } from '@/lib/packs/public';

beforeEach(() => {
  vi.clearAllMocks();
  db.chain.select.mockImplementation(() => db.chain);
  db.chain.eq.mockImplementation(() => db.chain);
  db.chain.order.mockResolvedValue({ data: [], error: null });
  db.chain.maybeSingle.mockResolvedValue({ data: null, error: null });
});

it('keeps private creation source fields out of public pack selection', () => {
  expect(PUBLIC_PACK_SELECT).not.toMatch(/bbmodel_/i);
  expect(PUBLIC_PACK_SELECT).not.toMatch(/viewer_error/i);
  expect(PUBLIC_PACK_SELECT).toMatch(/pack_creations/i);
});

it('explicitly filters the pack archive by published even in an authenticated session', async () => {
  await getPublishedPacks();
  expect(db.chain.eq).toHaveBeenCalledWith('published', true);
});

it('explicitly filters pack detail by published and slug', async () => {
  await getPackBySlug('sakura-pack');
  expect(db.chain.eq).toHaveBeenCalledWith('published', true);
  expect(db.chain.eq).toHaveBeenCalledWith('slug', 'sakura-pack');
});
