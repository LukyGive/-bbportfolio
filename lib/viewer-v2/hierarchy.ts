import type { PreviewNode, Vec3 } from './schema';
import type { SourceGroup, SourceVec3, SupportedBbmodel } from './source';

export type PreviewHierarchy = {
  nodes: PreviewNode[];
  nodeIdBySourceUuid: Map<string, number>;
  sourceUuidByNodeId: Map<number, string>;
  sourceOriginByNodeId: Map<number, SourceVec3>;
  nodeForCube: Map<string, number>;
  renderNodeForCube: Map<string, number>;
  elementNodeForCube: Map<string, number>;
};

function radians(value: number): number {
  return value * Math.PI / 180;
}

function hasRotation(rotation: SourceVec3): boolean {
  return rotation.some((value) => Math.abs(value) > 1e-9);
}

function animatedTargets(source: SupportedBbmodel): Set<string> {
  const result = new Set<string>();
  for (const animation of source.animations) {
    for (const animator of animation.animators) result.add(animator.sourceUuid);
  }
  return result;
}

function subtract(a: SourceVec3, b: SourceVec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function buildPreviewHierarchy(source: SupportedBbmodel): PreviewHierarchy {
  const nodes: PreviewNode[] = [{
    id: 0,
    parentId: null,
    name: 'Root',
    pivot: [0, 0, 0],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  }];
  const nodeIdBySourceUuid = new Map<string, number>();
  const sourceUuidByNodeId = new Map<number, string>();
  const sourceOriginByNodeId = new Map<number, SourceVec3>([[0, [0, 0, 0]]]);
  const nodeForCube = new Map<string, number>();
  const renderNodeForCube = new Map<string, number>();
  const elementNodeForCube = new Map<string, number>();
  const targets = animatedTargets(source);
  let nextId = 1;

  const visit = (
    entries: Array<SourceGroup | string>,
    parentId: number,
    parentOrigin: SourceVec3,
    nearestActiveRenderNode: number,
  ): void => {
    for (const entry of entries) {
      if (typeof entry === 'string') {
        nodeForCube.set(entry, parentId);
        renderNodeForCube.set(entry, nearestActiveRenderNode);
        continue;
      }

      const id = nextId;
      nextId += 1;
      nodeIdBySourceUuid.set(entry.uuid, id);
      sourceUuidByNodeId.set(id, entry.uuid);
      sourceOriginByNodeId.set(id, [...entry.origin] as SourceVec3);
      nodes.push({
        id,
        parentId,
        ...(entry.name ? { name: entry.name } : {}),
        pivot: [...entry.origin] as Vec3,
        position: subtract(entry.origin, parentOrigin),
        rotation: [radians(entry.rotation[0]), radians(entry.rotation[1]), radians(entry.rotation[2])],
        scale: [1, 1, 1],
      });

      const active = hasRotation(entry.rotation) || targets.has(entry.uuid);
      visit(entry.children, id, entry.origin, active ? id : nearestActiveRenderNode);
    }
  };

  visit(source.outliner, 0, [0, 0, 0], 0);

  // Files without an outliner are still valid for static Java items.
  for (const cube of source.cubes) {
    if (!nodeForCube.has(cube.uuid)) nodeForCube.set(cube.uuid, 0);
    if (!renderNodeForCube.has(cube.uuid)) renderNodeForCube.set(cube.uuid, 0);
  }

  // Blockbench can target an individual element in an animation. Only those
  // elements get their own transform node; static cubes stay merged.
  const cubesByUuid = new Map(source.cubes.map((cube) => [cube.uuid, cube] as const));
  for (const targetUuid of targets) {
    if (nodeIdBySourceUuid.has(targetUuid)) continue;
    const cube = cubesByUuid.get(targetUuid);
    if (!cube) throw new Error(`Missing animation target ${targetUuid}.`);
    const parentId = nodeForCube.get(cube.uuid) ?? 0;
    const parentOrigin = sourceOriginByNodeId.get(parentId) ?? [0, 0, 0];
    const id = nextId;
    nextId += 1;
    nodeIdBySourceUuid.set(cube.uuid, id);
    sourceUuidByNodeId.set(id, cube.uuid);
    sourceOriginByNodeId.set(id, [...cube.origin] as SourceVec3);
    elementNodeForCube.set(cube.uuid, id);
    renderNodeForCube.set(cube.uuid, id);
    nodes.push({
      id,
      parentId,
      name: `${cube.name ?? cube.uuid}__pivot`,
      pivot: [...cube.origin] as Vec3,
      position: subtract(cube.origin, parentOrigin),
      rotation: [radians(cube.rotation[0]), radians(cube.rotation[1]), radians(cube.rotation[2])],
      scale: [1, 1, 1],
    });
  }

  // Targets that matched neither an authored group nor an element are invalid.
  for (const targetUuid of targets) {
    if (!nodeIdBySourceUuid.has(targetUuid)) throw new Error(`Missing animation target ${targetUuid}.`);
  }

  return {
    nodes,
    nodeIdBySourceUuid,
    sourceUuidByNodeId,
    sourceOriginByNodeId,
    nodeForCube,
    renderNodeForCube,
    elementNodeForCube,
  };
}
