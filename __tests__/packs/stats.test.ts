import { expect, it } from 'vitest';
import {
  getMosaicCreations,
  getPackStats,
} from '@/lib/packs/stats';

it('counts only supplied visible creations and omits zero categories', () => {
  const creations = [
    { id: '1', category: 'Item' },
    { id: '2', category: 'Item' },
    { id: '3', category: 'Armor' },
  ] as never;

  expect(getPackStats(creations)).toEqual([
    { label: 'Models', count: 3 },
    { label: 'Item', count: 2 },
    { label: 'Armor', count: 1 },
  ]);
});

it('reports an empty public pack as zero models only', () => {
  expect(getPackStats([])).toEqual([
    { label: 'Models', count: 0 },
  ]);
});

it('limits mosaic members to the first four in pack order', () => {
  const creations = Array.from(
    { length: 6 },
    (_, index) => ({ id: String(index) }),
  ) as never;

  expect(
    getMosaicCreations(creations).map((item) => item.id),
  ).toEqual(['0', '1', '2', '3']);
});
