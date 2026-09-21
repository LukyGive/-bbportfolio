import type { Creation } from '@/lib/creations/types';
import type { PackStat } from './types';

export function getPackStats(creations: Creation[]): PackStat[] {
  const categories = new Map<string, number>();
  for (const creation of creations) {
    categories.set(creation.category, (categories.get(creation.category) ?? 0) + 1);
  }

  return [
    { label: 'Models', count: creations.length },
    ...[...categories.entries()].map(([label, count]) => ({ label, count })),
  ];
}

export function getMosaicCreations(creations: Creation[]): Creation[] {
  return creations.slice(0, 4);
}
