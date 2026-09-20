import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewerStatus } from '@/components/admin/ViewerStatus';

const directUpload = vi.hoisted(() => ({
  authorizeUploads: vi.fn(),
  uploadAuthorizedFile: vi.fn(),
  cleanupAuthorizedUploads: vi.fn().mockResolvedValue([]),
  toUploadedAssetRef: vi.fn((descriptor) => {
    const { token: _token, cacheControl: _cacheControl, ...ref } = descriptor;
    return ref;
  }),
}));
const viewerConvert = vi.hoisted(() => ({ convertBbmodelToViewer: vi.fn() }));

vi.mock('@/lib/admin/direct-upload', () => directUpload);
vi.mock('@/lib/viewer/convert', () => viewerConvert);

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
  directUpload.cleanupAuthorizedUploads.mockResolvedValue([]);
});

function viewerDescriptor(size: number) {
  return {
    clientKey: 'viewer', kind: 'viewer', filename: 'model.glb', size,
    contentType: 'model/gltf-binary', bucket: 'viewer-models',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.glb',
    token: 'signed-token',
  };
}

describe('ViewerStatus', () => {
  it('shows ready state and animation count', () => {
    render(<ViewerStatus creationId="abc" sourceFilename="model.bbmodel" status="ready" animationCount={4} onRegenerated={vi.fn()} />);
    expect(screen.getByText(/3D viewer generated/i)).toBeInTheDocument();
    expect(screen.getByText(/4 animations/i)).toBeInTheDocument();
  });

  it('shows conversion errors without exposing storage paths', () => {
    render(<ViewerStatus creationId="abc" sourceFilename="model.bbmodel" status="error" error="Unsupported Blockbench element" animationCount={0} />);
    expect(screen.getByText(/conversion failed/i)).toBeInTheDocument();
    expect(screen.getByText(/unsupported blockbench element/i)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/viewer-models\//i);
  });

  it('regenerates with direct viewer upload and JSON finalization', async () => {
    const sourceBlob = new Blob(['{}'], { type: 'application/json' });
    const viewerFile = new File(['glb'], 'model.glb', { type: 'model/gltf-binary' });
    const descriptor = viewerDescriptor(viewerFile.size);
    viewerConvert.convertBbmodelToViewer.mockResolvedValue({ file: viewerFile, animationNames: ['Idle'], warnings: [] });
    directUpload.authorizeUploads.mockResolvedValue({ sessionId: 'session', uploads: [descriptor] });
    directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => sourceBlob })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as typeof fetch;

    render(<ViewerStatus creationId="creation-id" sourceFilename="model.bbmodel" status="ready" animationCount={1} onRegenerated={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate viewer/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/bbmodel/creation-id');
    expect(directUpload.uploadAuthorizedFile).toHaveBeenCalledWith(descriptor, viewerFile, expect.any(Object));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/admin/viewer/creation-id');
    const init = fetchMock.mock.calls[1][1];
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body).toEqual(expect.any(String));
    expect(init.body).not.toBeInstanceOf(FormData);
  });

  it('does not delete a new viewer after finalization starts and the response is lost', async () => {
    const sourceBlob = new Blob(['{}'], { type: 'application/json' });
    const viewerFile = new File(['glb'], 'model.glb', { type: 'model/gltf-binary' });
    const descriptor = viewerDescriptor(viewerFile.size);
    viewerConvert.convertBbmodelToViewer.mockResolvedValue({ file: viewerFile, animationNames: [], warnings: [] });
    directUpload.authorizeUploads.mockResolvedValue({ sessionId: 'session', uploads: [descriptor] });
    directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: async () => sourceBlob })
      .mockRejectedValueOnce(new TypeError('network response lost'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }) as typeof fetch;

    render(<ViewerStatus creationId="creation-id" sourceFilename="model.bbmodel" status="ready" animationCount={0} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate viewer/i }));

    await waitFor(() => expect(screen.getByText(/network response lost/i)).toBeInTheDocument());
    expect(directUpload.cleanupAuthorizedUploads).not.toHaveBeenCalled();
  });
});
