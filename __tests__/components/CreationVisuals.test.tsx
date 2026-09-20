import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Creation } from '@/lib/creations/types';

vi.mock('@/components/portfolio/ModelViewer', () => ({
  ModelViewer: ({ creationName }: { creationName: string }) => (
    <div aria-label={`${creationName} interactive 3D model`} />
  ),
}));

import { CreationVisuals } from '@/components/portfolio/CreationVisuals';

const creation: Creation = {
  id: '1', slug: 'vorakh', name: 'Vorakh', category: 'Boss', tags: [], description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: [],
  featured: false, published: true, createdAt: '2026-09-20',
};

describe('CreationVisuals', () => {
  it('renders the viewer first when viewer metadata exists', () => {
    render(<CreationVisuals creation={{
      ...creation,
      viewer: { modelUrl: 'https://example.com/model.glb', animationNames: ['Idle'] },
    }} />);
    expect(screen.getByLabelText(/interactive 3d model/i)).toBeInTheDocument();
  });

  it('uses the image gallery when no viewer exists', () => {
    render(<CreationVisuals creation={creation} />);
    expect(screen.queryByLabelText(/interactive 3d model/i)).not.toBeInTheDocument();
    expect(screen.getByAltText(/main render/i)).toBeInTheDocument();
  });
});
