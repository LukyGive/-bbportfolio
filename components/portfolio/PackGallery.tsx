import type { Pack } from '@/lib/packs/types';
import { PackCard } from './PackCard';

type Props = {
  packs: Pack[];
  priorityCount?: number;
};

export function PackGallery({ packs, priorityCount = 0 }: Props) {
  if (packs.length === 0) {
    return (
      <div className="empty-state">
        <p>No packs published yet.</p>
        <span>New collections will appear here when they are ready.</span>
      </div>
    );
  }

  return (
    <div className="pack-grid">
      {packs.map((pack, index) => (
        <PackCard key={pack.id} pack={pack} priority={index < priorityCount} />
      ))}
    </div>
  );
}
