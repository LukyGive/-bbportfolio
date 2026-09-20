import type { Creation } from '@/lib/creations/types';
import { CreationGallery } from './CreationGallery';

export function FeaturedGrid({ creations }: { creations: Creation[] }) {
  return <CreationGallery creations={creations} priorityCount={3} />;
}
