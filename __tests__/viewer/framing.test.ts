import { describe, expect, it } from 'vitest';
import { cameraDistanceForRadius } from '@/lib/viewer/framing';

describe('cameraDistanceForRadius', () => {
  it('keeps a finite useful distance for tiny models', () => {
    expect(cameraDistanceForRadius(0.001, 45)).toBeGreaterThan(0.01);
  });

  it('increases distance with model radius', () => {
    expect(cameraDistanceForRadius(10, 45)).toBeGreaterThan(cameraDistanceForRadius(1, 45));
  });
});
