import Image from 'next/image';
import type { Creation } from '@/lib/creations/types';
import { ImageGallery } from './ImageGallery';
import { ModelViewer } from './ModelViewer';
import { ModelViewerV2 } from './ModelViewerV2';

export function CreationVisuals({ creation }: { creation: Creation }) {
  if (!creation.viewer) return <ImageGallery creation={creation} />;

  const galleryImages = creation.images.filter(
    (image, index, all) =>
      image &&
      image !== creation.coverImage &&
      all.indexOf(image) === index,
  );

  return (
    <div className="detail-gallery">
      {creation.viewer.format === 'bbpreview' ? (
        <ModelViewerV2
          modelUrl={creation.viewer.modelUrl}
          creationName={creation.name}
          fallbackImage={creation.coverImage}
        />
      ) : (
        <ModelViewer
          modelUrl={creation.viewer.modelUrl}
          creationName={creation.name}
          fallbackImage={creation.coverImage}
        />
      )}

      {galleryImages.map((image, index) => (
        <div className="detail-image" key={image}>
          <Image
            src={image}
            alt={`${creation.name} render ${index + 1}`}
            fill
            sizes="(max-width: 800px) 100vw, 50vw"
          />
        </div>
      ))}
    </div>
  );
}
