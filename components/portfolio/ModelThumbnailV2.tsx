'use client';

import { useEffect, useRef, useState } from 'react';
import type { BbPreview } from '@/lib/viewer-v2/schema';
import type { BuiltPreviewScene } from '@/lib/viewer-v2/runtime/build-scene';
import type { BbPreviewWorkerResponse } from '@/workers/bbpreview.worker';

type Props = {
  modelUrl: string;
  creationName: string;
};

function decodePreview(
  text: string,
  signal: AbortSignal,
  onWorker: (worker: Worker | undefined) => void,
): Promise<BbPreview> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/bbpreview.worker.ts', import.meta.url),
      { type: 'module' },
    );
    onWorker(worker);

    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      worker.terminate();
      onWorker(undefined);
    };

    const abort = () => {
      finish();
      reject(new DOMException('Preview decode aborted.', 'AbortError'));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener('abort', abort, { once: true });

    worker.onmessage = (event: MessageEvent<BbPreviewWorkerResponse>) => {
      const response = event.data;
      if (response.type === 'decoded') {
        finish();
        resolve(response.preview);
      } else {
        finish();
        reject(new Error(response.message));
      }
    };

    worker.onerror = () => {
      finish();
      reject(new Error('Preview worker failed.'));
    };

    worker.postMessage({ type: 'decode', text });
  });
}

function boundsFrame(preview: BbPreview): {
  center: [number, number, number];
  radius: number;
} {
  const center: [number, number, number] = [
    (preview.bounds.min[0] + preview.bounds.max[0]) / 2,
    (preview.bounds.min[1] + preview.bounds.max[1]) / 2,
    (preview.bounds.min[2] + preview.bounds.max[2]) / 2,
  ];

  const dx = preview.bounds.max[0] - preview.bounds.min[0];
  const dy = preview.bounds.max[1] - preview.bounds.min[1];
  const dz = preview.bounds.max[2] - preview.bounds.min[2];

  return {
    center,
    radius: Math.max(Math.hypot(dx, dy, dz) / 2, 0.01),
  };
}

function cameraDistance(radius: number, fovDegrees: number): number {
  const clampedFov = Math.max(10, Math.min(120, fovDegrees));
  const halfFov = (clampedFov * Math.PI / 180) / 2;
  return Math.max(0.05, (Math.max(radius, 0.01) / Math.tan(halfFov)) * 1.3);
}

export function ModelThumbnailV2({ modelUrl, creationName }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    let built: BuiltPreviewScene | undefined;
    let renderer: import('three').WebGLRenderer | undefined;
    let decoderWorker: Worker | undefined;
    const abortController = new AbortController();

    setState('loading');

    void (async () => {
      try {
        const response = await fetch(modelUrl, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`Preview request failed (${response.status}).`);
        }

        const preview = await decodePreview(
          await response.text(),
          abortController.signal,
          (worker) => { decoderWorker = worker; },
        );

        if (disposed) return;

        const [runtimeModule, THREE] = await Promise.all([
          import('@/lib/viewer-v2/runtime/build-scene'),
          import('three'),
        ]);

        if (disposed) return;

        built = await runtimeModule.buildPreviewScene(preview);
        if (disposed) {
          built.dispose();
          built = undefined;
          return;
        }

        const scene = new THREE.Scene();
        scene.add(built.root);

        const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1000);
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(
          Math.max(container.clientWidth, 1),
          Math.max(container.clientHeight, 1),
          false,
        );
        renderer.domElement.className = 'model-thumbnail-v2-canvas';
        container.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x252839, 2.15));

        const key = new THREE.DirectionalLight(0xffffff, 2.35);
        key.position.set(5, 8, 7);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xffffff, 0.9);
        fill.position.set(-4, 2, -5);
        scene.add(fill);

        const frame = boundsFrame(preview);
        const distance = cameraDistance(frame.radius, camera.fov);

        camera.position.set(
          frame.center[0] + distance * 0.72,
          frame.center[1] + distance * 0.38,
          frame.center[2] - distance,
        );
        camera.lookAt(...frame.center);
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 20, 100);
        camera.updateProjectionMatrix();

        const render = () => {
          renderer?.render(scene, camera);
        };

        render();

        resizeObserver = new ResizeObserver(([entry]) => {
          if (!renderer) return;
          const width = Math.max(1, entry.contentRect.width);
          const height = Math.max(1, entry.contentRect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          render();
        });
        resizeObserver.observe(container);

        setState('ready');
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
        console.error('[thumbnail-v2] Could not load preview.', error);
        setState('error');
      }
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      abortController.abort();
      decoderWorker?.terminate();
      decoderWorker = undefined;
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = undefined;
      built?.dispose();
      built = undefined;
    };
  }, [modelUrl]);

  return (
    <div
      ref={mountRef}
      className="model-thumbnail-v2"
      aria-label={`${creationName} 3D preview`}
      data-state={state}
    >
      <div className="model-thumbnail-v2-status">
        {state === 'error' ? '3D preview unavailable' : 'Loading 3D preview…'}
      </div>
    </div>
  );
}
