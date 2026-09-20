import { describe, expect, it, vi } from 'vitest';
import { tusUploadFingerprint, uploadAuthorizedFile } from '@/lib/admin/direct-upload';
import type { AuthorizedUpload } from '@/lib/admin/upload-contracts';

function descriptor(size: number): AuthorizedUpload {
  return {
    clientKey: 'viewer',
    kind: 'viewer',
    filename: 'model.glb',
    size,
    contentType: 'model/gltf-binary',
    bucket: 'viewer-models',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.glb',
    token: 'signed-token',
    cacheControl: '31536000',
  };
}

function fileOfSize(size: number): File {
  return { name: 'model.glb', size, type: 'model/gltf-binary' } as File;
}

describe('direct upload strategy', () => {
  it('uses uploadToSignedUrl at or below 6 MiB', async () => {
    const standardUpload = vi.fn().mockResolvedValue(undefined);
    const resumableUpload = vi.fn().mockResolvedValue(undefined);
    const file = fileOfSize(6 * 1024 * 1024);

    await uploadAuthorizedFile(descriptor(file.size), file, { standardUpload, resumableUpload });

    expect(standardUpload).toHaveBeenCalledOnce();
    expect(resumableUpload).not.toHaveBeenCalled();
  });

  it('uses TUS above 6 MiB', async () => {
    const standardUpload = vi.fn().mockResolvedValue(undefined);
    const resumableUpload = vi.fn().mockResolvedValue(undefined);
    const file = fileOfSize(6 * 1024 * 1024 + 1);

    await uploadAuthorizedFile(descriptor(file.size), file, { standardUpload, resumableUpload });

    expect(resumableUpload).toHaveBeenCalledOnce();
    expect(standardUpload).not.toHaveBeenCalled();
  });

  it('reports upload progress as integer percentage', async () => {
    const onProgress = vi.fn();
    const file = fileOfSize(7 * 1024 * 1024);

    await uploadAuthorizedFile(descriptor(file.size), file, {
      onProgress,
      standardUpload: vi.fn(),
      resumableUpload: async (_descriptor, _file, options) => options.onProgress?.(3, 4),
    });

    expect(onProgress).toHaveBeenCalledWith(75);
  });

  it('rejects a file whose size differs from its authorization', async () => {
    await expect(uploadAuthorizedFile(descriptor(10), fileOfSize(11), {
      standardUpload: vi.fn(),
      resumableUpload: vi.fn(),
    })).rejects.toThrow(/size/i);
  });

  it('scopes resumable fingerprints to the immutable Storage path', async () => {
    const file = { name: 'model.glb', size: 42, type: 'model/gltf-binary', lastModified: 123 } as File;
    const first = await tusUploadFingerprint(descriptor(file.size), file);
    const second = await tusUploadFingerprint({ ...descriptor(file.size), path: descriptor(file.size).path.replace('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444') }, file);

    expect(first).toContain(descriptor(file.size).path);
    expect(first).not.toBe(second);
  });

});
