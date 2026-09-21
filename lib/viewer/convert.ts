import type { AnimationClip, BufferGeometry, Object3D, SkinnedMesh } from 'three';
import { normalizeViewerAnimationNames } from './animation';
import { compactMaterialGroups } from './groups';

const MAX_BBMODEL_BYTES = 50 * 1024 * 1024;
const MAX_VIEWER_BYTES = 50 * 1024 * 1024;

export type ViewerArtifact = {
  file: File;
  animationNames: string[];
  warnings: string[];
};

export type ViewerConverterDependencies = {
  parse(source: string): Promise<{
    scene: object;
    animations: Array<{ name: string }>;
    warnings?: Array<{ message?: string } | string>;
    dispose(): void;
  }>;
  exportBinary(scene: object, animations: unknown[]): Promise<ArrayBuffer>;
};

function warningMessage(warning: { message?: string } | string): string {
  return typeof warning === 'string' ? warning : warning.message ?? 'Blockbench conversion warning';
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Could not read .bbmodel file.'));
    reader.readAsText(file);
  });
}

function stripBlockbenchMetadata(scene: Object3D, animations: AnimationClip[]): void {
  scene.traverse((object) => {
    for (const key of Object.keys(object.userData)) {
      if (key.toLowerCase().startsWith('blockbench')) {
        delete object.userData[key];
      }
    }
  });

  for (const clip of animations) {
    for (const key of Object.keys(clip.userData)) {
      if (key.toLowerCase().startsWith('blockbench')) {
        delete clip.userData[key];
      }
    }
  }
}

function geometryPrimitiveCount(geometry: BufferGeometry): number {
  return geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
}

async function compactSkinnedMeshes(scene: Object3D): Promise<BufferGeometry | undefined> {
  const [THREE, { mergeGeometries }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
  ]);

  const allMeshes: SkinnedMesh[] = [];
  scene.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh) {
      allMeshes.push(object as SkinnedMesh);
    }
  });

  const meshes = allMeshes.filter((mesh) => mesh.visible);
  if (meshes.length <= 1) return undefined;

  const first = meshes[0];
  const sameSkeleton = meshes.every((mesh) => mesh.skeleton === first.skeleton);
  const sameMaterials = meshes.every((mesh) => mesh.material === first.material);

  if (!sameSkeleton || !sameMaterials) {
    return undefined;
  }

  const geometries = meshes.map((mesh) => mesh.geometry);
  const mergedGeometry = mergeGeometries(geometries, false);

  if (!mergedGeometry) {
    throw new Error('Could not compact Blockbench geometry for the web viewer.');
  }

  // The Blockbench parser creates face-level geometry groups. Keeping those
  // groups after merging can turn a simple model into thousands of WebGL draw
  // calls. With a single material, groups are unnecessary. With multiple
  // materials, only contiguous ranges with a different material need to stay.
  mergedGeometry.clearGroups();
  let mergedMaterial = first.material;

  if (Array.isArray(first.material)) {
    const candidateGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
    let primitiveOffset = 0;

    for (const geometry of geometries) {
      const primitiveCount = geometryPrimitiveCount(geometry);

      if (geometry.groups.length > 0) {
        for (const group of geometry.groups) {
          const start = primitiveOffset + group.start;
          const count = Math.min(group.count, Math.max(0, primitiveCount - group.start));
          if (count > 0) {
            candidateGroups.push({
              start,
              count,
              materialIndex: group.materialIndex ?? 0,
            });
          }
        }
      } else if (primitiveCount > 0) {
        candidateGroups.push({ start: primitiveOffset, count: primitiveCount, materialIndex: 0 });
      }

      primitiveOffset += primitiveCount;
    }

    const plan = compactMaterialGroups(candidateGroups);
    if (plan.singleMaterialIndex !== undefined) {
      const singleMaterial = first.material[plan.singleMaterialIndex] ?? first.material[0];
      if (singleMaterial) mergedMaterial = singleMaterial;
    } else {
      for (const group of plan.groups) {
        mergedGeometry.addGroup(group.start, group.count, group.materialIndex);
      }
    }
  }

  const mergedMesh = new THREE.SkinnedMesh(mergedGeometry, mergedMaterial);
  mergedMesh.name = 'viewer-model';
  mergedMesh.bindMode = first.bindMode;
  mergedMesh.bind(first.skeleton, first.bindMatrix.clone());

  for (const mesh of allMeshes) {
    mesh.removeFromParent();
  }

  scene.add(mergedMesh);
  scene.updateMatrixWorld(true);

  return mergedGeometry;
}

async function defaultDependencies(): Promise<ViewerConverterDependencies> {
  const [{ BBModelLoader }, { GLTFExporter }] = await Promise.all([
    import('three-blockbench'),
    import('three/examples/jsm/exporters/GLTFExporter.js'),
  ]);

  return {
    async parse(source) {
      const loader = new BBModelLoader(undefined, {
        unitScale: 1 / 16,
        animationSampleRate: 'snapping',
        maxAnimationSampleRate: 120,
        strict: false,
        loadTextures: true,
      });

      const model = await loader.parseAsync(source, '');

      const compactedGeometry = await compactSkinnedMeshes(model.scene);
      stripBlockbenchMetadata(model.scene, model.animations);

      return {
        scene: model.scene,
        animations: model.animations,
        warnings: model.warnings,
        dispose: () => {
          compactedGeometry?.dispose();
          model.dispose();
        },
      };
    },

    async exportBinary(scene, animations) {
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(scene as never, {
        binary: true,
        animations: animations as never[],
        onlyVisible: true,
      });

      if (!(result instanceof ArrayBuffer)) {
        throw new Error('Viewer conversion did not produce a binary GLB.');
      }

      return result;
    },
  };
}

export async function convertBbmodelToViewer(
  file: File,
  dependencies?: ViewerConverterDependencies,
): Promise<ViewerArtifact> {
  if (!/\.bbmodel$/i.test(file.name)) throw new Error('A .bbmodel file is required.');
  if (file.size <= 0) throw new Error('The .bbmodel file is empty.');
  if (file.size > MAX_BBMODEL_BYTES) throw new Error('The .bbmodel file must be 50 MB or smaller.');

  const source = await readFileAsText(file);

  try {
    JSON.parse(source);
  } catch {
    throw new Error('The .bbmodel file contains invalid JSON.');
  }

  const deps = dependencies ?? await defaultDependencies();
  const parsed = await deps.parse(source);

  try {
    const binary = await deps.exportBinary(parsed.scene, parsed.animations);

    if (binary.byteLength > MAX_VIEWER_BYTES) {
      throw new Error('Generated viewer model is larger than 50 MB.');
    }

    return {
      file: new File([binary], 'model.glb', { type: 'model/gltf-binary' }),
      animationNames: normalizeViewerAnimationNames(parsed.animations.map((clip) => clip.name)),
      warnings: (parsed.warnings ?? []).map(warningMessage),
    };
  } finally {
    parsed.dispose();
  }
}
