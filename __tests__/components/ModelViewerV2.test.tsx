import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  buildPreviewScene: vi.fn(),
}));

vi.mock('@/lib/viewer-v2/runtime/build-scene', () => ({
  buildPreviewScene: runtime.buildPreviewScene,
}));

const three = vi.hoisted(() => {
  const renderers: Array<{ domElement: HTMLCanvasElement; dispose: ReturnType<typeof vi.fn> }> = [];

  class Scene {
    children: unknown[] = [];
    add(...objects: unknown[]) { this.children.push(...objects); }
  }

  class PerspectiveCamera {
    fov: number;
    aspect = 1;
    near = 0.001;
    far = 1000;
    position = { set: vi.fn() };
    constructor(fov: number) { this.fov = fov; }
    updateProjectionMatrix = vi.fn();
  }

  class WebGLRenderer {
    domElement = document.createElement('canvas');
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    outputColorSpace = '';
    constructor() { renderers.push(this); }
  }

  class HemisphereLight {}
  class DirectionalLight { position = { set: vi.fn() }; }
  class Clock { getDelta() { return 0.016; } }

  return {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    HemisphereLight,
    DirectionalLight,
    Clock,
    SRGBColorSpace: 'srgb',
    LoopOnce: 2200,
    LoopRepeat: 2201,
    renderers,
  };
});

vi.mock('three', () => three);

const orbit = vi.hoisted(() => ({ instances: [] as Array<{ dispose: ReturnType<typeof vi.fn> }> }));
vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    target = { set: vi.fn() };
    enableDamping = false;
    dampingFactor = 0;
    enablePan = true;
    minDistance = 0;
    maxDistance = Infinity;
    update = vi.fn();
    dispose = vi.fn();
    constructor() { orbit.instances.push(this); }
  },
}));

class FakeResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: ResizeObserverCallback) {}
}

const workerState = {
  fail: false,
  instances: [] as FakeWorker[],
};

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminate = vi.fn();

  constructor() { workerState.instances.push(this); }

  postMessage() {
    queueMicrotask(() => {
      if (workerState.fail) {
        this.onmessage?.({ data: { type: 'error', message: 'bad preview' } } as MessageEvent);
      } else {
        this.onmessage?.({ data: { type: 'decoded', preview: previewPayload } } as MessageEvent);
      }
    });
  }
}

const previewPayload = {
  version: 1,
  metadata: {
    generator: 'bbportfolio-viewer-v2', sourceFormat: 'generic_entity', meshCount: 0,
    vertexCount: 0, triangleCount: 0, textureCount: 0, nodeCount: 1, animationCount: 2,
  },
  bounds: { min: [0, 0, 0], max: [16, 16, 16] },
  textures: [], materials: [],
  nodes: [{ id: 0, parentId: null, pivot: [0, 0, 0], position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  meshes: [], animations: [],
};

function action() {
  return {
    reset: vi.fn().mockReturnThis(),
    fadeIn: vi.fn().mockReturnThis(),
    fadeOut: vi.fn().mockReturnThis(),
    play: vi.fn().mockReturnThis(),
    setLoop: vi.fn().mockReturnThis(),
    paused: false,
    clampWhenFinished: false,
  };
}

function builtRuntime(withAnimations = true) {
  const idleAction = action();
  const attackAction = action();
  const actions = new Map<string, ReturnType<typeof action>>([
    ['Idle', idleAction],
    ['Attack', attackAction],
  ]);
  const listeners = new Map<string, (event: { action: ReturnType<typeof action> }) => void>();
  const clips = withAnimations ? [
    { name: 'Idle', userData: { bbpreviewLoop: true } },
    { name: 'Attack', userData: { bbpreviewLoop: false } },
  ] : [];
  const mixer = withAnimations ? {
    clipAction: vi.fn((clip: { name: string }) => actions.get(clip.name)),
    update: vi.fn(),
    stopAllAction: vi.fn(),
    addEventListener: vi.fn((name: string, listener: (event: { action: ReturnType<typeof action> }) => void) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)),
  } : undefined;
  return {
    root: {},
    mixer,
    clips,
    defaultAnimation: withAnimations ? 'Idle' : undefined,
    dispose: vi.fn(),
    actions,
    listeners,
  };
}

const originalFetch = global.fetch;
const originalWorker = global.Worker;
const originalResizeObserver = global.ResizeObserver;
const originalRaf = global.requestAnimationFrame;
const originalCancelRaf = global.cancelAnimationFrame;

beforeEach(() => {
  workerState.fail = false;
  workerState.instances = [];
  three.renderers.length = 0;
  orbit.instances.length = 0;
  global.Worker = FakeWorker as unknown as typeof Worker;
  global.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  global.requestAnimationFrame = vi.fn(() => 1) as unknown as typeof requestAnimationFrame;
  global.cancelAnimationFrame = vi.fn();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => '{}' }) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  global.Worker = originalWorker;
  global.ResizeObserver = originalResizeObserver;
  global.requestAnimationFrame = originalRaf;
  global.cancelAnimationFrame = originalCancelRaf;
  vi.clearAllMocks();
});

import { ModelViewerV2 } from '@/components/portfolio/ModelViewerV2';

describe('ModelViewerV2', () => {
  it('keeps the cover render visible until the 3D scene is ready', async () => {
    runtime.buildPreviewScene.mockResolvedValue(builtRuntime(false));
    render(<ModelViewerV2 modelUrl="https://example.com/preview.bbpreview" creationName="Sakura" fallbackImage="/sakura.png" />);

    const fallback = screen.getByAltText(/sakura main render/i);
    expect(fallback).toBeInTheDocument();
    expect(fallback.closest('.model-viewer-fallback')).not.toHaveClass('is-hidden');

    await waitFor(() => expect(document.querySelector('canvas')).toBeInTheDocument());
    expect(fallback.closest('.model-viewer-fallback')).toHaveClass('is-hidden');
  });

  it('leaves the cover render visible when decoding fails', async () => {
    workerState.fail = true;
    runtime.buildPreviewScene.mockResolvedValue(builtRuntime(false));
    render(<ModelViewerV2 modelUrl="https://example.com/preview.bbpreview" creationName="Sakura" fallbackImage="/sakura.png" />);

    await waitFor(() => expect(workerState.instances[0]?.terminate).toHaveBeenCalled());
    expect(screen.getByAltText(/sakura main render/i).closest('.model-viewer-fallback')).not.toHaveClass('is-hidden');
    expect(document.querySelector('canvas')).not.toBeInTheDocument();
  });

  it('hides animation controls for a static preview', async () => {
    runtime.buildPreviewScene.mockResolvedValue(builtRuntime(false));
    render(<ModelViewerV2 modelUrl="https://example.com/preview.bbpreview" creationName="Sakura" fallbackImage="/sakura.png" />);
    await waitFor(() => expect(document.querySelector('canvas')).toBeInTheDocument());
    expect(screen.queryByLabelText(/animation/i)).not.toBeInTheDocument();
  });

  it('starts Idle and returns to it after a one-shot Attack finishes', async () => {
    const built = builtRuntime(true);
    runtime.buildPreviewScene.mockResolvedValue(built);
    render(<ModelViewerV2 modelUrl="https://example.com/preview.bbpreview" creationName="Vorakh" fallbackImage="/vorakh.png" />);

    await waitFor(() => expect(screen.getByLabelText(/^animation$/i)).toHaveValue('Idle'));
    expect(built.actions.get('Idle')?.play).toHaveBeenCalledTimes(1);

    await userEvent.selectOptions(screen.getByLabelText(/^animation$/i), 'Attack');
    expect(built.actions.get('Attack')?.setLoop).toHaveBeenCalledWith(three.LoopOnce, 1);
    expect(built.actions.get('Attack')?.play).toHaveBeenCalledTimes(1);

    await act(async () => {
      built.listeners.get('finished')?.({ action: built.actions.get('Attack')! });
    });
    expect(built.actions.get('Idle')?.play).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/^animation$/i)).toHaveValue('Idle');
  });

  it('disposes the renderer, controls and built scene on unmount', async () => {
    const built = builtRuntime(false);
    runtime.buildPreviewScene.mockResolvedValue(built);
    const view = render(<ModelViewerV2 modelUrl="https://example.com/preview.bbpreview" creationName="Sakura" fallbackImage="/sakura.png" />);
    await waitFor(() => expect(document.querySelector('canvas')).toBeInTheDocument());
    view.unmount();
    expect(built.dispose).toHaveBeenCalledOnce();
    expect(three.renderers[0]?.dispose).toHaveBeenCalledOnce();
    expect(orbit.instances[0]?.dispose).toHaveBeenCalledOnce();
  });
});
