import { describe, expect, it } from 'vitest';
import { buildMergedPreviewMeshes } from '@/lib/viewer-v2/geometry';
import { buildPreviewHierarchy } from '@/lib/viewer-v2/hierarchy';
import { extractPreviewTextures } from '@/lib/viewer-v2/textures';
import type { SourceCube, SourceTexture, SupportedBbmodel } from '@/lib/viewer-v2/source';

const texture: SourceTexture = {
  index: 0,
  id: '0',
  uuid: 'tex-0',
  width: 16,
  height: 16,
  uvWidth: 16,
  uvHeight: 16,
  source: 'data:image/png;base64,AA==',
};

function cube(uuid: string, from: [number, number, number] = [0, 0, 0], to: [number, number, number] = [16, 16, 16]): SourceCube {
  return {
    uuid,
    from,
    to,
    origin: [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2],
    rotation: [0, 0, 0],
    faces: Object.fromEntries(['north','south','east','west','up','down'].map((face) => [face, { uv: [0, 0, 16, 16], texture: 0 }])) as SourceCube['faces'],
  };
}

function model(cubes: SourceCube[], textures: SourceTexture[] = [texture]): SupportedBbmodel {
  return {
    format: 'java_block_item',
    resolution: { width: 16, height: 16 },
    cubes,
    textures,
    outliner: cubes.map((item) => item.uuid),
    animations: [],
  };
}

function build(source: SupportedBbmodel) {
  const hierarchy = buildPreviewHierarchy(source);
  const extracted = extractPreviewTextures(source);
  return {
    ...extracted,
    hierarchy,
    meshes: buildMergedPreviewMeshes(source, hierarchy, extracted.textureMap),
  };
}

describe('buildMergedPreviewMeshes', () => {
  it('emits 24 face vertices and 12 triangles for a fully visible cube', () => {
    const result = build(model([cube('one')]));
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].positions).toHaveLength(6 * 4 * 3);
    expect(result.meshes[0].normals).toHaveLength(6 * 4 * 3);
    expect(result.meshes[0].uvs).toHaveLength(6 * 4 * 2);
    expect(result.meshes[0].indices).toHaveLength(6 * 6);
  });

  it('merges two cubes sharing a render node and material', () => {
    const result = build(model([cube('one'), cube('two', [16, 0, 0], [32, 16, 16])]));
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].positions).toHaveLength(2 * 6 * 4 * 3);
    expect(result.meshes[0].indices).toHaveLength(2 * 6 * 6);
  });

  it('separates different materials', () => {
    const secondTexture: SourceTexture = { ...texture, index: 1, id: '1', uuid: 'tex-1' };
    const one = cube('one');
    const two = cube('two', [16, 0, 0], [32, 16, 16]);
    for (const face of Object.values(two.faces)) if (face) face.texture = 1;
    const result = build(model([one, two], [texture, secondTexture]));
    expect(result.meshes).toHaveLength(2);
    expect(result.materials).toHaveLength(2);
  });

  it('omits disabled and textureless faces', () => {
    const one = cube('one');
    one.faces.north = { uv: [0, 0, 16, 16], texture: null };
    one.faces.south = { uv: [0, 0, 16, 16], texture: 0, enabled: false };
    const result = build(model([one]));
    expect(result.meshes[0].positions).toHaveLength(4 * 4 * 3);
    expect(result.meshes[0].indices).toHaveLength(4 * 6);
  });

  it('normalizes UV coordinates using texture UV dimensions', () => {
    const one = cube('one');
    one.faces = { south: { uv: [4, 8, 12, 16], texture: 0 } };
    const customTexture = { ...texture, width: 32, height: 32, uvWidth: 32, uvHeight: 32 };
    const result = build(model([one], [customTexture]));
    expect(result.meshes[0].uvs).toEqual([
      0.125, 0.75,
      0.375, 0.75,
      0.125, 0.5,
      0.375, 0.5,
    ]);
  });

  it('keeps a rotated child cube in the child node local coordinate system', () => {
    const one = cube('one', [4, 4, 4], [6, 6, 6]);
    const source: SupportedBbmodel = {
      ...model([one]),
      format: 'generic_entity',
      outliner: [{ uuid: 'arm', origin: [5, 5, 5], rotation: [0, 0, 90], children: ['one'] }],
    };
    const result = build(source);
    const armId = result.hierarchy.nodeIdBySourceUuid.get('arm');
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].nodeId).toBe(armId);
    const xs = result.meshes[0].positions.filter((_value, index) => index % 3 === 0);
    expect(Math.max(...xs)).toBeCloseTo(1);
    expect(Math.min(...xs)).toBeCloseTo(-1);
  });

  it('collapses a Sakura-sized static single-material fixture to one mesh', () => {
    const cubes = Array.from({ length: 1804 }, (_, index) => cube(`cube-${index}`, [index * 2, 0, 0], [index * 2 + 1, 1, 1]));
    const source: SupportedBbmodel = {
      ...model(cubes),
      outliner: [{ uuid: 'sakura-root', origin: [8, 8, 8], rotation: [0, 0, 0], children: cubes.map((item) => item.uuid) }],
    };
    const result = build(source);
    expect(result.meshes).toHaveLength(1);
    expect(result.materials).toHaveLength(1);
    expect(result.textures).toHaveLength(1);
  });
});
