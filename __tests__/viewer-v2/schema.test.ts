import { describe, expect, it } from 'vitest';
import { decodeBbPreview, encodeBbPreview } from '@/lib/viewer-v2/codec';
import { assertMeshArrayLengths, assertTrackArrayLengths } from '@/lib/viewer-v2/validate';
import { BBPREVIEW_LIMITS } from '@/lib/viewer-v2/schema';
import type { BbPreview } from '@/lib/viewer-v2/schema';

const base: BbPreview = {
  version: 1,
  metadata: {
    generator: 'bbportfolio-viewer-v2',
    sourceFormat: 'java_block_item',
    meshCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    textureCount: 0,
    nodeCount: 1,
    animationCount: 0,
  },
  bounds: { min: [0, 0, 0], max: [16, 16, 16] },
  textures: [],
  materials: [],
  nodes: [{
    id: 0,
    parentId: null,
    pivot: [0, 0, 0],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }],
  meshes: [],
  animations: [],
};

describe('bbpreview codec', () => {
  it('accepts a valid v1 preview', () => {
    expect(decodeBbPreview(JSON.stringify(base)).version).toBe(1);
  });

  it('encodes the preview as JSON', async () => {
    const blob = encodeBbPreview(base);
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual(base);
  });

  it('rejects unsupported versions', () => {
    expect(() => decodeBbPreview(JSON.stringify({ ...base, version: 99 })))
      .toThrow(/unsupported preview version/i);
  });

  it('rejects hostile counts before geometry validation', () => {
    const hostile = {
      ...base,
      metadata: { ...base.metadata, vertexCount: 500_000_000 },
    };
    expect(() => decodeBbPreview(JSON.stringify(hostile)))
      .toThrow(/vertex limit/i);
  });

  it('rejects textures larger than the configured dimension limit', () => {
    const bad = {
      ...base,
      metadata: { ...base.metadata, textureCount: 1 },
      textures: [{
        id: 0,
        mimeType: 'image/png',
        width: 65536,
        height: 65536,
        data: 'data:image/png;base64,AA==',
        pixelated: true,
      }],
    };
    expect(() => decodeBbPreview(JSON.stringify(bad)))
      .toThrow(/texture dimension limit/i);
  });


  it('rejects oversized raw mesh arrays before numeric mapping', () => {
    expect(() => assertMeshArrayLengths(
      BBPREVIEW_LIMITS.maxVertices * 3 + 3,
      BBPREVIEW_LIMITS.maxVertices * 3 + 3,
      BBPREVIEW_LIMITS.maxVertices * 2 + 2,
      3,
    )).toThrow(/vertex limit/i);

    expect(() => assertMeshArrayLengths(9, 9, 6, BBPREVIEW_LIMITS.maxIndices + 3))
      .toThrow(/index limit/i);
  });

  it('rejects oversized raw animation arrays before numeric mapping', () => {
    expect(() => assertTrackArrayLengths(BBPREVIEW_LIMITS.maxAnimationKeys + 1, 3))
      .toThrow(/animation key limit/i);
    expect(() => assertTrackArrayLengths(1, BBPREVIEW_LIMITS.maxAnimationKeys * 3 + 3))
      .toThrow(/animation key limit/i);
  });

  it('rejects mesh references to unknown nodes', () => {
    const bad = {
      ...base,
      metadata: { ...base.metadata, meshCount: 1, vertexCount: 3, triangleCount: 1 },
      materials: [{ id: 0, transparent: false }],
      meshes: [{
        nodeId: 999,
        materialId: 0,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2],
      }],
    };
    expect(() => decodeBbPreview(JSON.stringify(bad))).toThrow(/unknown node/i);
  });

  it('rejects invalid index values', () => {
    const bad = {
      ...base,
      metadata: { ...base.metadata, meshCount: 1, vertexCount: 3, triangleCount: 1 },
      materials: [{ id: 0, transparent: false }],
      meshes: [{
        nodeId: 0,
        materialId: 0,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        uvs: [0, 0, 1, 0, 0, 1],
        indices: [0, 1, 3],
      }],
    };
    expect(() => decodeBbPreview(JSON.stringify(bad))).toThrow(/index/i);
  });
});
