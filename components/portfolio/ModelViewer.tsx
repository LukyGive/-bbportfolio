'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { AnimationAction, AnimationClip, AnimationMixer, Material, Object3D, Texture } from 'three';
import { pickDefaultAnimation } from '@/lib/viewer/animation';
import { cameraDistanceForRadius } from '@/lib/viewer/framing';
import { ModelViewerControls } from './ModelViewerControls';

type Props = {
  modelUrl: string;
  creationName: string;
  fallbackImage: string;
};

type ViewerRuntime = {
  mixer?: AnimationMixer;
  clips: AnimationClip[];
  activeAction?: AnimationAction;
};

function disposeMaterial(material: Material) {
  const values = Object.values(material as unknown as Record<string, unknown>);
  for (const value of values) {
    if (
      value &&
      typeof value === 'object' &&
      'isTexture' in value &&
      (value as { isTexture?: boolean }).isTexture
    ) {
      (value as Texture).dispose();
    }
  }
  material.dispose();
}

function disposeObject(root: Object3D) {
  root.traverse((child) => {
    const candidate = child as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
    };

    candidate.geometry?.dispose();

    if (Array.isArray(candidate.material)) {
      candidate.material.forEach(disposeMaterial);
    } else if (candidate.material) {
      disposeMaterial(candidate.material);
    }
  });
}

export function ModelViewer({ modelUrl, creationName, fallbackImage }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime>({ clips: [] });
  const playingRef = useRef(true);

  const [loadFailed, setLoadFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<string>();
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let root: Object3D | undefined;
    let resizeObserver: ResizeObserver | undefined;

    setLoadFailed(false);
    setLoaded(false);
    setAnimationNames([]);
    setActiveAnimation(undefined);
    setPlaying(true);
    playingRef.current = true;
    runtimeRef.current = { clips: [] };

    void (async () => {
      try {
        const [
          THREE,
          { GLTFLoader },
          { OrbitControls },
        ] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/controls/OrbitControls.js'),
        ]);

        if (disposed) return;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1000);
        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1), false);
        renderer.domElement.className = 'model-viewer-canvas';
        container.appendChild(renderer.domElement);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 2.1);
        scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 2.4);
        key.position.set(4, 7, 6);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xffffff, 1);
        fill.position.set(-5, 2, -4);
        scene.add(fill);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 0.02;

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);

        if (disposed) {
          disposeObject(gltf.scene);
          controls.dispose();
          renderer.dispose();
          renderer.domElement.remove();
          return;
        }

        root = gltf.scene;
        scene.add(gltf.scene);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        if (box.isEmpty()) throw new Error('Viewer model has no visible geometry.');

        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const distance = cameraDistanceForRadius(sphere.radius, camera.fov);

        controls.target.copy(sphere.center);
        camera.position.set(
          sphere.center.x + distance * 0.75,
          sphere.center.y + distance * 0.45,
          sphere.center.z + distance,
        );
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 20, 100);
        camera.updateProjectionMatrix();

        controls.minDistance = Math.max(sphere.radius * 0.35, 0.02);
        controls.maxDistance = Math.max(sphere.radius * 8, distance * 3);
        controls.update();

        const mixer = gltf.animations.length
          ? new THREE.AnimationMixer(gltf.scene)
          : undefined;

        const names = gltf.animations.map((clip) => clip.name);
        const initial = pickDefaultAnimation(names);

        runtimeRef.current = {
          mixer,
          clips: gltf.animations,
        };

        if (mixer && initial) {
          const clip = THREE.AnimationClip.findByName(gltf.animations, initial);
          if (clip) {
            const action = mixer.clipAction(clip);
            action.reset().play();
            runtimeRef.current.activeAction = action;
          }
        }

        setAnimationNames(names);
        setActiveAnimation(initial);
        setLoaded(true);

        const clock = new THREE.Clock();

        const frame = () => {
          if (disposed) return;
          frameId = requestAnimationFrame(frame);
          const delta = clock.getDelta();
          if (playingRef.current) runtimeRef.current.mixer?.update(delta);
          controls.update();
          renderer.render(scene, camera);
        };
        frame();

        resizeObserver = new ResizeObserver(([entry]) => {
          const width = Math.max(1, entry.contentRect.width);
          const height = Math.max(1, entry.contentRect.height);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        });
        resizeObserver.observe(container);

        return () => {
          controls.dispose();
          renderer.dispose();
        };
      } catch (error) {
        console.error('[viewer] Could not load 3D model.', error);
        if (!disposed) setLoadFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      runtimeRef.current.mixer?.stopAllAction();
      if (root) disposeObject(root);
      for (const canvas of Array.from(container.querySelectorAll('canvas'))) {
        canvas.remove();
      }
      runtimeRef.current = { clips: [] };
    };
  }, [modelUrl]);

  function changeAnimation(name: string) {
    const runtime = runtimeRef.current;
    if (!runtime.mixer) {
      setActiveAnimation(name);
      return;
    }

    const clip = runtime.clips.find((candidate) => candidate.name === name);
    if (!clip) return;

    const nextAction = runtime.mixer.clipAction(clip);

    if (runtime.activeAction && runtime.activeAction !== nextAction) {
      runtime.activeAction.fadeOut(0.15);
    }

    nextAction.reset().fadeIn(0.15).play();
    nextAction.paused = !playingRef.current;
    runtime.activeAction = nextAction;
    setActiveAnimation(name);
  }

  function changePlaying(next: boolean) {
    playingRef.current = next;
    if (runtimeRef.current.activeAction) {
      runtimeRef.current.activeAction.paused = !next;
    }
    setPlaying(next);
  }

  if (loadFailed) {
    return (
      <div className="detail-image detail-image-main">
        <Image
          src={fallbackImage}
          alt={`${creationName} main render`}
          fill
          priority
          sizes="(max-width: 800px) 100vw, 70vw"
        />
      </div>
    );
  }

  return (
    <div
      className="model-viewer detail-image detail-image-main"
      aria-label={`${creationName} interactive 3D model`}
    >
      <div ref={mountRef} className="model-viewer-stage" />
      {!loaded && <div className="model-viewer-loading">Loading 3D model…</div>}
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
