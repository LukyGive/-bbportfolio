import type { PreviewMesh, Vec3 } from './schema';
import type { PreviewHierarchy } from './hierarchy';
import type { SourceCube, SourceCubeFace, SourceFaceName, SourceVec3, SupportedBbmodel } from './source';
import { resolvePreviewMaterialId, type PreviewTextureMap } from './textures';

const FACE_ORDER: SourceFaceName[] = ['east', 'west', 'up', 'down', 'south', 'north'];
const FACE_INDICES = [0, 2, 1, 2, 3, 1] as const;

type FaceTemplate = {
  normal: SourceVec3;
  vertices(from: SourceVec3, to: SourceVec3): SourceVec3[];
};

// Vertex order mirrors THREE.BoxGeometry's six planes. three-blockbench uses
// that same order before replacing the UV buffer, so matching it preserves
// Blockbench per-face UV orientation without creating a BoxGeometry per cube.
const FACE_TEMPLATES: Record<SourceFaceName, FaceTemplate> = {
  east: {
    normal: [1, 0, 0],
    vertices: (f, t) => [[t[0], t[1], t[2]], [t[0], t[1], f[2]], [t[0], f[1], t[2]], [t[0], f[1], f[2]]],
  },
  west: {
    normal: [-1, 0, 0],
    vertices: (f, t) => [[f[0], t[1], f[2]], [f[0], t[1], t[2]], [f[0], f[1], f[2]], [f[0], f[1], t[2]]],
  },
  up: {
    normal: [0, 1, 0],
    vertices: (f, t) => [[f[0], t[1], f[2]], [t[0], t[1], f[2]], [f[0], t[1], t[2]], [t[0], t[1], t[2]]],
  },
  down: {
    normal: [0, -1, 0],
    vertices: (f, t) => [[f[0], f[1], t[2]], [t[0], f[1], t[2]], [f[0], f[1], f[2]], [t[0], f[1], f[2]]],
  },
  south: {
    normal: [0, 0, 1],
    vertices: (f, t) => [[f[0], t[1], t[2]], [t[0], t[1], t[2]], [f[0], f[1], t[2]], [t[0], f[1], t[2]]],
  },
  north: {
    normal: [0, 0, -1],
    vertices: (f, t) => [[t[0], t[1], f[2]], [f[0], t[1], f[2]], [t[0], f[1], f[2]], [f[0], f[1], f[2]]],
  },
};

type MeshAccumulator = PreviewMesh;

function radians(value: number): number {
  return value * Math.PI / 180;
}

function rotateZYX(vector: SourceVec3, rotationDegrees: SourceVec3): SourceVec3 {
  const rx = radians(rotationDegrees[0]);
  const ry = radians(rotationDegrees[1]);
  const rz = radians(rotationDegrees[2]);

  // Euler order ZYX corresponds to Rz * Ry * Rx, so a column vector sees
  // X first, then Y, then Z.
  let [x, y, z] = vector;
  if (rx !== 0) {
    const cosine = Math.cos(rx);
    const sine = Math.sin(rx);
    const nextY = y * cosine - z * sine;
    const nextZ = y * sine + z * cosine;
    y = nextY;
    z = nextZ;
  }
  if (ry !== 0) {
    const cosine = Math.cos(ry);
    const sine = Math.sin(ry);
    const nextX = x * cosine + z * sine;
    const nextZ = -x * sine + z * cosine;
    x = nextX;
    z = nextZ;
  }
  if (rz !== 0) {
    const cosine = Math.cos(rz);
    const sine = Math.sin(rz);
    const nextX = x * cosine - y * sine;
    const nextY = x * sine + y * cosine;
    x = nextX;
    y = nextY;
  }
  return [x, y, z];
}

function rotatedPoint(point: SourceVec3, cube: SourceCube): SourceVec3 {
  const relative: SourceVec3 = [
    point[0] - cube.origin[0],
    point[1] - cube.origin[1],
    point[2] - cube.origin[2],
  ];
  const rotated = rotateZYX(relative, cube.rotation);
  return [
    rotated[0] + cube.origin[0],
    rotated[1] + cube.origin[1],
    rotated[2] + cube.origin[2],
  ];
}

function localPoint(point: SourceVec3, cube: SourceCube, nodeOrigin: SourceVec3, preserveElementTransform: boolean): Vec3 {
  const transformed = preserveElementTransform ? point : rotatedPoint(point, cube);
  return [transformed[0] - nodeOrigin[0], transformed[1] - nodeOrigin[1], transformed[2] - nodeOrigin[2]];
}

function rotatedNormal(normal: SourceVec3, cube: SourceCube, preserveElementTransform: boolean): Vec3 {
  const value = preserveElementTransform ? normal : rotateZYX(normal, cube.rotation);
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function uvForFace(face: SourceCubeFace, width: number, height: number): number[] {
  const uv = face.uv ?? [0, 0, 0, 0];
  const safeWidth = width || 16;
  const safeHeight = height || 16;
  const result: Array<[number, number]> = [
    [uv[0] / safeWidth, 1 - uv[1] / safeHeight],
    [uv[2] / safeWidth, 1 - uv[1] / safeHeight],
    [uv[0] / safeWidth, 1 - uv[3] / safeHeight],
    [uv[2] / safeWidth, 1 - uv[3] / safeHeight],
  ];
  let rotation = ((face.rotation ?? 0) % 360 + 360) % 360;
  while (rotation >= 90) {
    const [first, second, third, fourth] = result;
    result[0] = third;
    result[1] = first;
    result[2] = fourth;
    result[3] = second;
    rotation -= 90;
  }
  return result.flat();
}

function textureDimensions(source: SupportedBbmodel, reference: SourceCubeFace['texture']): [number, number] {
  let texture = typeof reference === 'number' ? source.textures[reference] : undefined;
  if (!texture && typeof reference === 'string') {
    if (/^\d+$/.test(reference)) texture = source.textures[Number(reference)];
    texture ??= source.textures.find((candidate) => candidate.uuid === reference || candidate.id === reference);
  }
  texture ??= source.textures[0];
  return [texture?.uvWidth ?? source.resolution.width, texture?.uvHeight ?? source.resolution.height];
}

function accumulatorFor(
  accumulators: Map<string, MeshAccumulator>,
  nodeId: number,
  materialId: number,
): MeshAccumulator {
  const key = `${nodeId}:${materialId}`;
  let accumulator = accumulators.get(key);
  if (!accumulator) {
    accumulator = { nodeId, materialId, positions: [], normals: [], uvs: [], indices: [] };
    accumulators.set(key, accumulator);
  }
  return accumulator;
}

export function buildMergedPreviewMeshes(
  source: SupportedBbmodel,
  hierarchy: PreviewHierarchy,
  textureMap: PreviewTextureMap,
): PreviewMesh[] {
  const accumulators = new Map<string, MeshAccumulator>();

  for (const cube of source.cubes) {
    const nodeId = hierarchy.renderNodeForCube.get(cube.uuid) ?? 0;
    const nodeOrigin = hierarchy.sourceOriginByNodeId.get(nodeId) ?? [0, 0, 0];
    const preserveElementTransform = hierarchy.elementNodeForCube.get(cube.uuid) === nodeId;

    for (const direction of FACE_ORDER) {
      const face = cube.faces[direction];
      if (!face || face.enabled === false || face.texture === null || face.texture === -1 || face.texture === '-1') continue;
      const materialId = resolvePreviewMaterialId(textureMap, face.texture);
      if (materialId === undefined) throw new Error(`Cube ${cube.uuid} face ${direction} has no preview material.`);

      const accumulator = accumulatorFor(accumulators, nodeId, materialId);
      const baseVertex = accumulator.positions.length / 3;
      const template = FACE_TEMPLATES[direction];
      const normal = rotatedNormal(template.normal, cube, preserveElementTransform);
      for (const point of template.vertices(cube.from, cube.to)) {
        accumulator.positions.push(...localPoint(point, cube, nodeOrigin, preserveElementTransform));
        accumulator.normals.push(...normal);
      }
      const [width, height] = textureDimensions(source, face.texture);
      accumulator.uvs.push(...uvForFace(face, width, height));
      for (const index of FACE_INDICES) accumulator.indices.push(baseVertex + index);
    }
  }

  return [...accumulators.values()];
}
