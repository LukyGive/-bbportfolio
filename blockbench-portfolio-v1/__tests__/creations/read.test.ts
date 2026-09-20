import { describe, expect, it } from 'vitest';
import { parseCreationDataSafely, selectFeatured, selectPublished, sortNewestFirst } from '@/lib/creations/read';
import type { Creation } from '@/lib/creations/types';

const make = (patch: Partial<Creation>): Creation => ({
  id: patch.id ?? 'x',
  slug: patch.slug ?? 'x',
  name: patch.name ?? 'X',
  category: patch.category ?? 'Boss',
  tags: patch.tags ?? [],
  description: patch.description ?? '',
  coverImage: patch.coverImage ?? '/models/x/cover.webp',
  images: patch.images ?? [],
  animations: patch.animations ?? [],
  featured: patch.featured ?? false,
  featuredOrder: patch.featuredOrder,
  published: patch.published ?? true,
  createdAt: patch.createdAt ?? '2026-09-20',
});

describe('public creation selectors', () => {
  it('never exposes unpublished creations', () => {
    expect(selectPublished([make({ id: 'a' }), make({ id: 'b', slug: 'b', published: false })]).map((x) => x.id)).toEqual(['a']);
  });

  it('sorts duplicate featured order deterministically by date then name', () => {
    const rows = [
      make({ id: 'b', slug: 'b', name: 'Beta', featured: true, featuredOrder: 1, createdAt: '2026-01-01' }),
      make({ id: 'a', slug: 'a', name: 'Alpha', featured: true, featuredOrder: 1, createdAt: '2026-02-01' }),
    ];
    expect(selectFeatured(rows).map((x) => x.name)).toEqual(['Alpha', 'Beta']);
  });


  it('ignores malformed records instead of crashing public reads', () => {
    const good = make({ id: 'good', slug: 'good', name: 'Good' });
    expect(parseCreationDataSafely([good, { id: 'broken' }])).toEqual([good]);
  });

  it('sorts newest creations first with name as deterministic tie-breaker', () => {
    const rows = [
      make({ id: 'b', slug: 'b', name: 'Beta', createdAt: '2026-09-01' }),
      make({ id: 'a', slug: 'a', name: 'Alpha', createdAt: '2026-09-01' }),
      make({ id: 'c', slug: 'c', name: 'Newest', createdAt: '2026-09-20' }),
    ];
    expect(sortNewestFirst(rows).map((x) => x.name)).toEqual(['Newest', 'Alpha', 'Beta']);
  });
});
