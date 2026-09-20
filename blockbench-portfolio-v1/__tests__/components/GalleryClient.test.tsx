import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GalleryClient, filterCreations } from '@/components/portfolio/GalleryClient';
import type { Creation } from '@/lib/creations/types';

const make = (patch: Partial<Creation>): Creation => ({
  id: patch.id ?? 'x', slug: patch.slug ?? 'x', name: patch.name ?? 'X', category: patch.category ?? 'Boss',
  tags: patch.tags ?? [], description: '', coverImage: '/models/_placeholder/creation-placeholder.svg', images: [],
  animations: [], featured: false, published: true, createdAt: '2026-09-20',
});
const rows = [
  make({ id: 'boss', slug: 'boss', name: 'Vorakh', category: 'Boss', tags: ['Ice'] }),
  make({ id: 'npc', slug: 'npc', name: 'Alchemist', category: 'NPC', tags: ['Potion'] }),
];

describe('GalleryClient', () => {
  it('filters by category without navigation', async () => {
    render(<GalleryClient creations={rows} categories={['Boss', 'NPC']} initialCategory="All" />);
    await userEvent.click(screen.getByRole('button', { name: 'Boss' }));
    expect(screen.getByText('Vorakh')).toBeInTheDocument();
    expect(screen.queryByText('Alchemist')).not.toBeInTheDocument();
  });

  it('searches names and tags case-insensitively', async () => {
    render(<GalleryClient creations={rows} categories={['Boss', 'NPC']} initialCategory="All" />);
    await userEvent.type(screen.getByRole('searchbox'), 'ICE');
    expect(screen.getByText('Vorakh')).toBeInTheDocument();
    expect(screen.queryByText('Alchemist')).not.toBeInTheDocument();
  });

  it('shows a useful empty state', async () => {
    render(<GalleryClient creations={rows} categories={['Boss', 'NPC']} initialCategory="All" />);
    await userEvent.type(screen.getByRole('searchbox'), 'no-match');
    expect(screen.getByText('No creations found.')).toBeInTheDocument();
  });
});

describe('filterCreations', () => {
  it('matches tags and category deterministically', () => {
    expect(filterCreations(rows, 'Boss', 'ice').map((row) => row.id)).toEqual(['boss']);
  });
});
