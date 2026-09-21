import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

vi.mock('@/components/portfolio/ModelThumbnail', () => ({
  ModelThumbnail: ({ creationName }: { creationName: string }) => (
    <div data-testid="glb-pack-thumbnail">{creationName}</div>
  ),
}));

vi.mock('@/components/portfolio/ModelThumbnailV2', () => ({
  ModelThumbnailV2: ({ creationName }: { creationName: string }) => (
    <div data-testid="bbpreview-pack-thumbnail">{creationName}</div>
  ),
}));

import { PackMosaic } from '@/components/portfolio/PackMosaic';

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

it('prefers a manual cover', () => {
  render(<PackMosaic pack={{ name: 'Sakura Pack', coverImage: 'https://cdn/cover.webp', creations: [] } as never} />);
  expect(screen.getByRole('img', { name: /sakura pack cover/i })).toBeInTheDocument();
  expect(screen.queryByTestId('pack-mosaic-grid')).not.toBeInTheDocument();
});

it('uses a centered bbpreview thumbnail when a creation has no 2d render', () => {
  render(<PackMosaic pack={{
    name: 'Sakura Pack',
    creations: [{
      id: '1',
      name: 'Sakura Pickaxe',
      category: 'Item',
      coverImage: PLACEHOLDER,
      images: [],
      viewer: {
        modelUrl: '/viewer/sakura-pickaxe.bbpreview',
        animationNames: [],
        format: 'bbpreview',
      },
    }],
  } as never} />);

  expect(screen.getByTestId('bbpreview-pack-thumbnail')).toHaveTextContent('Sakura Pickaxe');
  expect(screen.queryByText('Item')).not.toBeInTheDocument();
});

it('uses the legacy 3d thumbnail for a glb viewer when no 2d render exists', () => {
  render(<PackMosaic pack={{
    name: 'Legacy Pack',
    creations: [{
      id: '1',
      name: 'Legacy Model',
      category: 'Mob',
      coverImage: PLACEHOLDER,
      images: [],
      viewer: {
        modelUrl: '/viewer/legacy.glb',
        animationNames: [],
        format: 'glb',
      },
    }],
  } as never} />);

  expect(screen.getByTestId('glb-pack-thumbnail')).toHaveTextContent('Legacy Model');
});

it('falls back to text only when neither a render nor a viewer is available', () => {
  render(<PackMosaic pack={{
    name: 'Fallback Pack',
    creations: [{
      id: '1',
      name: 'Pickaxe',
      category: 'Item',
      coverImage: PLACEHOLDER,
      images: [],
    }],
  } as never} />);

  expect(screen.getByText('Pickaxe')).toBeInTheDocument();
  expect(screen.getByText('Item')).toBeInTheDocument();
  expect(screen.queryByTestId('bbpreview-pack-thumbnail')).not.toBeInTheDocument();
});

it('renders a stable empty fallback when no public members are available', () => {
  render(<PackMosaic pack={{ name: 'Empty Pack', creations: [] } as never} />);
  expect(screen.getByText('Pack preview')).toBeInTheDocument();
});

it('uses a gallery render before the 3d viewer when a 2d image is available', () => {
  render(<PackMosaic pack={{
    name: 'Gallery Pack',
    creations: [{
      id: '1',
      name: 'Pickaxe',
      category: 'Item',
      coverImage: PLACEHOLDER,
      images: ['/renders/pickaxe.webp'],
      viewer: {
        modelUrl: '/viewer/pickaxe.bbpreview',
        animationNames: [],
        format: 'bbpreview',
      },
    }],
  } as never} />);

  expect(document.querySelector('[data-testid="pack-mosaic-grid"] img')).not.toBeNull();
  expect(screen.queryByTestId('bbpreview-pack-thumbnail')).not.toBeInTheDocument();
});
