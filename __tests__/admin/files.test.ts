import { describe, expect, it } from 'vitest';
import { removeObjectGroups, safeBbmodelFilename, validateBbmodelFile, validateImageFile } from '@/lib/admin/files';

describe('private source validation', () => {
  it('accepts uppercase bbmodel extension even with a generic MIME type', () => {
    const file = { name: 'Vorakh.BBMODEL', type: 'application/octet-stream', size: 1024 } as File;
    expect(() => validateBbmodelFile(file)).not.toThrow();
  });

  it('rejects misleading extensions and oversized sources', () => {
    expect(() => validateBbmodelFile({ name: 'vorakh.bbmodel.exe', size: 1024 } as File)).toThrow(/bbmodel/i);
    expect(() => validateBbmodelFile({ name: 'huge.bbmodel', size: 50 * 1024 * 1024 + 1 } as File)).toThrow(/50 MB/i);
  });

  it('sanitizes path traversal out of source filenames', () => {
    expect(safeBbmodelFilename('../My Boss.bbmodel')).toBe('My-Boss.bbmodel');
  });

  it('only accepts supported web image MIME types and the 10 MB maximum', () => {
    expect(() => validateImageFile({ name: 'render.webp', type: 'image/webp', size: 5 } as File)).not.toThrow();
    expect(() => validateImageFile({ name: 'render.gif', type: 'image/gif', size: 5 } as File)).toThrow(/image/i);
    expect(() => validateImageFile({ name: 'render.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 } as File)).toThrow(/10 MB/i);
  });

  it('reports storage cleanup failures instead of swallowing them', async () => {
    const client = {
      storage: {
        from(bucket: string) {
          return {
            async remove() {
              return bucket === 'bbmodels'
                ? { data: null, error: { message: 'private cleanup failed' } }
                : { data: null, error: null };
            },
          };
        },
      },
    };

    const failures = await removeObjectGroups(client as never, [
      { bucket: 'portfolio-renders', paths: ['a.webp'] },
      { bucket: 'bbmodels', paths: ['secret.bbmodel'] },
    ]);
    expect(failures).toEqual(['private cleanup failed']);
  });
});
