import { describe, expect, it } from 'vitest';
import { validateViewerFile, viewerObjectPath } from '@/lib/admin/files';

describe('viewer storage contract', () => {
  it('uses a server-controlled UUID path and .glb extension', () => {
    const path = viewerObjectPath('7c00c69f-5b12-4eed-b981-e969221a1fd2');
    expect(path).toMatch(/^7c00c69f-5b12-4eed-b981-e969221a1fd2\/[0-9a-f-]+\.glb$/i);
  });

  it('rejects non-glb viewer uploads', () => {
    expect(() => validateViewerFile(new File(['x'], 'model.exe', { type: 'application/octet-stream' }))).toThrow(/glb/i);
  });

  it('rejects empty viewer uploads', () => {
    expect(() => validateViewerFile(new File([], 'model.glb', { type: 'model/gltf-binary' }))).toThrow(/empty/i);
  });
});
