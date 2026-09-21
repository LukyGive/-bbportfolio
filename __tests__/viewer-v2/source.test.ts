import { describe, expect, it } from 'vitest';
import { parseSupportedBbmodel } from '@/lib/viewer-v2/source';

const texture = {
  name: 'atlas.png',
  id: '0',
  uuid: 'texture-0',
  width: 16,
  height: 16,
  uv_width: 16,
  uv_height: 16,
  source: 'data:image/png;base64,AA==',
};

const javaBlock = {
  meta: { format_version: '5.0', model_format: 'java_block', box_uv: false },
  resolution: { width: 16, height: 16 },
  elements: [],
  groups: [],
  textures: [texture],
  outliner: [],
  animations: [],
};

describe('parseSupportedBbmodel', () => {
  it('accepts Java Block/Item files', () => {
    expect(parseSupportedBbmodel(JSON.stringify(javaBlock)).format)
      .toBe('java_block_item');
  });

  it('rejects malformed json', () => {
    expect(() => parseSupportedBbmodel('{')).toThrow(/json/i);
  });

  it('rejects unknown model formats explicitly', () => {
    const source = {
      ...javaBlock,
      meta: { ...javaBlock.meta, model_format: 'mystery_plugin' },
    };
    expect(() => parseSupportedBbmodel(JSON.stringify(source)))
      .toThrow(/unsupported blockbench model format/i);
  });

  it('rejects an element whose face texture references a missing texture', () => {
    const source = {
      ...javaBlock,
      elements: [{
        uuid: 'cube-1',
        from: [0, 0, 0],
        to: [16, 16, 16],
        origin: [8, 8, 8],
        faces: {
          north: { uv: [0, 0, 16, 16], texture: 3 },
        },
      }],
      outliner: ['cube-1'],
    };
    expect(() => parseSupportedBbmodel(JSON.stringify(source)))
      .toThrow(/texture reference/i);
  });

  it('hydrates outliner group transforms from the groups table', () => {
    const source = {
      ...javaBlock,
      elements: [{
        uuid: 'cube-1',
        from: [0, 0, 0],
        to: [4, 4, 4],
        origin: [2, 2, 2],
        faces: {},
      }],
      groups: [{
        uuid: 'group-1',
        name: 'Handle',
        origin: [8, 8, 8],
        rotation: [0, 0, 10],
      }],
      outliner: [{ uuid: 'group-1', children: ['cube-1'] }],
    };
    const parsed = parseSupportedBbmodel(JSON.stringify(source));
    expect(parsed.outliner[0]).toMatchObject({
      uuid: 'group-1',
      name: 'Handle',
      origin: [8, 8, 8],
      rotation: [0, 0, 10],
      children: ['cube-1'],
    });
  });


  it('treats Blockbench hold mode as non-looping', () => {
    const source = {
      ...javaBlock,
      animations: [{
        name: 'Death',
        loop: 'hold',
        length: 1,
        animators: {},
      }],
    };
    expect(parseSupportedBbmodel(JSON.stringify(source)).animations[0]?.loop).toBe(false);
  });

  it('rejects cyclic group nesting', () => {
    const source = {
      ...javaBlock,
      groups: [
        { uuid: 'a', name: 'A', origin: [0, 0, 0], rotation: [0, 0, 0] },
        { uuid: 'b', name: 'B', origin: [0, 0, 0], rotation: [0, 0, 0] },
      ],
      outliner: [{
        uuid: 'a',
        children: [{ uuid: 'b', children: [{ uuid: 'a', children: [] }] }],
      }],
    };
    expect(() => parseSupportedBbmodel(JSON.stringify(source))).toThrow(/cycle/i);
  });
});
