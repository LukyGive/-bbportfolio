export const BBPREVIEW_VERSION = 1 as const;
export const BBPREVIEW_MIME = 'application/json' as const;

export const BBPREVIEW_LIMITS = {
  maxPreviewBytes: 50 * 1024 * 1024,
  maxVertices: 2_000_000,
  maxIndices: 6_000_000,
  maxMeshes: 2_000,
  maxTextures: 64,
  maxTextureDimension: 8_192,
  maxNodes: 4_096,
  maxAnimations: 256,
  maxAnimationKeys: 2_000_000,
} as const;

export type PreviewSourceFormat = 'java_block_item' | 'generic_entity' | 'unknown';
export type Vec3 = [number, number, number];

export type PreviewMetadata = {
  generator: 'bbportfolio-viewer-v2';
  sourceFormat: PreviewSourceFormat;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  textureCount: number;
  nodeCount: number;
  animationCount: number;
};

export type PreviewBounds = {
  min: Vec3;
  max: Vec3;
};

export type PreviewTexture = {
  id: number;
  mimeType: 'image/png' | 'image/webp';
  width: number;
  height: number;
  data: string;
  pixelated: boolean;
};

export type PreviewMaterial = {
  id: number;
  textureId?: number;
  transparent: boolean;
  alphaTest?: number;
  doubleSided?: boolean;
};

export type PreviewNode = {
  id: number;
  parentId: number | null;
  name?: string;
  pivot: Vec3;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
};

export type PreviewMesh = {
  nodeId: number;
  materialId: number;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
};

export type PreviewAnimationTrack = {
  nodeId: number;
  channel: 'position' | 'rotation' | 'scale';
  times: number[];
  values: number[];
  interpolation: 'linear' | 'step';
};

export type PreviewAnimation = {
  name: string;
  duration: number;
  loop: boolean;
  tracks: PreviewAnimationTrack[];
};

export type BbPreview = {
  version: typeof BBPREVIEW_VERSION;
  metadata: PreviewMetadata;
  bounds: PreviewBounds;
  textures: PreviewTexture[];
  materials: PreviewMaterial[];
  nodes: PreviewNode[];
  meshes: PreviewMesh[];
  animations: PreviewAnimation[];
};
