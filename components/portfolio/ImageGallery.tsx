import Image from 'next/image';
import type { Creation } from '@/lib/creations/types';

export function ImageGallery({ creation }: { creation: Creation }) {
  const images = [creation.coverImage, ...creation.images].filter(
    (image, index, all) => image && all.indexOf(image) === index,
  );

  return (
    <div className="detail-gallery">
      {images.map((image, index) => (
        <div className={index === 0 ? 'detail-image detail-image-main' : 'detail-image'} key={image}>
          <Image
            src={image}
            alt={index === 0 ? `${creation.name} main render` : `${creation.name} render ${index + 1}`}
            fill
            priority={index === 0}
            sizes={index === 0 ? '(max-width: 800px) 100vw, 70vw' : '(max-width: 800px) 100vw, 50vw'}
          />
        </div>
      ))}
    </div>
  );
}
