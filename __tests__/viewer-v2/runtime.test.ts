import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildPreviewScene } from '@/lib/viewer-v2/runtime/build-scene';
import type { BbPreview } from '@/lib/viewer-v2/schema';

function preview(): BbPreview {
  return {
    version: 1,
    metadata: {
      generator: 'bbportfolio-viewer-v2',
      sourceFormat: 'generic_entity',
      meshCount: 1,
      vertexCount: 3,
      triangleCount: 1,
      textureCount: 0,
      nodeCount: 2,
      animationCount: 2,
    },
    bounds: { min: [0, 0, 0], max: [1, 1, 0] },
    textures: [],
    materials: [{ id: 0, transparent: false }],
    nodes: [
      { id: 0, parentId: null, name: 'Root', pivot: [0, 0, 0], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      { id: 1, parentId: 0, name: 'Arm', pivot: [1, 0, 0], position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    ],
    meshes: [{
      nodeId: 1,
      materialId: 0,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    }],
    animations: [
      {
        name: 'Walk', duration: 1, loop: true,
        tracks: [{ nodeId: 1, channel: 'position', times: [0, 1], values: [1, 0, 0, 2, 0, 0], interpolation: 'linear' }],
      },
      {
        name: 'animation.idle', duration: 2, loop: true,
        tracks: [{ nodeId: 1, channel: 'rotation', times: [0, 2], values: [0, 0, 0, 0, 0, Math.PI / 2], interpolation: 'linear' }],
      },
    ],
  };
}

describe('buildPreviewScene', () => {
  it('builds hierarchy, buffer geometry, clips and Idle default', async () => {
    const built = await buildPreviewScene(preview());
    const rootNode = built.root.getObjectByName('bbv2-node-0');
    const arm = built.root.getObjectByName('bbv2-node-1');
    expect(rootNode).toBeDefined();
    expect(arm?.parent).toBe(rootNode);

    const mesh = arm?.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    expect(mesh).toBeDefined();
    expect(mesh.geometry.getAttribute('position').count).toBe(3);
    expect(mesh.geometry.index?.count).toBe(3);
    expect(built.clips.map((clip) => clip.name)).toEqual(['Walk', 'animation.idle']);
    expect(built.defaultAnimation).toBe('animation.idle');
    expect(built.mixer).toBeInstanceOf(THREE.AnimationMixer);
    built.dispose();
  });



  it('decodes ImageBitmap textures with Blockbench-compatible vertical orientation', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createImageBitmapMock = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);

    const source = preview();
    source.metadata.textureCount = 1;
    source.textures = [{
      id: 0,
      mimeType: 'image/png',
      width: 1,
      height: 1,
      data: 'data:image/png;base64,iVBORw0KGgo=',
      pixelated: true,
    }];
    source.materials = [{ id: 0, textureId: 0, transparent: false }];

    const built = await buildPreviewScene(source);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(createImageBitmapMock.mock.calls[0]?.[1]).toEqual({ imageOrientation: 'flipY' });
    built.dispose();
    vi.unstubAllGlobals();
  });

  it('disposes geometry and shared materials exactly once', async () => {
    const built = await buildPreviewScene(preview());
    const arm = built.root.getObjectByName('bbv2-node-1');
    const mesh = arm?.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const material = mesh.material as THREE.Material;
    const materialDispose = vi.spyOn(material, 'dispose');
    built.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });
});
