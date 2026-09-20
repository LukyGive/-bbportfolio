import type { Metadata } from 'next';
import { GalleryClient } from '@/components/portfolio/GalleryClient';
import { getCategories, getPublishedCreations } from '@/lib/creations/public';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Creations',
  description: 'Browse Blockbench bosses, NPCs, mobs, items, weapons, tools and armor.',
};

type Props = { searchParams: Promise<{ category?: string | string[] }> };

export default async function CreationsPage({ searchParams }: Props) {
  const [creations, categories, params] = await Promise.all([
    getPublishedCreations(),
    getCategories(),
    searchParams,
  ]);
  const requested = typeof params.category === 'string' ? params.category : 'All';
  const initialCategory = categories.includes(requested) ? requested : 'All';

  return (
    <div className="page-shell shell">
      <header className="page-intro">
        <span className="eyebrow">Portfolio archive</span>
        <h1>All creations</h1>
        <p>Explore custom Blockbench work by category, name or tag.</p>
      </header>
      <GalleryClient creations={creations} categories={categories} initialCategory={initialCategory} />
    </div>
  );
}
