import type { Creation } from '@/lib/creations/types';
import { CreationCard } from './CreationCard';

type CreationGalleryProps = {
  creations: Creation[];
  priorityCount?: number;
};

export function CreationGallery({ creations, priorityCount = 0 }: CreationGalleryProps) {
  if (creations.length === 0) {
    return <div className="empty-state"><p>No creations found.</p><span>Try another filter or check back when new work is published.</span></div>;
  }

  return (
    <div className="creation-grid">
      {creations.map((creation, index) => (
        <CreationCard key={creation.id} creation={creation} priority={index < priorityCount} />
      ))}
    </div>
  );
}
