import { describe, expect, it } from 'vitest';
import { moveGalleryItem } from '@/lib/admin/gallery-order';

describe('moveGalleryItem', () => {
  it('moves an item one position up or down', () => {
    expect(moveGalleryItem(['a', 'b', 'c'], 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveGalleryItem(['a', 'b', 'c'], 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('keeps boundary items in place', () => {
    expect(moveGalleryItem(['a', 'b', 'c'], 'a', 'up')).toEqual(['a', 'b', 'c']);
    expect(moveGalleryItem(['a', 'b', 'c'], 'c', 'down')).toEqual(['a', 'b', 'c']);
  });
});
