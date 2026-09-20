import { normalizeViewerAnimationNames } from './animation';

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
      return {
        scene: model.scene,
        animations: model.animations,
        warnings: model.warnings,
        dispose: () => model.dispose(),
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
