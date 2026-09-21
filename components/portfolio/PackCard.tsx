import Link from 'next/link';
import type { Pack } from '@/lib/packs/types';
import { PackMosaic } from './PackMosaic';

type Props = {
  pack: Pack;
  priority?: boolean;
};

export function PackCard({ pack, priority = false }: Props) {
  const count = pack.creations.length;
  return (
    <Link className="pack-card" href={`/packs/${pack.slug}`} aria-label={`View ${pack.name}`}>
      <PackMosaic
        pack={pack}
        className="pack-card-media"
        priority={priority}
        sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
      />
      <div className="pack-card-info">
        <div><h3>{pack.name}</h3><p>{pack.description}</p></div>
        <span>{count} {count === 1 ? 'model' : 'models'}</span>
      </div>
    </Link>
  );
}
