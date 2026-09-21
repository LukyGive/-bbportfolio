import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Creation } from '@/lib/creations/types';

vi.mock('@/components/portfolio/ModelViewer', () => ({
  ModelViewer: ({ creationName }: { creationName: string }) => (
    <div aria-label={`${creationName} legacy 3D model`} />
  ),
}));

vi.mock('@/components/portfolio/ModelViewerV2', () => ({
  ModelViewerV2: ({ creationName }: { creationName: string }) => (
    <div aria-label={`${creationName} Viewer V2 model`} />
  ),
}));

import { CreationVisuals } from '@/components/portfolio/CreationVisuals';

const creation: Creation = {
  id: '1', slug: 'vorakh', name: 'Vorakh', category: 'Boss', tags: [], description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: [],
  featured: false, published: true, createdAt: '2026-09-20',
};

describe('CreationVisuals', () => {
  it('uses Viewer V2 for .bbpreview metadata', () => {
    render(<CreationVisuals creation={{
      ...creation,
      viewer: { modelUrl: 'https://example.com/preview.bbpreview', animationNames: ['Idle'], format: 'bbpreview' },
    }} />);
    expect(screen.getByLabelText(/viewer v2 model/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/legacy 3d model/i)).not.toBeInTheDocument();
  });

  it('keeps the legacy viewer for GLB metadata', () => {
    render(<CreationVisuals creation={{
      ...creation,
      viewer: { modelUrl: 'https://example.com/model.glb', animationNames: ['Idle'], format: 'glb' },
    }} />);
    expect(screen.getByLabelText(/legacy 3d model/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/viewer v2 model/i)).not.toBeInTheDocument();
  });

  it('uses the image gallery when no viewer exists', () => {
    render(<CreationVisuals creation={creation} />);
    expect(screen.queryByLabelText(/viewer v2 model/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/legacy 3d model/i)).not.toBeInTheDocument();
    expect(screen.getByAltText(/main render/i)).toBeInTheDocument();
  });
});
