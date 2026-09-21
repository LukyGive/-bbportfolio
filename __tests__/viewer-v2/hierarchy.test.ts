import { describe, expect, it } from 'vitest';
import { buildPreviewHierarchy } from '@/lib/viewer-v2/hierarchy';
import type { SupportedBbmodel } from '@/lib/viewer-v2/source';

function source(overrides: Partial<SupportedBbmodel> = {}): SupportedBbmodel {
  return {
    format: 'generic_entity',
    resolution: { width: 16, height: 16 },
    textures: [],
    animations: [],
    cubes: [],
    outliner: [],
    ...overrides,
  };
}

describe('buildPreviewHierarchy', () => {
  it('assigns cubes to their authored groups while retaining nested pivots', () => {
    const hierarchy = buildPreviewHierarchy(source({
      cubes: [
        { uuid: 'body-cube', from: [0, 0, 0], to: [4, 4, 4], origin: [2, 2, 2], rotation: [0, 0, 0], faces: {} },
        { uuid: 'hand-cube', from: [4, 0, 0], to: [6, 2, 2], origin: [5, 1, 1], rotation: [0, 0, 0], faces: {} },
      ],
      outliner: [{
        uuid: 'body',
        name: 'Body',
        origin: [0, 8, 0],
        rotation: [0, 0, 0],
        children: [
          'body-cube',
          {
            uuid: 'hand',
            name: 'Hand',
            origin: [4, 4, 0],
            rotation: [0, 0, 10],
            children: ['hand-cube'],
          },
        ],
      }],
    }));

    expect(hierarchy.nodeForCube.get('body-cube')).toBe(hierarchy.nodeIdBySourceUuid.get('body'));
    expect(hierarchy.nodeForCube.get('hand-cube')).toBe(hierarchy.nodeIdBySourceUuid.get('hand'));
    const handId = hierarchy.nodeIdBySourceUuid.get('hand')!;
    const bodyId = hierarchy.nodeIdBySourceUuid.get('body')!;
    expect(hierarchy.nodes.find((node) => node.id === handId)?.parentId).toBe(bodyId);
    expect(hierarchy.nodes.find((node) => node.id === handId)?.position).toEqual([4, -4, 0]);
  });

  it('bakes transform-neutral static groups to the root render node', () => {
    const hierarchy = buildPreviewHierarchy(source({
      cubes: [{ uuid: 'cube', from: [0, 0, 0], to: [1, 1, 1], origin: [0.5, 0.5, 0.5], rotation: [0, 0, 0], faces: {} }],
      outliner: [{ uuid: 'folder', origin: [8, 8, 8], rotation: [0, 0, 0], children: ['cube'] }],
    }));
    expect(hierarchy.nodeForCube.get('cube')).not.toBe(0);
    expect(hierarchy.renderNodeForCube.get('cube')).toBe(0);
  });

  it('keeps an animated zero-rotation group as a render node', () => {
    const model = source({
      cubes: [{ uuid: 'cube', from: [0, 0, 0], to: [1, 1, 1], origin: [0.5, 0.5, 0.5], rotation: [0, 0, 0], faces: {} }],
      outliner: [{ uuid: 'arm', origin: [8, 8, 8], rotation: [0, 0, 0], children: ['cube'] }],
      animations: [{
        name: 'Idle', loop: true, length: 1,
        animators: [{ sourceUuid: 'arm', keyframes: [] }],
      }],
    });
    const hierarchy = buildPreviewHierarchy(model);
    expect(hierarchy.renderNodeForCube.get('cube')).toBe(hierarchy.nodeIdBySourceUuid.get('arm'));
  });
});
