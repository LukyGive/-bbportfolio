export type GalleryMoveDirection = 'up' | 'down';

export function moveGalleryItem(ids: string[], targetId: string, direction: GalleryMoveDirection): string[] {
  const index = ids.indexOf(targetId);
  if (index < 0) return [...ids];
  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= ids.length) return [...ids];
  const next = [...ids];
  [next[index], next[neighborIndex]] = [next[neighborIndex], next[index]];
  return next;
}
