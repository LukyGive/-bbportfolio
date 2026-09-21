import type { PreviewAnimation, PreviewBounds, PreviewMesh, PreviewNode, PreviewTexture, Vec3 } from './schema';

export type PreviewDiagnostics = {
  meshes: number;
  vertices: number;
  triangles: number;
  textures: number;
  nodes: number;
  animations: number;
};

type WorldPointResolver = (nodeId: number, point: Vec3) => Vec3;

function rotateZ([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z];
}

function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotateX([x, y, z]: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x, y * c - z * s, y * s + z * c];
}

function transformLocal(point: Vec3, node: PreviewNode): Vec3 {
  const scaled: Vec3 = [
    point[0] * node.scale[0],
    point[1] * node.scale[1],
    point[2] * node.scale[2],
  ];
  // Blockbench/legacy viewer uses ZYX Euler order.
  const rotated = rotateX(rotateY(rotateZ(scaled, node.rotation[2]), node.rotation[1]), node.rotation[0]);
  return [
    rotated[0] + node.position[0],
    rotated[1] + node.position[1],
    rotated[2] + node.position[2],
  ];
}

function buildWorldPointResolver(nodes: PreviewNode[]): WorldPointResolver {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));
  return (nodeId, point) => {
    let result: Vec3 = [...point] as Vec3;
    let current = byId.get(nodeId);
    const visited = new Set<number>();
    while (current) {
      if (visited.has(current.id)) throw new Error('Preview hierarchy cycle encountered while computing bounds.');
      visited.add(current.id);
      result = transformLocal(result, current);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return result;
  };
}

export function calculatePreviewBounds(nodes: PreviewNode[], meshes: PreviewMesh[]): PreviewBounds {
  if (meshes.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const worldPoint = buildWorldPointResolver(nodes);
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  let count = 0;

  for (const mesh of meshes) {
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      const point: Vec3 = [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
      const world = worldPoint(mesh.nodeId, point);
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], world[axis]);
        max[axis] = Math.max(max[axis], world[axis]);
      }
      count += 1;
    }
  }

  return count > 0 ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] };
}

export function createPreviewDiagnostics(
  meshes: PreviewMesh[],
  textures: PreviewTexture[],
  nodes: PreviewNode[],
  animations: PreviewAnimation[],
): PreviewDiagnostics {
  return {
    meshes: meshes.length,
    vertices: meshes.reduce((total, mesh) => total + mesh.positions.length / 3, 0),
    triangles: meshes.reduce((total, mesh) => total + mesh.indices.length / 3, 0),
    textures: textures.length,
    nodes: nodes.length,
    animations: animations.length,
  };
}
