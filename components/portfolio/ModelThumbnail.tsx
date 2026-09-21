'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Material,
  Object3D,
  Texture,
} from 'three';
import { pickDefaultAnimation } from '@/lib/viewer/animation';
import { cameraDistanceForRadius } from '@/lib/viewer/framing';

type Props = {
  modelUrl: string;
  creationName: string;
};

type Runtime = {
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

export function ModelThumbnail({ modelUrl, creationName }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime>({ clips: [] });
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let disposed = false;
    let frameId = 0;
    let root: Object3D | undefined;
    let resizeObserver: ResizeObserver | undefined;

    runtimeRef.current = { clips: [] };
    setLoadFailed(false);

    void (async () => {
      try {
        const [
          THREE,
          { GLTFLoader },
        ] = await Promise.all([
          import('three'),
          import('three/examples/jsm/loaders/GLTFLoader.js'),
        ]);

        if (disposed) return;

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 1000);

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
        });

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setSize(
          Math.max(container.clientWidth, 1),
          Math.max(container.clientHeight, 1),
          false,
        );
        renderer.domElement.className = 'model-thumbnail-canvas';
        container.appendChild(renderer.domElement);

        const hemi = new THREE.HemisphereLight(0xffffff, 0x1b1f28, 2.2);
        scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 2.4);
        key.position.set(4, 7, 6);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xffffff, 1);
        fill.position.set(-5, 2, -4);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffffff, 0.8);
        rim.position.set(0, 6, -6);
        scene.add(rim);

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(modelUrl);

        if (disposed) {
          disposeObject(gltf.scene);
          renderer.dispose();
          renderer.domElement.remove();
          return;
        }

        root = gltf.scene;
        scene.add(root);

        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty()) {
          throw new Error('Thumbnail model has no visible geometry.');
        }

        const sphere = box.getBoundingSphere(new THREE.Sphere());
        const distance = cameraDistanceForRadius(sphere.radius, camera.fov);

        camera.position.set(
          sphere.center.x + distance * 0.8,
          sphere.center.y + distance * 0.45,
          sphere.center.z + distance * 0.95,
        );
        camera.lookAt(sphere.center);
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = Math.max(distance * 20, 100);
        camera.updateProjectionMatrix();

        const mixer = gltf.animations.length
          ? new THREE.AnimationMixer(root)
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

        const clock = new THREE.Clock();

        const frame = () => {
          if (disposed) return;
          frameId = requestAnimationFrame(frame);

          const delta = clock.getDelta();

          runtimeRef.current.mixer?.update(delta);

          if (root) {
            root.rotation.y += delta * 0.45;
          }

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
      } catch (error) {
        console.error('[thumbnail] Could not load 3D model.', error);
        if (!disposed) setLoadFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      runtimeRef.current.mixer?.stopAllAction();

      if (root) {
        disposeObject(root);
      }

      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.remove();
      }
    };
  }, [modelUrl]);

  return (
    <div
      ref={mountRef}
      className="model-thumbnail"
      aria-label={`${creationName} 3D preview`}
    >
      <span className="model-thumbnail-badge">BBMODEL</span>

      {loadFailed && (
        <div className="model-thumbnail-fallback">
          <span>{creationName}</span>
        </div>
      )}
    </div>
  );
}
