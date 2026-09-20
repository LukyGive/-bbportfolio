import { describe, expect, it } from 'vitest';
import { normalizeCreationInput } from '@/lib/admin/creations';

const base = {
  name: ' Vorakh ', category: ' Boss ', tags: ['Ice', 'Ice', ' Fantasy '], description: ' Heavy ',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: ['Idle', ' Idle '],
  featured: false, featuredOrder: 12, published: true, software: ' Blockbench ', modelType: ' Entity ',
};

describe('normalizeCreationInput', () => {
  it('generates a safe slug and clears featured order when not featured', () => {
    const value = normalizeCreationInput(base as never);
    expect(value.slug).toBe('vorakh');
    expect(value.featured_order).toBeNull();
    expect(value.tags).toEqual(['Ice', 'Fantasy']);
  });

  it('rejects unsafe custom slugs', () => {
    expect(() => normalizeCreationInput({ ...base, slug: '../bad' } as never)).toThrow(/slug/i);
  });
});
