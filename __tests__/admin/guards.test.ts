import { describe, expect, it } from 'vitest';
import { assertSafeSlug, isDevelopmentWriteEnabled } from '@/lib/admin/guards';
import { safeImageFilename } from '@/lib/utils/filenames';

describe('development write guard', () => {
  it('rejects writes when NODE_ENV is not development', () => {
    expect(isDevelopmentWriteEnabled('production')).toBe(false);
    expect(isDevelopmentWriteEnabled('test')).toBe(false);
    expect(isDevelopmentWriteEnabled('development')).toBe(true);
  });
});

describe('path guards', () => {
  it.each(['../x', 'a/b', '/abs', 'x..'])('rejects unsafe slug %s', (slug) => {
    expect(() => assertSafeSlug(slug)).toThrow(/slug/i);
  });

  it.each(['../a.webp', 'a/b.webp', '/tmp/a.webp', 'a..webp'])('rejects unsafe filename %s', (name) => {
    expect(() => safeImageFilename(name)).toThrow(/filename/i);
  });

  it('normalizes a safe image filename', () => {
    expect(safeImageFilename('Sakura Render 01.PNG')).toBe('sakura-render-01.png');
  });
});
