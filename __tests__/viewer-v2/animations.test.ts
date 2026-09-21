import { describe, expect, it } from 'vitest';
import { extractPreviewAnimations, findDefaultAnimationName } from '@/lib/viewer-v2/animations';
import { buildPreviewHierarchy } from '@/lib/viewer-v2/hierarchy';
import type { SupportedBbmodel } from '@/lib/viewer-v2/source';

function base(overrides: Partial<SupportedBbmodel> = {}): SupportedBbmodel {
  return {
    format: 'generic_entity',
    resolution: { width: 16, height: 16 },
    textures: [], cubes: [], outliner: [], animations: [],
    ...overrides,
  };
}

describe('viewer v2 animations', () => {
  it('prefers an animation containing idle', () => {
    expect(findDefaultAnimationName([
      { name: 'Walk', duration: 1, loop: true, tracks: [] },
      { name: 'animation.idle', duration: 2, loop: true, tracks: [] },
    ])).toBe('animation.idle');
  });

  it('falls back to the first animation', () => {
    expect(findDefaultAnimationName([
      { name: 'Walk', duration: 1, loop: true, tracks: [] },
      { name: 'Attack', duration: 1, loop: false, tracks: [] },
    ])).toBe('Walk');
  });

  it('maps position, rotation and scale to the correct node using absolute local values', () => {
    const source = base({
      cubes: [{ uuid: 'cube', from: [0,0,0], to: [1,1,1], origin: [.5,.5,.5], rotation: [0,0,0], faces: {} }],
      outliner: [{ uuid: 'arm', origin: [8,8,8], rotation: [0,0,10], children: ['cube'] }],
      animations: [{
        name: 'Idle', loop: true, length: 1, snapping: 20,
        animators: [{
          sourceUuid: 'arm',
          keyframes: [
            { channel: 'position', time: 0, interpolation: 'linear', dataPoints: [{ x: 1, y: 2, z: 3 }] },
            { channel: 'rotation', time: 0, interpolation: 'linear', dataPoints: [{ x: 5, y: 0, z: 15 }] },
            { channel: 'scale', time: 0, interpolation: 'linear', dataPoints: [{ x: 2, y: 3, z: 4 }] },
          ],
        }],
      }],
    });
    const hierarchy = buildPreviewHierarchy(source);
    const result = extractPreviewAnimations(source, hierarchy);
    const armId = hierarchy.nodeIdBySourceUuid.get('arm');
    expect(result[0].loop).toBe(true);
    expect(result[0].tracks).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: armId, channel: 'position', values: [9, 10, 11] }),
      expect.objectContaining({ nodeId: armId, channel: 'scale', values: [2, 3, 4] }),
    ]));
    const rotation = result[0].tracks.find((track) => track.channel === 'rotation')!;
    expect(rotation.values[0]).toBeCloseTo(5 * Math.PI / 180);
    expect(rotation.values[2]).toBeCloseTo(25 * Math.PI / 180);
  });

  it('preserves a pure step channel as step interpolation', () => {
    const source = base({
      outliner: [{ uuid: 'head', origin: [0,0,0], rotation: [0,0,0], children: [] }],
      animations: [{ name: 'Snap', loop: false, length: 1, animators: [{ sourceUuid: 'head', keyframes: [
        { channel: 'position', time: 0, interpolation: 'step', dataPoints: [{ x: 0, y: 0, z: 0 }] },
        { channel: 'position', time: 1, interpolation: 'step', dataPoints: [{ x: 4, y: 0, z: 0 }] },
      ] }] }],
    });
    const result = extractPreviewAnimations(source, buildPreviewHierarchy(source));
    expect(result[0].tracks[0].interpolation).toBe('step');
    expect(result[0].tracks[0].times).toEqual([0, 1]);
  });

  it('samples bezier/catmull style interpolation to linear keys', () => {
    const source = base({
      outliner: [{ uuid: 'head', origin: [0,0,0], rotation: [0,0,0], children: [] }],
      animations: [{ name: 'Smooth', loop: true, length: 1, snapping: 10, animators: [{ sourceUuid: 'head', keyframes: [
        { channel: 'position', time: 0, interpolation: 'catmullrom', dataPoints: [{ x: 0, y: 0, z: 0 }] },
        { channel: 'position', time: 1, interpolation: 'catmullrom', dataPoints: [{ x: 10, y: 0, z: 0 }] },
      ] }] }],
    });
    const result = extractPreviewAnimations(source, buildPreviewHierarchy(source));
    expect(result[0].tracks[0].interpolation).toBe('linear');
    expect(result[0].tracks[0].times.length).toBeGreaterThan(2);
  });

  it('creates a virtual node only for a directly animated cube', () => {
    const source = base({
      cubes: [
        { uuid: 'animated', from: [0,0,0], to: [2,2,2], origin: [1,1,1], rotation: [0,0,15], faces: {} },
        { uuid: 'static', from: [2,0,0], to: [4,2,2], origin: [3,1,1], rotation: [0,0,0], faces: {} },
      ],
      outliner: [{ uuid: 'root-group', origin: [0,0,0], rotation: [0,0,0], children: ['animated', 'static'] }],
      animations: [{ name: 'Attack', loop: false, length: 1, animators: [{ sourceUuid: 'animated', keyframes: [
        { channel: 'rotation', time: 0, dataPoints: [{ x: 0, y: 0, z: 10 }] },
      ] }] }],
    });
    const hierarchy = buildPreviewHierarchy(source);
    expect(hierarchy.elementNodeForCube.has('animated')).toBe(true);
    expect(hierarchy.elementNodeForCube.has('static')).toBe(false);
    expect(hierarchy.renderNodeForCube.get('animated')).toBe(hierarchy.elementNodeForCube.get('animated'));
  });

  it('rejects an animation target that is not a group or cube', () => {
    const source = base({
      animations: [{ name: 'Broken', loop: false, length: 1, animators: [{ sourceUuid: 'missing', keyframes: [
        { channel: 'rotation', time: 0, dataPoints: [{ x: 0, y: 0, z: 0 }] },
      ] }] }],
    });
    expect(() => buildPreviewHierarchy(source)).toThrow(/missing.*animation target/i);
  });
});
