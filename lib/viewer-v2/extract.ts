import { encodeBbPreview } from './codec';
import { extractPreviewAnimations } from './animations';
import { calculatePreviewBounds, createPreviewDiagnostics, type PreviewDiagnostics } from './diagnostics';
import { buildMergedPreviewMeshes } from './geometry';
import { buildPreviewHierarchy } from './hierarchy';
import { BBPREVIEW_MIME, BBPREVIEW_VERSION, type BbPreview } from './schema';
import { readSupportedBbmodel } from './source';
import { extractPreviewTextures } from './textures';

export type BbPreviewArtifact = {
  file: File;
  animationNames: string[];
  diagnostics: PreviewDiagnostics;
};

export async function extractBbmodelPreview(file: File): Promise<BbPreviewArtifact> {
  const source = await readSupportedBbmodel(file);
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
