import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreationEditor } from '@/components/admin/CreationEditor';

const directUpload = vi.hoisted(() => ({
  authorizeUploads: vi.fn(),
  uploadAuthorizedFile: vi.fn(),
  cleanupAuthorizedUploads: vi.fn().mockResolvedValue([]),
  toUploadedAssetRef: vi.fn((descriptor) => {
    const { token: _token, cacheControl: _cacheControl, ...ref } = descriptor;
    return ref;
  }),
}));
const viewerExtract = vi.hoisted(() => ({ extractBbmodelPreview: vi.fn() }));

vi.mock('@/lib/admin/direct-upload', () => directUpload);
vi.mock('@/lib/viewer-v2/extract', () => viewerExtract);

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
  directUpload.cleanupAuthorizedUploads.mockResolvedValue([]);
});

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';

function authorized(kind: 'render' | 'bbmodel' | 'viewer', clientKey: string, filename: string, size: number) {
  const ext = kind === 'render' ? 'png' : kind === 'bbmodel' ? 'bbmodel' : filename.toLowerCase().endsWith('.bbpreview') ? 'bbpreview' : 'glb';
  const bucket = kind === 'render' ? 'portfolio-renders' : kind === 'bbmodel' ? 'bbmodels' : 'viewer-models';
  return {
    clientKey, kind, filename, size,
    contentType: kind === 'render' ? 'image/png' : kind === 'viewer' ? (ext === 'bbpreview' ? 'application/json' : 'model/gltf-binary') : 'application/octet-stream',
    bucket,
    path: `uploads/${userId}/${sessionId}/33333333-3333-4333-8333-333333333333.${ext}`,
    token: `${kind}-token`,
  };
}

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^name/i), 'Vorakh');
  await userEvent.type(screen.getByLabelText(/^category/i), 'Boss');
}

describe('CreationEditor', () => {
  it('requires name and category', async () => {
    render(<CreationEditor categories={['Boss']} />);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));
    expect(screen.getByLabelText(/name/i)).toBeInvalid();
    expect(screen.getByLabelText(/category/i)).toBeInvalid();
  });

  it('auto-suggests slug until the slug is manually edited', async () => {
    render(<CreationEditor categories={['Boss']} />);
    const name = screen.getByLabelText(/^name/i);
    const slug = screen.getByLabelText(/^slug/i);
    await userEvent.type(name, 'Ice Guardian');
    expect(slug).toHaveValue('ice-guardian');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'custom-slug');
    await userEvent.clear(name);
    await userEvent.type(name, 'Other Name');
    expect(slug).toHaveValue('custom-slug');
  });

  it('uploads render binaries before sending a small JSON creation body', async () => {
    const renderFile = new File(['PNG_BINARY_SENTINEL'], 'front.png', { type: 'image/png' });
    const descriptor = authorized('render', 'render:0', renderFile.name, renderFile.size);
    directUpload.authorizeUploads.mockResolvedValue({ sessionId, uploads: [descriptor] });
    directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as typeof fetch;

    render(<CreationEditor categories={['Boss']} />);
    await fillRequired();
    await userEvent.upload(screen.getByLabelText(/add render images/i), renderFile);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/creations', expect.anything()));
    expect(directUpload.uploadAuthorizedFile).toHaveBeenCalledWith(descriptor, renderFile, expect.any(Object));

    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toEqual(expect.any(String));
    expect(init.body).not.toContain('PNG_BINARY_SENTINEL');
  });

  it('does not delete uploaded assets after finalization has started and the response is lost', async () => {
    const renderFile = new File(['png'], 'front.png', { type: 'image/png' });
    const descriptor = authorized('render', 'render:0', renderFile.name, renderFile.size);
    directUpload.authorizeUploads.mockResolvedValue({ sessionId, uploads: [descriptor] });
    directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network response lost')) as typeof fetch;

    render(<CreationEditor categories={['Boss']} />);
    await fillRequired();
    await userEvent.upload(screen.getByLabelText(/add render images/i), renderFile);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/network response lost/i));
    expect(directUpload.cleanupAuthorizedUploads).not.toHaveBeenCalled();
  });

  it('cleans only successful uploads when a later upload fails', async () => {
    const source = new File(['{}'], 'Vorakh.bbmodel', { type: 'application/octet-stream' });
    const viewerFile = new File(['{}'], 'preview.bbpreview', { type: 'application/json' });
    const sourceDescriptor = authorized('bbmodel', 'bbmodel', source.name, source.size);
    const viewerDescriptor = authorized('viewer', 'viewer', viewerFile.name, viewerFile.size);
    viewerExtract.extractBbmodelPreview.mockResolvedValue({ file: viewerFile, animationNames: [], diagnostics: { meshes: 1, vertices: 24, triangles: 12, textures: 1, nodes: 1, animations: 0 } });
    directUpload.authorizeUploads.mockResolvedValue({ sessionId, uploads: [sourceDescriptor, viewerDescriptor] });
    directUpload.uploadAuthorizedFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('viewer network failed'));
    global.fetch = vi.fn() as typeof fetch;

    render(<CreationEditor categories={['Boss']} />);
    await fillRequired();
    await userEvent.upload(screen.getByLabelText(/add \.bbmodel/i), source);
    await userEvent.click(screen.getByRole('button', { name: /save creation/i }));

    await waitFor(() => expect(directUpload.cleanupAuthorizedUploads).toHaveBeenCalledTimes(1));
    expect(viewerExtract.extractBbmodelPreview).toHaveBeenCalledWith(source);
    expect(directUpload.authorizeUploads).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ kind: 'viewer', filename: 'preview.bbpreview', contentType: 'application/json' }),
    ]));
    expect(directUpload.cleanupAuthorizedUploads).toHaveBeenCalledWith([
      expect.objectContaining({ clientKey: 'bbmodel', path: sourceDescriptor.path }),
    ]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/viewer upload failed/i);
  });
});
