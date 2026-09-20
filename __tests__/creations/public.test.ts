import { describe, expect, it } from 'vitest';
import { PUBLIC_CREATION_SELECT, sortFeaturedCreations } from '@/lib/creations/public';
import type { Creation } from '@/lib/creations/types';

const base: Creation = {
  id: '1', slug: 'a', name: 'A', category: 'Boss', tags: [], description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: [],
  featured: true, published: true, createdAt: '2026-09-20',
};

describe('public creation query contract', () => {
  it('never selects private bbmodel columns', () => {
    expect(PUBLIC_CREATION_SELECT).not.toMatch(/bbmodel_/i);
  });

  it('orders featured entries by manual order, then date and name', () => {
    const rows: Creation[] = [
      { ...base, id: 'c', slug: 'c', name: 'C', featuredOrder: 2 },
      { ...base, id: 'b', slug: 'b', name: 'B', featuredOrder: 1 },
      { ...base, id: 'a', slug: 'a', name: 'A', featuredOrder: 1 },
    ];
    expect(sortFeaturedCreations(rows).map((row) => row.name)).toEqual(['A', 'B', 'C']);
  });
});
