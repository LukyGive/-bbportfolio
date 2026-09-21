import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { PackCard } from '@/components/portfolio/PackCard';

it('links the pack archive card to its pack route and reports public model count', () => {
  render(<PackCard pack={{ id: '1', slug: 'sakura-pack', name: 'Sakura Pack', description: '', creations: [{ id: 'a' }, { id: 'b' }] } as never} />);
  expect(screen.getByRole('link', { name: /view sakura pack/i })).toHaveAttribute('href', '/packs/sakura-pack');
  expect(screen.getByText('2 models')).toBeInTheDocument();
});
