import { describe, expect, it } from 'vitest';
import { normalizeCreationInput } from '@/lib/admin/creations';
import { createRemoteCreation, updateRemoteCreation } from '@/lib/admin/remote';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const creationId = '55555555-5555-4555-8555-555555555555';

const base = {
  name: ' Vorakh ', category: ' Boss ', tags: ['Ice', 'Ice', ' Fantasy '], description: ' Heavy ',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: ['Idle', ' Idle '],
  featured: false, featuredOrder: 12, published: true, software: ' Blockbench ', modelType: ' Entity ',
};

const sourceRef = {
  clientKey: 'bbmodel', kind: 'bbmodel' as const, bucket: 'bbmodels' as const,
  path: `uploads/${userId}/${sessionId}/33333333-3333-4333-8333-333333333333-Vorakh.bbmodel`,
  filename: 'Vorakh.bbmodel', size: 1024, contentType: 'application/octet-stream',
};
const viewerRef = {
  clientKey: 'viewer', kind: 'viewer' as const, bucket: 'viewer-models' as const,
  path: `uploads/${userId}/${sessionId}/44444444-4444-4444-8444-444444444444.glb`,
  filename: 'model.glb', size: 2048, contentType: 'model/gltf-binary', animationNames: ['Idle'],
};

describe('remote creation mutations', () => {
  it('generates a safe slug and clears featured order when not featured', () => {
    const value = normalizeCreationInput(base as never);
    expect(value.slug).toBe('vorakh');
    expect(value.featured_order).toBeNull();
    expect(value.tags).toEqual(['Ice', 'Fantasy']);
  });

  it('rejects unsafe custom slugs', () => {
    expect(() => normalizeCreationInput({ ...base, slug: '../bad' } as never)).toThrow(/slug/i);
  });

  it('cleans uploaded assets when creation normalization rejects the mutation', async () => {
    const removed: string[] = [];
    const client = {
      storage: {
        from() {
          return {
            async remove(paths: string[]) { removed.push(...paths); return { data: null, error: null }; },
          };
        },
      },
      from() { throw new Error('database should not be touched after normalization failure'); },
    };

    await expect(createRemoteCreation(
      client as never,
      userId,
      { ...base, slug: '../bad' } as never,
      { renders: [], bbmodel: sourceRef, viewer: viewerRef },
    )).rejects.toThrow(/slug/i);

    expect(removed).toContain(sourceRef.path);
    expect(removed).toContain(viewerRef.path);
  });

  it('keeps the previous source/viewer when database replacement fails and cleans only new uploads', async () => {
    const removed: string[] = [];
    const current = {
      id: creationId,
      created_at: '2026-09-20',
      cover_image_path: null,
      bbmodel_path: 'old/source.bbmodel',
      bbmodel_filename: 'old.bbmodel',
      bbmodel_size: 100,
      viewer_model_path: 'old/viewer.glb',
      viewer_status: 'ready',
      creation_images: [],
    };

    const storage = {
      from() {
        return {
          async list(folder: string, options: { search?: string }) {
            const name = options.search ?? '';
            const size = name.endsWith('.glb') ? viewerRef.size : sourceRef.size;
            return { data: [{ name, metadata: { size } }], error: null };
          },
          async remove(paths: string[]) { removed.push(...paths); return { data: null, error: null }; },
        };
      },
    };

    const client = {
      storage,
      from(table: string) {
        if (table === 'creations') {
          return {
            select() { return { eq() { return { maybeSingle: async () => ({ data: current, error: null }) }; } }; },
            update() { return { eq: async () => ({ error: { message: 'forced db failure' } }) }; },
          };
        }
        if (table === 'creation_images') {
          return {
            insert() { return { select: async () => ({ data: [], error: null }) }; },
            delete() { return { in: async () => ({ error: null }) }; },
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    };

    await expect(updateRemoteCreation(
      client as never,
      userId,
      creationId,
      base as never,
      { renders: [], bbmodel: sourceRef, viewer: viewerRef },
      false,
    )).rejects.toThrow(/forced db failure/i);

    expect(removed).toContain(sourceRef.path);
    expect(removed).toContain(viewerRef.path);
    expect(removed).not.toContain('old/source.bbmodel');
    expect(removed).not.toContain('old/viewer.glb');
  });
});

it('returns a short-lived signed source URL instead of downloading source bytes', async () => {
  const { getPrivateBbmodelSignedDownload } = await import('@/lib/admin/remote');
  const current = {
    id: creationId,
    bbmodel_path: 'private/source.bbmodel',
    bbmodel_filename: 'Vorakh.bbmodel',
    creation_images: [],
  };
  let signedPath = '';
  const client = {
    storage: {
      from() {
        return {
          async createSignedUrl(path: string) {
            signedPath = path;
            return { data: { signedUrl: 'https://storage.example/signed-source' }, error: null };
          },
        };
      },
    },
    from(table: string) {
      if (table !== 'creations') throw new Error(table);
      return {
        select() { return { eq() { return { maybeSingle: async () => ({ data: current, error: null }) }; } }; },
      };
    },
  };

  const result = await getPrivateBbmodelSignedDownload(client as never, creationId);
  expect(result).toEqual({ url: 'https://storage.example/signed-source', filename: 'Vorakh.bbmodel' });
  expect(signedPath).toBe('private/source.bbmodel');
});
