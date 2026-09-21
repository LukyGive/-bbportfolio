import * as THREE from 'three';
import type { BbPreview, PreviewTexture } from '../schema';

export type BuiltPreviewMaterials = {
  byId: Map<number, THREE.Material>;
  dispose(): void;
};

function dataUriToBlob(source: PreviewTexture): Blob {
  const separator = source.data.indexOf(',');
  if (separator < 0) throw new Error(`Preview texture ${source.id} has an invalid data URI.`);
  const binary = atob(source.data.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: source.mimeType });
}

async function createPreviewTexture(source: PreviewTexture): Promise<{ texture: THREE.Texture; bitmap: ImageBitmap }> {
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode preview textures.');
  const bitmap = await createImageBitmap(dataUriToBlob(source), { imageOrientation: 'flipY' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  if (source.pixelated) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  texture.needsUpdate = true;
  return { texture, bitmap };
}

export async function buildPreviewMaterials(preview: BbPreview): Promise<BuiltPreviewMaterials> {
  const textures = new Map<number, THREE.Texture>();
  const bitmaps: ImageBitmap[] = [];
  const materials = new Map<number, THREE.Material>();

  try {
    for (const sourceTexture of preview.textures) {
      const built = await createPreviewTexture(sourceTexture);
      textures.set(sourceTexture.id, built.texture);
      bitmaps.push(built.bitmap);
    }

    for (const sourceMaterial of preview.materials) {
      const map = sourceMaterial.textureId === undefined ? undefined : textures.get(sourceMaterial.textureId);
      if (sourceMaterial.textureId !== undefined && !map) {
        throw new Error(`Preview material ${sourceMaterial.id} references missing texture ${sourceMaterial.textureId}.`);
      }
      materials.set(sourceMaterial.id, new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map,
        metalness: 0,
        roughness: 1,
        transparent: sourceMaterial.transparent,
        alphaTest: sourceMaterial.alphaTest ?? 0,
        side: sourceMaterial.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      }));
    }
  } catch (error) {
    for (const material of materials.values()) material.dispose();
    for (const texture of textures.values()) texture.dispose();
    for (const bitmap of bitmaps) bitmap.close();
    throw error;
  }

  let disposed = false;
  return {
    byId: materials,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const material of materials.values()) material.dispose();
      for (const texture of textures.values()) texture.dispose();
      for (const bitmap of bitmaps) bitmap.close();
    },
  };
}
