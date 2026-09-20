import { describe, expect, it } from 'vitest';
import { mapAdminCreation, mapPublicCreation } from '@/lib/creations/mapper';

const row = {
  id: '7c00c69f-5b12-4eed-b981-e969221a1fd2',
  slug: 'vorakh',
  name: 'Vorakh',
  category: 'Boss',
  tags: ['Ice'],
  description: 'Boss',
  animations: ['Idle'],
  featured: true,
  featured_order: 1,
  published: true,
  created_at: '2026-09-20',
  updated_at: '2026-09-20T00:00:00Z',
  software: 'Blockbench',
  model_type: 'Entity',
  version: null,
  notes: null,
  cover_image_path: '7c00/cover.webp',
  bbmodel_path: '7c00/vorakh.bbmodel',
  bbmodel_filename: 'vorakh.bbmodel',
  bbmodel_size: 123,
  creation_images: [
    { id: 'i2', creation_id: 'x', storage_path: '7c00/gallery/2.webp', alt_text: '', sort_order: 2, created_at: '2026-09-20' },
    { id: 'i1', creation_id: 'x', storage_path: '7c00/gallery/1.webp', alt_text: '', sort_order: 1, created_at: '2026-09-20' },
  ],
};

describe('creation mappers', () => {
  it('never maps bbmodel metadata into the public creation object', () => {
    const result = mapPublicCreation(row as never, 'https://example.supabase.co');
    expect(JSON.stringify(result)).not.toMatch(/bbmodel/i);
    expect(result.images[0]).toContain('/1.webp');
  });

  it('exposes only safe private attachment metadata to admin UI', () => {
    const result = mapAdminCreation(row as never, 'https://example.supabase.co');
    expect(result.bbmodel).toEqual({ filename: 'vorakh.bbmodel', size: 123 });
    expect(result.galleryImages.map((image) => image.id)).toEqual(['i1', 'i2']);
    expect(JSON.stringify(result)).not.toContain('7c00/vorakh.bbmodel');
  });
});
