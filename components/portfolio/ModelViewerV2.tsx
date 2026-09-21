'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { AnimationAction, AnimationClip, AnimationMixer } from 'three';
import type { BbPreview } from '@/lib/viewer-v2/schema';
import type { BuiltPreviewScene } from '@/lib/viewer-v2/runtime/build-scene';
import type { BbPreviewWorkerResponse } from '@/workers/bbpreview.worker';
import { ModelViewerControls } from './ModelViewerControls';

type Props = {
  modelUrl: string;
  creationName: string;
  fallbackImage: string;
};

type PlaybackRuntime = {
  mixer?: AnimationMixer;
  clips: AnimationClip[];
  activeAction?: AnimationAction;
  activeClip?: AnimationClip;
  play(name: string, fade?: boolean): void;
};

function decodePreview(
  text: string,
  signal: AbortSignal,
  onWorker: (worker: Worker | undefined) => void,
): Promise<BbPreview> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/bbpreview.worker.ts', import.meta.url), { type: 'module' });
    onWorker(worker);
    let settled = false;
    const abort = () => {
      finish();
      reject(new DOMException('Preview decode aborted.', 'AbortError'));
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      worker.terminate();
      onWorker(undefined);
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

function boundsFrame(preview: BbPreview): { center: [number, number, number]; radius: number } {
  const center: [number, number, number] = [
    (preview.bounds.min[0] + preview.bounds.max[0]) / 2,
    (preview.bounds.min[1] + preview.bounds.max[1]) / 2,
    (preview.bounds.min[2] + preview.bounds.max[2]) / 2,
  ];
  const dx = preview.bounds.max[0] - preview.bounds.min[0];
  const dy = preview.bounds.max[1] - preview.bounds.min[1];
  const dz = preview.bounds.max[2] - preview.bounds.min[2];
  return { center, radius: Math.max(Math.hypot(dx, dy, dz) / 2, 0.01) };
}

function cameraDistance(radius: number, fovDegrees: number): number {
  const halfFov = (Math.max(10, Math.min(120, fovDegrees)) * Math.PI / 180) / 2;
  return Math.max(0.05, (Math.max(radius, 0.01) / Math.tan(halfFov)) * 1.35);
}

function clipLoops(clip: AnimationClip): boolean {
  return clip.userData.bbpreviewLoop !== false;
}

export function ModelViewerV2({ modelUrl, creationName, fallbackImage }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<PlaybackRuntime>({ clips: [], play: () => undefined });
  const playingRef = useRef(true);

  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<string>();
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | undefined;
    let built: BuiltPreviewScene | undefined;
    let renderer: import('three').WebGLRenderer | undefined;
    let controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | undefined;
    let finishedListener: ((event: { action: AnimationAction; direction?: number; type?: string }) => void) | undefined;
    let decoderWorker: Worker | undefined;
    const abortController = new AbortController();

    setReady(false);
    setLoadFailed(false);
    setAnimationNames([]);
    setActiveAnimation(undefined);
    setPlaying(true);
    playingRef.current = true;
    playbackRef.current = { clips: [], play: () => undefined };

    void (async () => {
      try {
        const response = await fetch(modelUrl, { signal: abortController.signal });
        if (!response.ok) throw new Error(`Preview request failed (${response.status}).`);
        const preview = await decodePreview(
          await response.text(),
          abortController.signal,
          (worker) => { decoderWorker = worker; },
        );
        if (disposed) return;

        const [runtimeModule, THREE, { OrbitControls }] = await Promise.all([
          import('@/lib/viewer-v2/runtime/build-scene'),
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
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
        const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1000);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1), false);
        renderer.domElement.className = 'model-viewer-canvas';
        container.appendChild(renderer.domElement);

        scene.add(new THREE.HemisphereLight(0xffffff, 0x252839, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.3);
        key.position.set(5, 8, 7);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0xffffff, 0.85);
        fill.position.set(-4, 2, -5);
        scene.add(fill);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;

        const frame = boundsFrame(preview);
        const distance = cameraDistance(frame.radius, camera.fov);
        controls.target.set(...frame.center);
        // Blockbench Generic Model uses -Z as the authored front for this portfolio.
        // Position the initial camera on that side so bosses/NPCs open facing the visitor.
        camera.position.set(
          frame.center[0] + distance * 0.72,
          frame.center[1] + distance * 0.38,
          frame.center[2] - distance,
        );
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 20, 100);
        camera.updateProjectionMatrix();
        controls.minDistance = Math.max(frame.radius * 0.35, 0.02);
        controls.maxDistance = Math.max(frame.radius * 8, distance * 3);
        controls.update();

        const clips = built.clips;
        const mixer = built.mixer;
        const defaultAnimation = built.defaultAnimation;
        const runtime: PlaybackRuntime = { clips, mixer, play: () => undefined };

        runtime.play = (name: string, fade = true) => {
          if (!mixer) {
            setActiveAnimation(name);
            return;
          }
          const clip = clips.find((candidate) => candidate.name === name);
          if (!clip) return;
          const nextAction = mixer.clipAction(clip);
          if (runtime.activeAction && runtime.activeAction !== nextAction && fade) runtime.activeAction.fadeOut(0.15);
          nextAction.reset();
          if (clipLoops(clip)) {
            nextAction.setLoop(THREE.LoopRepeat, Infinity);
            nextAction.clampWhenFinished = false;
          } else {
            nextAction.setLoop(THREE.LoopOnce, 1);
            nextAction.clampWhenFinished = true;
          }
          if (fade) nextAction.fadeIn(0.15);
          nextAction.paused = !playingRef.current;
          nextAction.play();
          runtime.activeAction = nextAction;
          runtime.activeClip = clip;
          setActiveAnimation(name);
        };
        playbackRef.current = runtime;

        if (mixer) {
          finishedListener = (event) => {
            if (event.action !== runtime.activeAction || !runtime.activeClip || clipLoops(runtime.activeClip)) return;
            if (defaultAnimation && defaultAnimation !== runtime.activeClip.name) runtime.play(defaultAnimation);
          };
          mixer.addEventListener('finished', finishedListener);
        }

        setAnimationNames(clips.map((clip) => clip.name));
        if (defaultAnimation) runtime.play(defaultAnimation, false);

        const clock = new THREE.Clock();
        const drawFrame = () => {
          if (disposed) return;
          frameId = requestAnimationFrame(drawFrame);
          const delta = clock.getDelta();
          if (playingRef.current) mixer?.update(delta);
          controls?.update();
          renderer?.render(scene, camera);
        };
        drawFrame();

        resizeObserver = new ResizeObserver(([entry]) => {
          if (!renderer) return;
          const width = Math.max(1, entry.contentRect.width);
          const height = Math.max(1, entry.contentRect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(container);
        setReady(true);
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return;
        console.error('[viewer-v2] Could not load preview.', error);
        cancelAnimationFrame(frameId);
        resizeObserver?.disconnect();
        decoderWorker?.terminate();
        decoderWorker = undefined;
        if (finishedListener && built?.mixer) built.mixer.removeEventListener('finished', finishedListener);
        finishedListener = undefined;
        controls?.dispose();
        controls = undefined;
        renderer?.dispose();
        renderer?.domElement.remove();
        renderer = undefined;
        built?.dispose();
        built = undefined;
        playbackRef.current = { clips: [], play: () => undefined };
        if (!disposed) setLoadFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      abortController.abort();
      decoderWorker?.terminate();
      decoderWorker = undefined;
      if (finishedListener && built?.mixer) built.mixer.removeEventListener('finished', finishedListener);
      finishedListener = undefined;
      controls?.dispose();
      controls = undefined;
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = undefined;
      built?.dispose();
      built = undefined;
      playbackRef.current = { clips: [], play: () => undefined };
    };
  }, [modelUrl]);

  function changeAnimation(name: string) {
    playbackRef.current.play(name);
  }

  function changePlaying(next: boolean) {
    playingRef.current = next;
    if (playbackRef.current.activeAction) playbackRef.current.activeAction.paused = !next;
    setPlaying(next);
  }

  return (
    <div
      className="model-viewer model-viewer-v2 detail-image detail-image-main"
      aria-label={`${creationName} interactive 3D model`}
      data-viewer-state={loadFailed ? 'fallback' : ready ? 'ready' : 'loading'}
    >
      <div className={`model-viewer-fallback${ready ? ' is-hidden' : ''}`}>
        <Image
          src={fallbackImage}
          alt={`${creationName} main render`}
          fill
          priority
          sizes="(max-width: 800px) 100vw, 70vw"
        />
      </div>
      <div ref={mountRef} className="model-viewer-stage" />
      {!ready && !loadFailed && <div className="model-viewer-loading">Loading 3D preview…</div>}
      <ModelViewerControls
        animationNames={animationNames}
        activeAnimation={activeAnimation}
        playing={playing}
        onAnimationChange={changeAnimation}
        onPlayingChange={changePlaying}
      />
    </div>
  );
}
