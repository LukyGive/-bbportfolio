import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreationGallery } from '@/components/portfolio/CreationGallery';
import { CreationMeta } from '@/components/portfolio/CreationMeta';
import { ImageGallery } from '@/components/portfolio/ImageGallery';
import { getCreationBySlug, getPublishedCreations } from '@/lib/creations/public';
import { getRelatedCreations } from '@/lib/creations/related';

export const dynamic = 'force-dynamic';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const creation = await getCreationBySlug(slug);
  if (!creation) return { title: 'Creation not found' };
  return {
    title: creation.name,
    description: creation.description || `${creation.name} — ${creation.category} created in Blockbench.`,
  };
}

export default async function CreationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [creation, all] = await Promise.all([getCreationBySlug(slug), getPublishedCreations()]);
  if (!creation) return notFound();
  const related = getRelatedCreations(creation, all, 3);

  return (
    <article className="detail-page shell">
      <Link className="detail-back" href="/creations"><span aria-hidden="true">←</span> All creations</Link>
      <header className="detail-header">
        <div>
          <span className="eyebrow">{creation.category}</span>
          <h1>{creation.name}</h1>
        </div>
        <p>{creation.description}</p>
      </header>

      <div className="detail-layout">
        <ImageGallery creation={creation} />
        <CreationMeta creation={creation} />
      </div>

      {related.length > 0 && (
        <section className="section detail-related">
          <div className="section-head">
            <div><span className="eyebrow">Keep exploring</span><h2>Related work</h2></div>
          </div>
          <CreationGallery creations={related} />
        </section>
      )}
    </article>
  );
}
