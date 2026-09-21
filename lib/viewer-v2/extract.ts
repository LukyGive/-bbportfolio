import { encodeBbPreview } from './codec';
import { extractPreviewAnimations } from './animations';
import { calculatePreviewBounds, createPreviewDiagnostics, type PreviewDiagnostics } from './diagnostics';
import { buildMergedPreviewMeshes } from './geometry';
import { buildPreviewHierarchy } from './hierarchy';
import { BBPREVIEW_MIME, BBPREVIEW_VERSION, type BbPreview } from './schema';
import { readSupportedBbmodel, type SupportedBbmodel } from './source';
import { extractPreviewTextures } from './textures';

export type BbPreviewArtifact = {
  file: File;
  animationNames: string[];
  diagnostics: PreviewDiagnostics;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  if (typeof FileReader === 'undefined') {
    return Promise.reject(new Error('This environment cannot read Blockbench source files.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read Blockbench source file.'));
    reader.readAsText(blob);
  });
}

/**
 * Viewer V2 was originally authored around Java Block/Item files. Blockbench
 * Generic Model files use meta.model_format = "free" but cube-based Generic
 * Models share the cube/group/outliner/texture/animation structures that the
 * V2 pipeline already consumes.
 *
 * Normalize only cube-based Generic Models. Mesh/poly elements are explicitly
 * rejected instead of silently rendering incorrect geometry.
 */
async function readViewerSource(file: File): Promise<SupportedBbmodel> {
  const text = await readBlobText(file);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return readSupportedBbmodel(file);
  }

  if (!isRecord(parsed) || !isRecord(parsed.meta)) {
    return readSupportedBbmodel(file);
  }

  if (parsed.meta.model_format !== 'free') {
    return readSupportedBbmodel(file);
  }

  const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
  const unsupportedElement = elements.find((element) => {
    if (!isRecord(element)) return true;
    const type = element.type;
    return type !== undefined && type !== 'cube';
  });

  if (unsupportedElement) {
    const type = isRecord(unsupportedElement) && typeof unsupportedElement.type === 'string'
      ? unsupportedElement.type
      : 'unknown';
    throw new Error(
      `Generic Blockbench preview currently supports cube elements only; found element type: ${type}.`,
    );
  }

  const normalized: JsonRecord = {
    ...parsed,
    meta: {
      ...parsed.meta,
      model_format: 'java_block',
    },
  };

  const normalizedFile = new File(
    [JSON.stringify(normalized)],
    file.name,
    { type: file.type || 'application/json' },
  );

  const source = await readSupportedBbmodel(normalizedFile);
  return {
    ...source,
    format: 'generic_entity',
  };
}

export async function extractBbmodelPreview(file: File): Promise<BbPreviewArtifact> {
  const source = await readViewerSource(file);
  const hierarchy = buildPreviewHierarchy(source);
  const textureResult = extractPreviewTextures(source);
  const meshes = buildMergedPreviewMeshes(source, hierarchy, textureResult.textureMap);
  const animations = extractPreviewAnimations(source, hierarchy);
  const diagnostics = createPreviewDiagnostics(meshes, textureResult.textures, hierarchy.nodes, animations);

  const preview: BbPreview = {
    version: BBPREVIEW_VERSION,
    metadata: {
      generator: 'bbportfolio-viewer-v2',
      sourceFormat: source.format,
      meshCount: diagnostics.meshes,
      vertexCount: diagnostics.vertices,
      triangleCount: diagnostics.triangles,
      textureCount: diagnostics.textures,
      nodeCount: diagnostics.nodes,
      animationCount: diagnostics.animations,
    },
    bounds: calculatePreviewBounds(hierarchy.nodes, meshes),
    textures: textureResult.textures,
    materials: textureResult.materials,
    nodes: hierarchy.nodes,
    meshes,
    animations,
  };

  const blob = encodeBbPreview(preview);
  return {
    file: new File([blob], 'preview.bbpreview', { type: BBPREVIEW_MIME }),
    animationNames: animations.map((animation) => animation.name),
    diagnostics,
  };
}
