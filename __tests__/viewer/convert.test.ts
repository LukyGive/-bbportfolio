import { describe, expect, it, vi } from 'vitest';
import { convertBbmodelToViewer } from '@/lib/viewer/convert';

describe('convertBbmodelToViewer', () => {
  it('exports a binary glb and keeps authored animation names', async () => {
    const dispose = vi.fn();
    const result = await convertBbmodelToViewer(
      new File(['{"meta":{}}'], 'boss.bbmodel', { type: 'application/json' }),
      {
        parse: vi.fn().mockResolvedValue({
          scene: { name: 'scene' },
          animations: [{ name: 'animation.idle' }, { name: 'attack' }],
          warnings: [{ message: 'Example warning' }],
          dispose,
        }),
        exportBinary: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
      },
    );

    expect(result.file.name).toBe('model.glb');
    expect(result.file.type).toBe('model/gltf-binary');
    expect(result.animationNames).toEqual(['animation.idle', 'attack']);
    expect(result.warnings).toEqual(['Example warning']);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects malformed json before parsing', async () => {
    const parse = vi.fn();
    await expect(convertBbmodelToViewer(new File(['{'], 'broken.bbmodel'), {
      parse,
      exportBinary: vi.fn(),
    })).rejects.toThrow(/json/i);
    expect(parse).not.toHaveBeenCalled();
  });

  it('always disposes the parsed model if GLB export fails', async () => {
    const dispose = vi.fn();
    await expect(convertBbmodelToViewer(
      new File(['{}'], 'broken.bbmodel'),
      {
        parse: vi.fn().mockResolvedValue({ scene: {}, animations: [], warnings: [], dispose }),
        exportBinary: vi.fn().mockRejectedValue(new Error('export failed')),
      },
    )).rejects.toThrow('export failed');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('rejects an oversized generated GLB', async () => {
    const dispose = vi.fn();
    const tooLarge = new ArrayBuffer(50 * 1024 * 1024 + 1);
    await expect(convertBbmodelToViewer(
      new File(['{}'], 'huge.bbmodel'),
      {
        parse: vi.fn().mockResolvedValue({ scene: {}, animations: [], warnings: [], dispose }),
        exportBinary: vi.fn().mockResolvedValue(tooLarge),
      },
    )).rejects.toThrow(/50 MB/i);
    expect(dispose).toHaveBeenCalledOnce();
  });
});
