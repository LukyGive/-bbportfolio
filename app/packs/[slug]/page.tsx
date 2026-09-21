import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreationGallery } from '@/components/portfolio/CreationGallery';
import { PackMosaic } from '@/components/portfolio/PackMosaic';
import { PackStats } from '@/components/portfolio/PackStats';
import { getPackBySlug } from '@/lib/packs/public';
import { getPackStats } from '@/lib/packs/stats';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  if (!pack) return { title: 'Pack not found' };
  return {
    title: pack.name,
    description: pack.description || `${pack.name} — a curated Blockbench asset collection.`,
  };
}

export default async function PackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pack = await getPackBySlug(slug);
  if (!pack) return notFound();
  const stats = getPackStats(pack.creations);

  return (
    <article className="pack-detail shell">
      <Link className="detail-back" href="/packs"><span aria-hidden="true">←</span> All packs</Link>
      <header className="pack-detail-header">
        <span className="eyebrow">PACK</span>
        <h1>{pack.name}</h1>
        {pack.description && <p>{pack.description}</p>}
      </header>

      <PackMosaic pack={pack} className="pack-hero" priority sizes="100vw" />
      <PackStats stats={stats} />

      <section className="section pack-members">
        <div className="section-head compact">
          <div><span className="eyebrow">Included creations</span><h2>Inside the pack</h2></div>
        </div>
        <CreationGallery creations={pack.creations} />
      </section>
    </article>
  );
}
