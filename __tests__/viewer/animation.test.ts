import { describe, expect, it } from 'vitest';
import {
  displayAnimationName,
  normalizeViewerAnimationNames,
  pickDefaultAnimation,
} from '@/lib/viewer/animation';

describe('viewer animation helpers', () => {
  it('prefers idle regardless of prefix or casing', () => {
    expect(pickDefaultAnimation(['animation.walk', 'Animation.Idle', 'attack']))
      .toBe('Animation.Idle');
  });

  it('falls back to the first clip when idle is absent', () => {
    expect(pickDefaultAnimation(['walk', 'attack'])).toBe('walk');
  });

  it('returns undefined when there are no clips', () => {
    expect(pickDefaultAnimation([])).toBeUndefined();
  });

  it('creates compact human-readable labels', () => {
    expect(displayAnimationName('animation.heavy_slam')).toBe('Heavy Slam');
    expect(displayAnimationName('walk-cycle')).toBe('Walk Cycle');
  });

  it('deduplicates names without changing authored casing/order', () => {
    expect(normalizeViewerAnimationNames(['Idle', 'Walk', 'Idle', '', 'Walk']))
      .toEqual(['Idle', 'Walk']);
  });
});
