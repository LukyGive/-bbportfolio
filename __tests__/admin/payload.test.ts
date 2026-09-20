import { describe, expect, it } from 'vitest';
import { parseCreationMutationBody } from '@/lib/admin/payload';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionId = '22222222-2222-4222-8222-222222222222';
const sourceObjectId = '33333333-3333-4333-8333-333333333333';
const viewerObjectId = '44444444-4444-4444-8444-444444444444';

const payload = {
  name: 'Vorakh', category: 'Boss', tags: ['Ice'], description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: [],
  featured: false, published: true,
};

const sourceRef = {
  clientKey: 'bbmodel', kind: 'bbmodel' as const, bucket: 'bbmodels' as const,
  path: `uploads/${userId}/${sessionId}/${sourceObjectId}-Vorakh.bbmodel`,
  filename: 'Vorakh.bbmodel', size: 1024, contentType: 'application/octet-stream',
};

const viewerRef = {
  clientKey: 'viewer', kind: 'viewer' as const, bucket: 'viewer-models' as const,
  path: `uploads/${userId}/${sessionId}/${viewerObjectId}.glb`,
  filename: 'model.glb', size: 2048, contentType: 'model/gltf-binary',
};

describe('parseCreationMutationBody', () => {
  it('parses a source paired with its viewer without File objects', () => {
    const result = parseCreationMutationBody({
      payload,
      uploads: {
        renders: [],
        bbmodel: sourceRef,
        viewer: { ...viewerRef, animationNames: ['Idle', 'Attack', 'Idle'] },
      },
    }, userId);

    expect(result.uploads.bbmodel?.path).toBe(sourceRef.path);
    expect(result.uploads.viewer?.animationNames).toEqual(['Idle', 'Attack']);
  });

  it('rejects a source without a viewer', () => {
    expect(() => parseCreationMutationBody({
      payload,
      uploads: { renders: [], bbmodel: sourceRef },
    }, userId)).toThrow(/viewer/i);
  });

  it('rejects a forged upload path even when the bucket is correct', () => {
    expect(() => parseCreationMutationBody({
      payload,
      uploads: {
        renders: [],
        bbmodel: { ...sourceRef, path: sourceRef.path.replace(userId, otherUserId) },
        viewer: { ...viewerRef, animationNames: [] },
      },
    }, userId)).toThrow(/upload path/i);
  });

  it('allows metadata-only updates with no new uploads', () => {
    const result = parseCreationMutationBody({ payload, originalId: 'creation-id' }, userId);
    expect(result.uploads).toEqual({ renders: [] });
    expect(result.originalId).toBe('creation-id');
  });

  it('rejects malformed payloads and more than twenty renders', () => {
    expect(() => parseCreationMutationBody({ payload: { category: 'Boss' } }, userId)).toThrow(/name/i);
    expect(() => parseCreationMutationBody({
      payload,
      uploads: { renders: Array.from({ length: 21 }, () => ({ ...viewerRef, kind: 'render', bucket: 'portfolio-renders' })) },
    }, userId)).toThrow(/20/i);
  });
});

describe('parseViewerReplacementBody', () => {
  it('accepts one current-admin viewer ref and deduplicates animation names', async () => {
    const { parseViewerReplacementBody } = await import('@/lib/admin/payload');
    const result = parseViewerReplacementBody({
      viewer: { ...viewerRef, animationNames: ['Idle', 'Idle', 'Attack'] },
    }, userId);
    expect(result.animationNames).toEqual(['Idle', 'Attack']);
  });
});
