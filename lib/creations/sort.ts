import type { Creation } from './types';

export function sortNewestFirst(rows: Creation[]): Creation[] {
  return [...rows].sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt);
    return byDate || a.name.localeCompare(b.name);
  });
}

export function sortFeaturedCreations(rows: Creation[]): Creation[] {
  return [...rows]
    .filter((row) => row.published && row.featured)
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.featuredOrder) ? a.featuredOrder! : Number.POSITIVE_INFINITY;
      const bOrder = Number.isFinite(b.featuredOrder) ? b.featuredOrder! : Number.POSITIVE_INFINITY;
      const byOrder = aOrder - bOrder;
      if (byOrder !== 0) return byOrder;
      const byDate = b.createdAt.localeCompare(a.createdAt);
      return byDate || a.name.localeCompare(b.name);
    });
}
