import Image from 'next/image';
import Link from 'next/link';
import type { Creation } from '@/lib/creations/types';
import { ModelThumbnail } from './ModelThumbnail';
import { ModelThumbnailV2 } from './ModelThumbnailV2';

type CreationCardProps = {
  creation: Creation;
  priority?: boolean;
};

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

export function CreationCard({ creation, priority = false }: CreationCardProps) {
  const tags = creation.tags.slice(0, 3);
  const useViewerThumbnail = Boolean(
    creation.viewer && creation.coverImage === PLACEHOLDER,
  );

  return (
    <Link
      className="creation-card"
      href={`/creations/${creation.slug}`}
      aria-label={`View ${creation.name}`}
    >
      <div className="creation-card-media">
        {useViewerThumbnail && creation.viewer ? (
          creation.viewer.format === 'bbpreview' ? (
            <ModelThumbnailV2
              modelUrl={creation.viewer.modelUrl}
              creationName={creation.name}
            />
          ) : (
            <ModelThumbnail
              modelUrl={creation.viewer.modelUrl}
              creationName={creation.name}
            />
          )
        ) : (
          <Image
            src={creation.coverImage}
            alt={`${creation.name} render`}
            fill
            priority={priority}
            sizes="(max-width: 700px) 100vw, (max-width: 1050px) 50vw, 33vw"
          />
        )}

        <div className="creation-card-overlay" />
        <span className="creation-card-arrow" aria-hidden="true">↗</span>

        {tags.length > 0 && (
          <div className="creation-card-tags" aria-label="Tags">
            {tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}
      </div>

      <div className="creation-card-info">
        <h3>{creation.name}</h3>
        <p>{creation.category}</p>
      </div>
    </Link>
  );
}
