import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreationCard } from '@/components/portfolio/CreationCard';
import type { Creation } from '@/lib/creations/types';

vi.mock('@/components/portfolio/ModelThumbnail', () => ({
  ModelThumbnail: ({ creationName }: { creationName: string }) => (
    <div data-testid="legacy-thumbnail">{creationName}</div>
  ),
}));

vi.mock('@/components/portfolio/ModelThumbnailV2', () => ({
  ModelThumbnailV2: ({ creationName }: { creationName: string }) => (
    <div data-testid="v2-thumbnail">{creationName}</div>
  ),
}));

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

function creation(patch: Partial<Creation> = {}): Creation {
  return {
    id: '1',
    slug: 'vorakh',
    name: 'Vorakh',
    category: 'Boss',
    tags: ['Ice', 'Fantasy', 'Golem'],
    description: '',
    coverImage: PLACEHOLDER,
    images: [],
    animations: [],
    featured: false,
    published: true,
    createdAt: '2026-09-21',
    ...patch,
  };
}

describe('CreationCard', () => {
  it('uses Viewer V2 thumbnail when no render exists and the viewer is bbpreview', () => {
    render(<CreationCard creation={creation({
      viewer: {
        modelUrl: 'https://example.com/preview.bbpreview',
        animationNames: ['Idle'],
        format: 'bbpreview',
      },
    })} />);

    expect(screen.getByTestId('v2-thumbnail')).toBeInTheDocument();
    expect(screen.queryByTestId('legacy-thumbnail')).not.toBeInTheDocument();
  });

  it('keeps the legacy GLB thumbnail for legacy viewer records', () => {
    render(<CreationCard creation={creation({
      viewer: {
        modelUrl: 'https://example.com/model.glb',
        animationNames: [],
        format: 'glb',
      },
    })} />);

    expect(screen.getByTestId('legacy-thumbnail')).toBeInTheDocument();
    expect(screen.queryByTestId('v2-thumbnail')).not.toBeInTheDocument();
  });

  it('prefers an authored render over either viewer format', () => {
    render(<CreationCard creation={creation({
      coverImage: 'https://example.com/render.png',
      viewer: {
        modelUrl: 'https://example.com/preview.bbpreview',
        animationNames: [],
        format: 'bbpreview',
      },
    })} />);

    expect(screen.queryByTestId('v2-thumbnail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legacy-thumbnail')).not.toBeInTheDocument();
    expect(screen.getByAltText('Vorakh render')).toBeInTheDocument();
  });

  it('keeps tags inside the media card markup', () => {
    render(<CreationCard creation={creation()} />);
    const tags = screen.getByLabelText('Tags');
    expect(tags).toHaveTextContent('Ice');
    expect(tags).toHaveTextContent('Fantasy');
    expect(tags).toHaveTextContent('Golem');
  });
});
