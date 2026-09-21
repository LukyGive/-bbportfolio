import {
  BBPREVIEW_LIMITS,
  BBPREVIEW_VERSION,
  type BbPreview,
  type PreviewAnimation,
  type PreviewAnimationTrack,
  type PreviewBounds,
  type PreviewMaterial,
  type PreviewMesh,
  type PreviewMetadata,
  type PreviewNode,
  type PreviewTexture,
  type Vec3,
} from './schema';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as UnknownRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function stringValue(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function safeInteger(value: unknown, label: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${min}.`);
  }
  return value;
}

function vec3(value: unknown, label: string): Vec3 {
  const items = array(value, label);
  if (items.length !== 3) throw new Error(`${label} must contain exactly three values.`);
  return [
    finiteNumber(items[0], `${label}[0]`),
    finiteNumber(items[1], `${label}[1]`),
    finiteNumber(items[2], `${label}[2]`),
  ];
}

function finiteNumberArray(value: unknown, label: string): number[] {
  return array(value, label).map((item, index) => finiteNumber(item, `${label}[${index}]`));
}

function validateMetadata(value: unknown): PreviewMetadata {
  const item = record(value, 'metadata');
  if (item.generator !== 'bbportfolio-viewer-v2') {
    throw new Error('Preview generator is not supported.');
  }
  if (!['java_block_item', 'generic_entity', 'unknown'].includes(String(item.sourceFormat))) {
    throw new Error('Preview source format is invalid.');
  }

  const metadata: PreviewMetadata = {
    generator: 'bbportfolio-viewer-v2',
    sourceFormat: item.sourceFormat as PreviewMetadata['sourceFormat'],
    meshCount: safeInteger(item.meshCount, 'metadata.meshCount'),
    vertexCount: safeInteger(item.vertexCount, 'metadata.vertexCount'),
    triangleCount: safeInteger(item.triangleCount, 'metadata.triangleCount'),
    textureCount: safeInteger(item.textureCount, 'metadata.textureCount'),
    nodeCount: safeInteger(item.nodeCount, 'metadata.nodeCount'),
    animationCount: safeInteger(item.animationCount, 'metadata.animationCount'),
  };

  if (metadata.vertexCount > BBPREVIEW_LIMITS.maxVertices) throw new Error('Preview vertex limit exceeded.');
  if (metadata.meshCount > BBPREVIEW_LIMITS.maxMeshes) throw new Error('Preview mesh limit exceeded.');
  if (metadata.textureCount > BBPREVIEW_LIMITS.maxTextures) throw new Error('Preview texture limit exceeded.');
  if (metadata.nodeCount > BBPREVIEW_LIMITS.maxNodes) throw new Error('Preview node limit exceeded.');
  if (metadata.animationCount > BBPREVIEW_LIMITS.maxAnimations) throw new Error('Preview animation limit exceeded.');
  return metadata;
}

function validateBounds(value: unknown): PreviewBounds {
  const item = record(value, 'bounds');
  const min = vec3(item.min, 'bounds.min');
  const max = vec3(item.max, 'bounds.max');
  for (let axis = 0; axis < 3; axis += 1) {
    if (min[axis] > max[axis]) throw new Error('Preview bounds minimum cannot exceed maximum.');
  }
  return { min, max };
}

function validateTexture(value: unknown, index: number): PreviewTexture {
  const item = record(value, `textures[${index}]`);
  const id = safeInteger(item.id, `textures[${index}].id`);
  if (item.mimeType !== 'image/png' && item.mimeType !== 'image/webp') {
    throw new Error(`textures[${index}].mimeType is unsupported.`);
  }
  const width = safeInteger(item.width, `textures[${index}].width`, 1);
  const height = safeInteger(item.height, `textures[${index}].height`, 1);
  if (width > BBPREVIEW_LIMITS.maxTextureDimension || height > BBPREVIEW_LIMITS.maxTextureDimension) {
    throw new Error('Preview texture dimension limit exceeded.');
  }
  const data = stringValue(item.data, `textures[${index}].data`);
  const expectedPrefix = item.mimeType === 'image/png'
    ? 'data:image/png;base64,'
    : 'data:image/webp;base64,';
  if (!data.startsWith(expectedPrefix)) throw new Error(`textures[${index}].data must be an embedded ${item.mimeType} data URL.`);
  return {
    id,
    mimeType: item.mimeType,
    width,
    height,
    data,
    pixelated: booleanValue(item.pixelated, `textures[${index}].pixelated`),
  };
}

function validateMaterial(value: unknown, index: number): PreviewMaterial {
  const item = record(value, `materials[${index}]`);
  const material: PreviewMaterial = {
    id: safeInteger(item.id, `materials[${index}].id`),
    transparent: booleanValue(item.transparent, `materials[${index}].transparent`),
  };
  if (item.textureId !== undefined) material.textureId = safeInteger(item.textureId, `materials[${index}].textureId`);
  if (item.alphaTest !== undefined) {
    const alphaTest = finiteNumber(item.alphaTest, `materials[${index}].alphaTest`);
    if (alphaTest < 0 || alphaTest > 1) throw new Error(`materials[${index}].alphaTest must be between 0 and 1.`);
    material.alphaTest = alphaTest;
  }
  if (item.doubleSided !== undefined) material.doubleSided = booleanValue(item.doubleSided, `materials[${index}].doubleSided`);
  return material;
}

function validateNode(value: unknown, index: number): PreviewNode {
  const item = record(value, `nodes[${index}]`);
  const parentId = item.parentId === null ? null : safeInteger(item.parentId, `nodes[${index}].parentId`);
  const node: PreviewNode = {
    id: safeInteger(item.id, `nodes[${index}].id`),
    parentId,
    pivot: vec3(item.pivot, `nodes[${index}].pivot`),
    position: vec3(item.position, `nodes[${index}].position`),
    rotation: vec3(item.rotation, `nodes[${index}].rotation`),
    scale: vec3(item.scale, `nodes[${index}].scale`),
  };
  if (item.name !== undefined) node.name = stringValue(item.name, `nodes[${index}].name`, true).slice(0, 200);
  return node;
}

export function assertMeshArrayLengths(
  positionsLength: number,
  normalsLength: number,
  uvsLength: number,
  indicesLength: number,
): void {
  if (positionsLength > BBPREVIEW_LIMITS.maxVertices * 3
    || normalsLength > BBPREVIEW_LIMITS.maxVertices * 3
    || uvsLength > BBPREVIEW_LIMITS.maxVertices * 2) {
    throw new Error('Preview vertex limit exceeded.');
  }
  if (indicesLength > BBPREVIEW_LIMITS.maxIndices) {
    throw new Error('Preview index limit exceeded.');
  }
}

export function assertTrackArrayLengths(timesLength: number, valuesLength: number): void {
  if (timesLength > BBPREVIEW_LIMITS.maxAnimationKeys
    || valuesLength > BBPREVIEW_LIMITS.maxAnimationKeys * 3) {
    throw new Error('Preview animation key limit exceeded.');
  }
}

function validateMesh(value: unknown, index: number): PreviewMesh {
  const item = record(value, `meshes[${index}]`);
  const rawPositions = array(item.positions, `meshes[${index}].positions`);
  const rawNormals = array(item.normals, `meshes[${index}].normals`);
  const rawUvs = array(item.uvs, `meshes[${index}].uvs`);
  const rawIndices = array(item.indices, `meshes[${index}].indices`);
  assertMeshArrayLengths(rawPositions.length, rawNormals.length, rawUvs.length, rawIndices.length);

  const positions = finiteNumberArray(rawPositions, `meshes[${index}].positions`);
  if (positions.length % 3 !== 0) throw new Error(`meshes[${index}].positions length must be divisible by 3.`);
  const vertexCount = positions.length / 3;
  const normals = finiteNumberArray(rawNormals, `meshes[${index}].normals`);
  if (normals.length !== positions.length) throw new Error(`meshes[${index}].normals length must match positions.`);
  const uvs = finiteNumberArray(rawUvs, `meshes[${index}].uvs`);
  if (uvs.length !== vertexCount * 2) throw new Error(`meshes[${index}].uvs length must match vertex count.`);
  const indices = rawIndices.map((entry, entryIndex) => {
    const value = safeInteger(entry, `meshes[${index}].indices[${entryIndex}]`);
    if (value >= vertexCount) throw new Error(`meshes[${index}] index ${value} is outside the vertex range.`);
    return value;
  });
  if (indices.length % 3 !== 0) throw new Error(`meshes[${index}].indices length must be divisible by 3.`);
  return {
    nodeId: safeInteger(item.nodeId, `meshes[${index}].nodeId`),
    materialId: safeInteger(item.materialId, `meshes[${index}].materialId`),
    positions,
    normals,
    uvs,
    indices,
  };
}

function validateTrack(value: unknown, animationIndex: number, trackIndex: number): PreviewAnimationTrack {
  const label = `animations[${animationIndex}].tracks[${trackIndex}]`;
  const item = record(value, label);
  if (!['position', 'rotation', 'scale'].includes(String(item.channel))) throw new Error(`${label}.channel is invalid.`);
  if (item.interpolation !== 'linear' && item.interpolation !== 'step') throw new Error(`${label}.interpolation is invalid.`);
  const rawTimes = array(item.times, `${label}.times`);
  const rawValues = array(item.values, `${label}.values`);
  assertTrackArrayLengths(rawTimes.length, rawValues.length);
  const times = finiteNumberArray(rawTimes, `${label}.times`);
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) throw new Error(`${label}.times must be sorted.`);
  }
  const values = finiteNumberArray(rawValues, `${label}.values`);
  if (values.length !== times.length * 3) throw new Error(`${label}.values must contain three values per key.`);
  return {
    nodeId: safeInteger(item.nodeId, `${label}.nodeId`),
    channel: item.channel as PreviewAnimationTrack['channel'],
    times,
    values,
    interpolation: item.interpolation,
  };
}

function validateAnimation(value: unknown, index: number): PreviewAnimation {
  const item = record(value, `animations[${index}]`);
  const duration = finiteNumber(item.duration, `animations[${index}].duration`);
  if (duration < 0) throw new Error(`animations[${index}].duration cannot be negative.`);
  return {
    name: stringValue(item.name, `animations[${index}].name`).slice(0, 200),
    duration,
    loop: booleanValue(item.loop, `animations[${index}].loop`),
    tracks: array(item.tracks, `animations[${index}].tracks`).map((track, trackIndex) => validateTrack(track, index, trackIndex)),
  };
}

function assertUniqueIds(items: Array<{ id: number }>, label: string): Set<number> {
  const ids = new Set<number>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label} contains duplicate id ${item.id}.`);
    ids.add(item.id);
  }
  return ids;
}

function assertAcyclicNodes(nodes: PreviewNode[], nodeIds: Set<number>): void {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  for (const node of nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) throw new Error(`Node ${node.id} references unknown parent ${node.parentId}.`);
    if (node.parentId === node.id) throw new Error(`Node ${node.id} cannot parent itself.`);
    const seen = new Set<number>([node.id]);
    let cursor = node.parentId;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new Error('Preview node hierarchy contains a cycle.');
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }
}

export function validateBbPreview(value: unknown): BbPreview {
  const root = record(value, 'preview');
  if (root.version !== BBPREVIEW_VERSION) throw new Error(`Unsupported preview version: ${String(root.version)}.`);

  // Metadata is intentionally validated before walking large geometry arrays.
  const metadata = validateMetadata(root.metadata);
  const bounds = validateBounds(root.bounds);

  const rawTextures = array(root.textures, 'textures');
  const rawMaterials = array(root.materials, 'materials');
  const rawNodes = array(root.nodes, 'nodes');
  const rawMeshes = array(root.meshes, 'meshes');
  const rawAnimations = array(root.animations, 'animations');

  if (rawTextures.length > BBPREVIEW_LIMITS.maxTextures) throw new Error('Preview texture limit exceeded.');
  if (rawNodes.length > BBPREVIEW_LIMITS.maxNodes) throw new Error('Preview node limit exceeded.');
  if (rawMeshes.length > BBPREVIEW_LIMITS.maxMeshes) throw new Error('Preview mesh limit exceeded.');
  if (rawAnimations.length > BBPREVIEW_LIMITS.maxAnimations) throw new Error('Preview animation limit exceeded.');

  const textures = rawTextures.map(validateTexture);
  const materials = rawMaterials.map(validateMaterial);
  const nodes = rawNodes.map(validateNode);
  const meshes = rawMeshes.map(validateMesh);
  const animations = rawAnimations.map(validateAnimation);

  const textureIds = assertUniqueIds(textures, 'textures');
  const materialIds = assertUniqueIds(materials, 'materials');
  const nodeIds = assertUniqueIds(nodes, 'nodes');
  if (nodes.length === 0) throw new Error('Preview must contain a root node.');
  assertAcyclicNodes(nodes, nodeIds);

  for (const material of materials) {
    if (material.textureId !== undefined && !textureIds.has(material.textureId)) {
      throw new Error(`Material ${material.id} references unknown texture ${material.textureId}.`);
    }
  }

  let vertexCount = 0;
  let indexCount = 0;
  let triangleCount = 0;
  for (const mesh of meshes) {
    if (!nodeIds.has(mesh.nodeId)) throw new Error(`Mesh references unknown node ${mesh.nodeId}.`);
    if (!materialIds.has(mesh.materialId)) throw new Error(`Mesh references unknown material ${mesh.materialId}.`);
    vertexCount += mesh.positions.length / 3;
    indexCount += mesh.indices.length;
    triangleCount += mesh.indices.length / 3;
    if (vertexCount > BBPREVIEW_LIMITS.maxVertices) throw new Error('Preview vertex limit exceeded.');
    if (indexCount > BBPREVIEW_LIMITS.maxIndices) throw new Error('Preview index limit exceeded.');
  }

  let animationKeys = 0;
  for (const animation of animations) {
    for (const track of animation.tracks) {
      if (!nodeIds.has(track.nodeId)) throw new Error(`Animation ${animation.name} references unknown node ${track.nodeId}.`);
      animationKeys += track.times.length;
      if (animationKeys > BBPREVIEW_LIMITS.maxAnimationKeys) throw new Error('Preview animation key limit exceeded.');
    }
  }

  if (metadata.meshCount !== meshes.length) throw new Error('Preview metadata mesh count does not match payload.');
  if (metadata.vertexCount !== vertexCount) throw new Error('Preview metadata vertex count does not match payload.');
  if (metadata.triangleCount !== triangleCount) throw new Error('Preview metadata triangle count does not match payload.');
  if (metadata.textureCount !== textures.length) throw new Error('Preview metadata texture count does not match payload.');
  if (metadata.nodeCount !== nodes.length) throw new Error('Preview metadata node count does not match payload.');
  if (metadata.animationCount !== animations.length) throw new Error('Preview metadata animation count does not match payload.');

  return {
    version: BBPREVIEW_VERSION,
    metadata,
    bounds,
    textures,
    materials,
    nodes,
    meshes,
    animations,
  };
}
