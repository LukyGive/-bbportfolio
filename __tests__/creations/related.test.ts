import { describe, expect, it } from 'vitest';
import { getRelatedCreations } from '@/lib/creations/related';
import type { Creation } from '@/lib/creations/types';

const make = (id: string, patch: Partial<Creation> = {}): Creation => ({
  id,
  slug: patch.slug ?? id,
  name: patch.name ?? id,
  category: patch.category ?? 'Boss',
  tags: patch.tags ?? [],
  description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg',
  images: [],
  animations: [],
  featured: false,
  published: patch.published ?? true,
  createdAt: patch.createdAt ?? '2026-09-20',
});

describe('getRelatedCreations', () => {
  it('excludes the current and unpublished creations', () => {
    const current = make('a');
    const rows = [current, make('b'), make('hidden', { published: false })];
    expect(getRelatedCreations(current, rows).map((row) => row.id)).toEqual(['b']);
  });

  it('scores same category above tag-only matches', () => {
    const current = make('a', { category: 'Boss', tags: ['Ice'] });
    const tagOnly = make('tag', { category: 'NPC', tags: ['Ice'] });
    const category = make('cat', { category: 'Boss', tags: [] });
    expect(getRelatedCreations(current, [tagOnly, category]).map((row) => row.id)).toEqual(['cat', 'tag']);
  });

  it('uses shared tags to break score ties and obeys the limit', () => {
    const current = make('a', { tags: ['Ice', 'Crystal'] });
    const one = make('one', { tags: ['Ice'], createdAt: '2026-09-10' });
    const two = make('two', { tags: ['Ice', 'Crystal'], createdAt: '2026-09-01' });
    expect(getRelatedCreations(current, [one, two], 1).map((row) => row.id)).toEqual(['two']);
  });
});
