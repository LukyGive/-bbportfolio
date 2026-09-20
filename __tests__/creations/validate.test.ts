import { describe, expect, it } from 'vitest';
import { validateCreation, validateCreationList } from '@/lib/creations/validate';

const base = {
  id: 'vorakh',
  slug: 'vorakh',
  name: 'Vorakh',
  category: 'Boss',
  tags: ['Ice'],
  description: 'Heavy ice boss.',
  coverImage: '/models/vorakh/cover.webp',
  images: ['/models/vorakh/front.webp'],
  animations: ['Idle'],
  featured: true,
  featuredOrder: 1,
  published: true,
  createdAt: '2026-09-20',
};

describe('validateCreation', () => {
  it('accepts a complete valid record', () => {
    expect(validateCreation(base)).toEqual(base);
  });

  it('rejects empty names and categories', () => {
    expect(() => validateCreation({ ...base, name: '' })).toThrow(/name/i);
    expect(() => validateCreation({ ...base, category: '  ' })).toThrow(/category/i);
  });

  it('rejects unsafe slugs', () => {
    expect(() => validateCreation({ ...base, slug: '../vorakh' })).toThrow(/slug/i);
  });

  it('rejects public image paths outside /models', () => {
    expect(() => validateCreation({ ...base, coverImage: '/private/a.webp' })).toThrow(/image/i);
  });

  it('rejects invalid dates', () => {
    expect(() => validateCreation({ ...base, createdAt: '20/09/2026' })).toThrow(/date/i);
  });
});

describe('validateCreationList', () => {
  it('rejects duplicate slugs', () => {
    expect(() => validateCreationList([base, { ...base, id: 'v2' }])).toThrow(/duplicate slug/i);
  });

  it('rejects duplicate ids', () => {
    expect(() => validateCreationList([base, { ...base, slug: 'v2' }])).toThrow(/duplicate id/i);
  });
});
