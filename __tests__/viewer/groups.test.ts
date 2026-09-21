import { describe, expect, it } from 'vitest';
import { compactMaterialGroups } from '@/lib/viewer/groups';

describe('compactMaterialGroups', () => {
  it('collapses same-material face groups to a single material draw', () => {
    const result = compactMaterialGroups([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 6, materialIndex: 0 },
      { start: 12, count: 6, materialIndex: 0 },
    ]);

    expect(result).toEqual({ singleMaterialIndex: 0, groups: [] });
  });

  it('merges contiguous groups without crossing material boundaries', () => {
    const result = compactMaterialGroups([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 6, materialIndex: 0 },
      { start: 12, count: 6, materialIndex: 1 },
      { start: 18, count: 6, materialIndex: 1 },
      { start: 24, count: 6, materialIndex: 0 },
    ]);

    expect(result).toEqual({
      groups: [
        { start: 0, count: 12, materialIndex: 0 },
        { start: 12, count: 12, materialIndex: 1 },
        { start: 24, count: 6, materialIndex: 0 },
      ],
    });
  });
});
