import type { Metadata } from 'next';
import { PackGallery } from '@/components/portfolio/PackGallery';
import { getPublishedPacks } from '@/lib/packs/public';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Packs',
  description: 'Curated collections of Blockbench models and assets.',
};

export default async function PacksPage() {
  const packs = await getPublishedPacks();
  return (
    <div className="page-shell shell">
      <header className="page-intro">
        <span className="eyebrow">PACK COLLECTIONS</span>
        <h1>Packs</h1>
        <p>Curated collections of Blockbench models and assets.</p>
      </header>
      <PackGallery packs={packs} priorityCount={3} />
    </div>
  );
}
