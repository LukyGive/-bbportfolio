import * as THREE from 'three';
import type { BbPreview } from '../schema';
import { buildPreviewAnimationClips } from './build-animations';
import { buildPreviewMaterials } from './build-materials';

export type BuiltPreviewScene = {
  root: THREE.Group;
  mixer?: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
  defaultAnimation?: string;
  dispose(): void;
};

export async function buildPreviewScene(preview: BbPreview): Promise<BuiltPreviewScene> {
  const materialSet = await buildPreviewMaterials(preview);
  const root = new THREE.Group();
  root.name = 'bbv2-scene';
  const nodes = new Map<number, THREE.Object3D>();
  const geometries: THREE.BufferGeometry[] = [];

  try {
    for (const sourceNode of preview.nodes) {
      const node = new THREE.Object3D();
      node.name = `bbv2-node-${sourceNode.id}`;
      node.position.fromArray(sourceNode.position);
      node.rotation.order = 'ZYX';
      node.rotation.set(sourceNode.rotation[0], sourceNode.rotation[1], sourceNode.rotation[2]);
      node.scale.fromArray(sourceNode.scale);
      node.userData.bbpreviewNodeId = sourceNode.id;
      if (sourceNode.name) node.userData.bbpreviewName = sourceNode.name;
      nodes.set(sourceNode.id, node);
    }

    for (const sourceNode of preview.nodes) {
      const node = nodes.get(sourceNode.id);
      if (!node) throw new Error(`Preview node ${sourceNode.id} could not be created.`);
      if (sourceNode.parentId === null) root.add(node);
      else {
        const parent = nodes.get(sourceNode.parentId);
        if (!parent) throw new Error(`Preview node ${sourceNode.id} references missing parent ${sourceNode.parentId}.`);
        parent.add(node);
      }
    }

    for (const sourceMesh of preview.meshes) {
      const node = nodes.get(sourceMesh.nodeId);
      if (!node) throw new Error(`Preview mesh references missing node ${sourceMesh.nodeId}.`);
      const material = materialSet.byId.get(sourceMesh.materialId);
      if (!material) throw new Error(`Preview mesh references missing material ${sourceMesh.materialId}.`);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(sourceMesh.positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(sourceMesh.normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(sourceMesh.uvs, 2));
      geometry.setIndex(sourceMesh.indices);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometries.push(geometry);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `bbv2-mesh-${sourceMesh.nodeId}-${sourceMesh.materialId}`;
      node.add(mesh);
    }

    const animationSet = buildPreviewAnimationClips(preview);
    const mixer = animationSet.clips.length > 0 ? new THREE.AnimationMixer(root) : undefined;
    let disposed = false;
    return {
      root,
      ...(mixer ? { mixer } : {}),
      clips: animationSet.clips,
      ...(animationSet.defaultAnimation ? { defaultAnimation: animationSet.defaultAnimation } : {}),
      dispose() {
        if (disposed) return;
        disposed = true;
        mixer?.stopAllAction();
        for (const geometry of geometries) geometry.dispose();
        materialSet.dispose();
        root.clear();
      },
    };
  } catch (error) {
    for (const geometry of geometries) geometry.dispose();
    materialSet.dispose();
    root.clear();
    throw error;
  }
}
