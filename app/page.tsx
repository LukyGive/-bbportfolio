import Link from 'next/link';
import { Hero } from '@/components/portfolio/Hero';
import { FeaturedGrid } from '@/components/portfolio/FeaturedGrid';
import { CategoryShortcuts } from '@/components/portfolio/CategoryShortcuts';
import { CreationGallery } from '@/components/portfolio/CreationGallery';
import { getCategories, getFeaturedCreations, getPublishedCreations } from '@/lib/creations/public';

export const dynamic = 'force-dynamic';
export default async function HomePage() {
  const [featured, published, categories] = await Promise.all([
    getFeaturedCreations(),
    getPublishedCreations(),
    getCategories(),
  ]);
  const latest = published.slice(0, 6);

  return (
    <>
      <Hero />
      <section id="selected-work" className="section shell">
        <div className="section-head">
          <div><span className="eyebrow">Selected work</span><h2>Featured creations</h2></div>
          <Link className="text-link" href="/creations">View all work <span aria-hidden="true">↗</span></Link>
        </div>
        <FeaturedGrid creations={featured} />
      </section>

      <section id="categories" className="section shell section-divided">
        <div className="section-head compact">
          <div><span className="eyebrow">Browse</span><h2>Categories</h2></div>
          <p className="section-copy">Jump straight into the type of model you want to explore.</p>
        </div>
        <CategoryShortcuts categories={categories} />
      </section>

      <section className="section shell section-divided">
        <div className="section-head">
          <div><span className="eyebrow">Recent</span><h2>Latest creations</h2></div>
        </div>
        <CreationGallery creations={latest} />
      </section>

      <footer className="footer shell">
        <div><strong>BLOCKBENCH / 3D</strong><p>Custom models, creatures & game-ready assets.</p></div>
        <Link href="/creations">Explore portfolio <span aria-hidden="true">↗</span></Link>
      </footer>
    </>
  );
}
