import { describe, expect, it } from 'vitest';
import {
  validateUploadRequestFile,
  validateUploadedAssetRef,
} from '@/lib/admin/upload-contracts';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

describe('upload contracts', () => {
  it('accepts a valid private source request', () => {
    expect(() => validateUploadRequestFile({
      clientKey: 'bbmodel',
      kind: 'bbmodel',
      filename: 'Vorakh.bbmodel',
      size: 1024,
      contentType: 'application/octet-stream',
    })).not.toThrow();
  });

  it('rejects mismatched MIME types for viewer and private source uploads', () => {
    expect(() => validateUploadRequestFile({
      clientKey: 'viewer', kind: 'viewer', filename: 'model.glb', size: 10, contentType: 'text/plain',
    })).toThrow(/content type/i);

    expect(() => validateUploadRequestFile({
      clientKey: 'bbmodel', kind: 'bbmodel', filename: 'model.bbmodel', size: 10, contentType: 'image/png',
    })).toThrow(/content type/i);
  });

  it('rejects file sizes above the product limit', () => {
    expect(() => validateUploadRequestFile({
      clientKey: 'viewer',
      kind: 'viewer',
      filename: 'model.glb',
      size: 50 * 1024 * 1024 + 1,
      contentType: 'model/gltf-binary',
    })).toThrow(/50 MiB/i);
  });

  it('rejects an asset path owned by another admin prefix', () => {
    expect(() => validateUploadedAssetRef(userId, {
      clientKey: 'viewer',
      kind: 'viewer',
      bucket: 'viewer-models',
      path: `uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/${sessionId}/33333333-3333-4333-8333-333333333333.glb`,
      filename: 'model.glb',
      size: 1024,
      contentType: 'model/gltf-binary',
    })).toThrow(/upload path/i);
  });

  it('rejects a bucket-kind mismatch', () => {
    expect(() => validateUploadedAssetRef(userId, {
      clientKey: 'bbmodel',
      kind: 'bbmodel',
      bucket: 'viewer-models',
      path: `uploads/${userId}/${sessionId}/33333333-3333-4333-8333-333333333333-source.bbmodel`,
      filename: 'source.bbmodel',
      size: 1024,
      contentType: 'application/octet-stream',
    })).toThrow(/bucket/i);
  });
});
