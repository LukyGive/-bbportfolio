import Image from 'next/image';
import type { Pack } from '@/lib/packs/types';
import { getMosaicCreations } from '@/lib/packs/stats';

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

type Props = {
  pack: Pack;
  className?: string;
  priority?: boolean;
  sizes?: string;
};

export function PackMosaic({
  pack,
  className = '',
  priority = false,
  sizes = '(max-width: 700px) 100vw, 50vw',
}: Props) {
  if (pack.coverImage) {
    return (
      <div className={`${className} pack-mosaic pack-mosaic-manual`.trim()}>
        <Image
          src={pack.coverImage}
          alt={`${pack.name} cover`}
          fill
          priority={priority}
          sizes={sizes}
        />
      </div>
    );
  }

  const tiles = getMosaicCreations(pack.creations);
  return (
    <div
      className={`${className} pack-mosaic pack-mosaic-auto pack-mosaic-count-${tiles.length}`.trim()}
      data-testid="pack-mosaic-grid"
    >
      {tiles.length === 0 ? (
        <div className="pack-mosaic-empty"><span>Pack preview</span></div>
      ) : tiles.map((creation) => {
        const render = creation.coverImage && creation.coverImage !== PLACEHOLDER
          ? creation.coverImage
          : creation.images?.[0];

        return render ? (
          <div className="pack-mosaic-tile" key={creation.id}>
            <Image src={render} alt="" fill sizes="25vw" />
          </div>
        ) : (
          <div className="pack-mosaic-tile pack-mosaic-fallback" key={creation.id}>
            <strong>{creation.name}</strong>
            <span>{creation.category}</span>
          </div>
        );
      })}
    </div>
  );
}
