import { describe, expect, it } from 'vitest';
import { removeObjectGroups, safeBbmodelFilename, validateBbmodelFile, validateImageFile } from '@/lib/admin/files';

describe('private source validation', () => {
  it('accepts uppercase bbmodel extension even with a generic MIME type', () => {
    const file = { name: 'Vorakh.BBMODEL', type: 'application/octet-stream', size: 1024 } as File;
    expect(() => validateBbmodelFile(file)).not.toThrow();
  });

  it('rejects misleading extensions', () => {
    const file = { name: 'vorakh.bbmodel.exe', type: 'application/octet-stream', size: 1024 } as File;
    expect(() => validateBbmodelFile(file)).toThrow(/bbmodel/i);
  });

  it('sanitizes path traversal out of source filenames', () => {
    expect(safeBbmodelFilename('../My Boss.bbmodel')).toBe('My-Boss.bbmodel');
  });

  it('rejects a source above 50 MB', () => {
    const file = { name: 'huge.bbmodel', type: '', size: 50 * 1024 * 1024 + 1 } as File;
    expect(() => validateBbmodelFile(file)).toThrow(/50 MB/i);
  });

  it('only accepts supported web image MIME types and 10 MB maximum', () => {
    expect(() => validateImageFile({ name: 'render.webp', type: 'image/webp', size: 5 } as File)).not.toThrow();
    expect(() => validateImageFile({ name: 'render.gif', type: 'image/gif', size: 5 } as File)).toThrow(/image/i);
  });

  it('reports storage cleanup failures instead of swallowing them', async () => {
    const client = {
      storage: {
        from(bucket: string) {
          return {
            async remove() {
              return bucket === 'bbmodels'
                ? { data: null, error: { message: 'private cleanup failed' } }
                : { data: null, error: null };
            },
          };
        },
      },
    };

    const failures = await removeObjectGroups(client as never, [
      { bucket: 'portfolio-renders', paths: ['a.webp'] },
      { bucket: 'bbmodels', paths: ['secret.bbmodel'] },
    ]);

    expect(failures).toEqual(['private cleanup failed']);
  });

});

it('creates admin/session scoped immutable viewer paths', async () => {
  const { createAuthorizedObjectPath } = await import('@/lib/admin/files');
  const path = createAuthorizedObjectPath(
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    {
      clientKey: 'viewer',
      kind: 'viewer',
      filename: 'model.glb',
      size: 100,
      contentType: 'model/gltf-binary',
    },
  );

  expect(path).toMatch(
    /^uploads\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/[0-9a-f-]+\.glb$/i,
  );
});

it('rejects a missing signed upload object', async () => {
  const { verifyUploadedObject } = await import('@/lib/admin/files');
  const client = {
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  };
  await expect(verifyUploadedObject(client as never, '11111111-1111-4111-8111-111111111111', {
    clientKey: 'viewer', kind: 'viewer', bucket: 'viewer-models',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.glb',
    filename: 'model.glb', size: 100, contentType: 'model/gltf-binary',
  })).rejects.toThrow(/not found/i);
});

it('rejects an actual uploaded viewer above 50 MiB', async () => {
  const { verifyUploadedObject } = await import('@/lib/admin/files');
  const name = '33333333-3333-4333-8333-333333333333.glb';
  const client = {
    storage: { from: () => ({ list: async () => ({
      data: [{ name, metadata: { size: 50 * 1024 * 1024 + 1, mimetype: 'model/gltf-binary' } }],
      error: null,
    }) }) },
  };
  await expect(verifyUploadedObject(client as never, '11111111-1111-4111-8111-111111111111', {
    clientKey: 'viewer', kind: 'viewer', bucket: 'viewer-models',
    path: `uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/${name}`,
    filename: 'model.glb', size: 100, contentType: 'model/gltf-binary',
  })).rejects.toThrow(/50 MiB/i);
});
