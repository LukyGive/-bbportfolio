import { describe, expect, it } from 'vitest';
import { decodeBbPreview } from '@/lib/viewer-v2/codec';
import { extractBbmodelPreview } from '@/lib/viewer-v2/extract';

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read blob.'));
    reader.readAsText(blob);
  });
}

function source(overrides: Record<string, unknown> = {}) {
  return {
    meta: { format_version: '5.0', model_format: 'java_block', box_uv: false },
    resolution: { width: 16, height: 16 },
    textures: [{
      id: '0',
      uuid: 'texture-0',
      width: 16,
      height: 16,
      uv_width: 16,
      uv_height: 16,
      source: 'data:image/png;base64,AA==',
    }],
    elements: [{
      uuid: 'cube-1',
      type: 'cube',
      from: [0, 0, 0],
      to: [16, 16, 16],
      origin: [8, 8, 8],
      faces: Object.fromEntries(
        ['north', 'south', 'east', 'west', 'up', 'down'].map((face) => [
          face,
          { uv: [0, 0, 16, 16], texture: 0 },
        ]),
      ),
    }],
    outliner: ['cube-1'],
    animations: [],
    ...overrides,
  };
}

function bbmodel(value: unknown, name = 'model.bbmodel') {
  return new File([JSON.stringify(value)], name, { type: 'application/json' });
}

describe('extractBbmodelPreview', () => {
  it('creates a validated preview.bbpreview artifact with diagnostics', async () => {
    const artifact = await extractBbmodelPreview(bbmodel(source()));
    expect(artifact.file.name).toBe('preview.bbpreview');
    expect(artifact.file.type).toBe('application/json');
    expect(artifact.animationNames).toEqual([]);
    expect(artifact.diagnostics).toEqual({
      meshes: 1,
      vertices: 24,
      triangles: 12,
      textures: 1,
      nodes: 1,
      animations: 0,
    });

    const preview = decodeBbPreview(await readBlobText(artifact.file));
    expect(preview.metadata.meshCount).toBe(1);
    expect(preview.metadata.vertexCount).toBe(24);
    expect(preview.metadata.triangleCount).toBe(12);
    expect(preview.bounds).toEqual({ min: [0, 0, 0], max: [16, 16, 16] });
  });

  it('accepts cube-based Generic Model/free files and records generic_entity metadata', async () => {
    const generic = source({
      meta: { format_version: '5.0', model_format: 'free', box_uv: false },
    });

    const artifact = await extractBbmodelPreview(bbmodel(generic, 'boss.bbmodel'));
    const preview = decodeBbPreview(await readBlobText(artifact.file));

    expect(preview.metadata.sourceFormat).toBe('generic_entity');
    expect(artifact.diagnostics.meshes).toBe(1);
    expect(artifact.diagnostics.vertices).toBe(24);
  });

  it('rejects non-cube Generic Model elements instead of silently rendering bad geometry', async () => {
    const genericWithMesh = source({
      meta: { format_version: '5.0', model_format: 'free', box_uv: false },
      elements: [{
        uuid: 'mesh-1',
        type: 'mesh',
        vertices: {},
        faces: {},
      }],
      outliner: [],
    });

    await expect(extractBbmodelPreview(bbmodel(genericWithMesh)))
      .rejects.toThrow(/generic blockbench preview currently supports cube elements only/i);
  });

  it('preserves authored animation names in the artifact metadata', async () => {
    const value = source({
      groups: [{ uuid: 'group-1', name: 'Body', origin: [8, 8, 8], rotation: [0, 0, 0] }],
      outliner: [{ uuid: 'group-1', children: ['cube-1'] }],
      animations: [{
        uuid: 'anim-1',
        name: 'Idle',
        loop: 'loop',
        length: 1,
        snapping: 20,
        animators: {
          'group-1': {
            name: 'Body',
            keyframes: [{
              channel: 'rotation',
              time: 0,
              interpolation: 'linear',
              data_points: [{ x: 0, y: 0, z: 5 }],
            }],
          },
        },
      }],
    });
    const artifact = await extractBbmodelPreview(bbmodel(value));
    expect(artifact.animationNames).toEqual(['Idle']);
    expect(artifact.diagnostics.animations).toBe(1);
  });

  it('computes bounds after node transforms', async () => {
    const value = source({
      groups: [{ uuid: 'group-1', origin: [8, 8, 8], rotation: [0, 0, 90] }],
      outliner: [{ uuid: 'group-1', children: ['cube-1'] }],
    });
    const artifact = await extractBbmodelPreview(bbmodel(value));
    const preview = decodeBbPreview(await readBlobText(artifact.file));
    expect(preview.bounds.min[0]).toBeCloseTo(0);
    expect(preview.bounds.max[0]).toBeCloseTo(16);
    expect(preview.bounds.min[1]).toBeCloseTo(0);
    expect(preview.bounds.max[1]).toBeCloseTo(16);
  });

  it('rejects malformed Blockbench JSON before creating an artifact', async () => {
    const file = new File(['{'], 'broken.bbmodel', { type: 'application/json' });
    await expect(extractBbmodelPreview(file)).rejects.toThrow(/json/i);
  });
});
