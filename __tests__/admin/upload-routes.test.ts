import { describe, expect, it, vi } from 'vitest';
import { authorizeUploadBatch, cleanupUploadedRefs } from '@/lib/admin/files';

const userId = '11111111-1111-4111-8111-111111111111';

function fakeStorageClient() {
  const remove = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    remove,
    client: {
      storage: {
        from() {
          return {
            createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { token: 'signed-token' }, error: null }),
            remove,
          };
        },
      },
    },
  };
}

describe('direct upload authorization', () => {
  it('signs server-generated paths and preserves clientKey', async () => {
    const { client } = fakeStorageClient();
    const result = await authorizeUploadBatch(client as never, userId, [{
      clientKey: 'viewer',
      kind: 'viewer',
      filename: 'model.glb',
      size: 1024,
      contentType: 'model/gltf-binary',
    }]);

    expect(result.uploads[0]).toMatchObject({
      clientKey: 'viewer',
      kind: 'viewer',
      bucket: 'viewer-models',
      token: 'signed-token',
    });
    expect(result.uploads[0].path).toContain(`uploads/${userId}/${result.sessionId}/`);
  });


  it('authorizes a bbpreview viewer in the existing viewer-models bucket', async () => {
    const { client } = fakeStorageClient();
    const result = await authorizeUploadBatch(client as never, userId, [{
      clientKey: 'viewer',
      kind: 'viewer',
      filename: 'preview.bbpreview',
      size: 2048,
      contentType: 'application/json',
    }]);
    expect(result.uploads[0]).toMatchObject({
      clientKey: 'viewer',
      kind: 'viewer',
      bucket: 'viewer-models',
      filename: 'preview.bbpreview',
      contentType: 'application/json',
    });
    expect(result.uploads[0].path).toMatch(/\.bbpreview$/i);
  });

  it('rejects more than twenty renders', async () => {
    const { client } = fakeStorageClient();
    const requests = Array.from({ length: 21 }, (_, index) => ({
      clientKey: `render:${index}`,
      kind: 'render' as const,
      filename: `${index}.png`,
      size: 1,
      contentType: 'image/png',
    }));
    await expect(authorizeUploadBatch(client as never, userId, requests)).rejects.toThrow(/20/);
  });

  it('cleanup rejects a path outside the current admin upload prefix', async () => {
    const { client } = fakeStorageClient();
    await expect(cleanupUploadedRefs(client as never, userId, [{
      clientKey: 'viewer',
      kind: 'viewer',
      bucket: 'viewer-models',
      path: 'uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.glb',
      filename: 'model.glb',
      size: 10,
      contentType: 'model/gltf-binary',
    }])).rejects.toThrow(/upload path/i);
  });
});
