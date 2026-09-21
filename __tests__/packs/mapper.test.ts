import { expect, it } from 'vitest';
import { mapPublicPack } from '@/lib/packs/mapper';

it('filters draft members even if the database row is visible to an authenticated admin', () => {
  const baseCreation = {
    category: 'Item',
    tags: [],
    description: '',
    animations: [],
    featured: false,
    featured_order: null,
    created_at: '2026-09-21',
    updated_at: '2026-09-21T00:00:00Z',
    software: null,
    model_type: null,
    version: null,
    notes: null,
    cover_image_path: null,
    bbmodel_path: null,
    bbmodel_filename: null,
    bbmodel_size: null,
    viewer_model_path: null,
    viewer_status: 'none',
    viewer_error: null,
    viewer_updated_at: null,
    viewer_animation_names: [],
    creation_images: [],
  };

  const row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'sakura-pack',
    name: 'Sakura Pack',
    description: '',
    cover_image_path: null,
    published: true,
    created_at: '2026-09-21T00:00:00Z',
    updated_at: '2026-09-21T00:00:00Z',
    pack_creations: [
      {
        pack_id: 'p',
        sort_order: 1,
        creation_id: 'draft',
        creations: {
          ...baseCreation,
          id: 'draft',
          slug: 'draft',
          name: 'Draft',
          published: false,
        },
      },
      {
        pack_id: 'p',
        sort_order: 0,
        creation_id: 'public',
        creations: {
          ...baseCreation,
          id: 'public',
          slug: 'public',
          name: 'Public',
          published: true,
        },
      },
    ],
  };

  const pack = mapPublicPack(
    row as never,
    'https://example.supabase.co',
  );

  expect(pack.creations.map((item) => item.name)).toEqual(['Public']);
});

it('maps an uploaded pack cover to the public render bucket', () => {
  const row = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    slug: 'covered-pack',
    name: 'Covered Pack',
    description: '',
    cover_image_path: 'packs/cover.webp',
    published: true,
    created_at: '2026-09-21T00:00:00Z',
    updated_at: '2026-09-21T00:00:00Z',
    pack_creations: [],
  };

  expect(
    mapPublicPack(
      row as never,
      'https://example.supabase.co',
    ).coverImage,
  ).toBe(
    'https://example.supabase.co/storage/v1/object/public/portfolio-renders/packs/cover.webp',
  );
});
