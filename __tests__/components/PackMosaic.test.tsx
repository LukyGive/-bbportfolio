import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackMosaic } from '@/components/portfolio/PackMosaic';

it('prefers a manual cover', () => {
  render(<PackMosaic pack={{ name: 'Sakura Pack', coverImage: 'https://cdn/cover.webp', creations: [] } as never} />);
  expect(screen.getByRole('img', { name: /sakura pack cover/i })).toBeInTheDocument();
  expect(screen.queryByTestId('pack-mosaic-grid')).not.toBeInTheDocument();
});

it('uses 2d/fallback tiles and never renders a canvas for automatic mosaic', () => {
  render(<PackMosaic pack={{ name: 'Sakura Pack', creations: [{ id: '1', name: 'Pickaxe', category: 'Item', coverImage: '/models/_placeholder/creation-placeholder.svg' }] } as never} />);
  expect(screen.getByTestId('pack-mosaic-grid')).toBeInTheDocument();
  expect(document.querySelector('canvas')).toBeNull();
  expect(screen.getByText('Pickaxe')).toBeInTheDocument();
});

it('renders a stable empty fallback when no public members are available', () => {
  render(<PackMosaic pack={{ name: 'Empty Pack', creations: [] } as never} />);
  expect(screen.getByText('Pack preview')).toBeInTheDocument();
});


it('uses a gallery render before falling back to text when the creation cover is missing', () => {
  render(<PackMosaic pack={{
    name: 'Gallery Pack',
    creations: [{
      id: '1', name: 'Pickaxe', category: 'Item',
      coverImage: '/models/_placeholder/creation-placeholder.svg',
      images: ['/renders/pickaxe.webp'],
    }],
  } as never} />);
  expect(document.querySelector('[data-testid="pack-mosaic-grid"] img')).not.toBeNull();
  expect(screen.queryByText('Pickaxe')).not.toBeInTheDocument();
});
