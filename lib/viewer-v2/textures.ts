import type { PreviewMaterial, PreviewTexture } from './schema';
import type { SourceTexture, SupportedBbmodel } from './source';

export type PreviewTextureMap = {
  defaultMaterialId?: number;
  byReference: Map<string, number>;
};

function referenceKeys(texture: SourceTexture): string[] {
  return [
    `index:${texture.index}`,
    ...(texture.id ? [`id:${texture.id}`, `raw:${texture.id}`] : []),
    ...(texture.uuid ? [`uuid:${texture.uuid}`, `raw:${texture.uuid}`] : []),
  ];
}

export function resolvePreviewMaterialId(
  textureMap: PreviewTextureMap,
  reference: number | string | null | undefined,
): number | undefined {
  if (reference === null || reference === -1 || reference === '-1') return undefined;
  if (reference === undefined) return textureMap.defaultMaterialId;
  if (typeof reference === 'number') return textureMap.byReference.get(`index:${reference}`);
  if (/^\d+$/.test(reference)) {
    const byIndex = textureMap.byReference.get(`index:${Number(reference)}`);
    if (byIndex !== undefined) return byIndex;
  }
  return textureMap.byReference.get(`raw:${reference}`);
}

function mimeType(source: string): 'image/png' | 'image/webp' {
  if (source.startsWith('data:image/webp;base64,')) return 'image/webp';
  return 'image/png';
}

function materialForTexture(texture: SourceTexture, id: number): PreviewMaterial {
  const renderMode = texture.renderMode?.toLowerCase();
  const renderSides = texture.renderSides?.toLowerCase();
  const transparent = renderMode === 'transparent' || renderMode === 'layered';
  return {
    id,
    textureId: id,
    transparent,
    // Minecraft-style textures are normally cutouts. This avoids expensive
    // transparent sorting while preserving fully transparent pixels.
    ...(!transparent ? { alphaTest: 0.01 } : {}),
    ...(renderSides === 'double' || renderSides === 'both' ? { doubleSided: true } : {}),
  };
}

export function extractPreviewTextures(source: SupportedBbmodel): {
  textures: PreviewTexture[];
  materials: PreviewMaterial[];
  textureMap: PreviewTextureMap;
} {
  const textures: PreviewTexture[] = [];
  const materials: PreviewMaterial[] = [];
  const byReference = new Map<string, number>();

  for (const texture of source.textures) {
    const id = textures.length;
    textures.push({
      id,
      mimeType: mimeType(texture.source),
      width: texture.width,
      height: texture.height,
      data: texture.source,
      pixelated: true,
    });
    materials.push(materialForTexture(texture, id));
    for (const key of referenceKeys(texture)) byReference.set(key, id);
  }

  return {
    textures,
    materials,
    textureMap: {
      ...(materials.length > 0 ? { defaultMaterialId: materials[0].id } : {}),
      byReference,
    },
  };
}
