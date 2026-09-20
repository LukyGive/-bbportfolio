import { describe, expect, it } from 'vitest';
import { removeObjectGroups, safeBbmodelFilename, validateBbmodelFile, validateImageFile } from '@/lib/admin/files';

describe('private source validation', () => {
  it('accepts uppercase bbmodel extension even with a generic MIME type', () => {
    const file = { name: 'Vorakh.BBMODEL', type: 'application/octet-stream', size: 1024 } as File;
    expect(() => validateBbmodelFile(file)).not.toThrow();
  });

  it('rejects misleading extensions', () => {
    const file = { name: 'vorakh.bbmodel.exe', type: 'application/octet-stream', size: 1024 } as File;
    expect(() => validateBbmodelFile(file)).toThrow(/bbmodel/i);
  });

  it('sanitizes path traversal out of source filenames', () => {
    expect(safeBbmodelFilename('../My Boss.bbmodel')).toBe('My-Boss.bbmodel');
  });

  it('rejects a source above 50 MB', () => {
    const file = { name: 'huge.bbmodel', type: '', size: 50 * 1024 * 1024 + 1 } as File;
    expect(() => validateBbmodelFile(file)).toThrow(/50 MB/i);
  });

  it('only accepts supported web image MIME types and 10 MB maximum', () => {
    expect(() => validateImageFile({ name: 'render.webp', type: 'image/webp', size: 5 } as File)).not.toThrow();
    expect(() => validateImageFile({ name: 'render.gif', type: 'image/gif', size: 5 } as File)).toThrow(/image/i);
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
