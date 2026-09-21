import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { PackEditor } from '@/components/admin/PackEditor';

const directUpload = vi.hoisted(() => ({
  authorizeUploads: vi.fn(),
  uploadAuthorizedFile: vi.fn(),
  cleanupAuthorizedUploads: vi.fn().mockResolvedValue([]),
  toUploadedAssetRef: vi.fn((descriptor) => {
    const { token: _token, cacheControl: _cacheControl, ...ref } = descriptor;
    return ref;
  }),
}));
vi.mock('@/lib/admin/direct-upload', () => directUpload);

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
  directUpload.cleanupAuthorizedUploads.mockResolvedValue([]);
});

const creationA = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Sakura Pickaxe', category: 'Item', tags: [], published: true };
const creationB = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Sakura Axe', category: 'Item', tags: [], published: true };

it('uploads one optional cover before sending reordered creation ids as json', async () => {
  const user = userEvent.setup();
  const cover = new File(['PNG_BINARY_SENTINEL'], 'cover.png', { type: 'image/png' });
  const descriptor = {
    clientKey: 'pack-cover', kind: 'render', filename: cover.name, size: cover.size, contentType: cover.type,
    bucket: 'portfolio-renders',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png',
    token: 'render-token',
  };
  directUpload.authorizeUploads.mockResolvedValue({ sessionId: 'session', uploads: [descriptor] });
  directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as typeof fetch;

  render(<PackEditor creations={[creationA, creationB] as never} />);
  await user.type(screen.getByLabelText(/^name/i), 'Sakura Pack');
  await user.click(screen.getByRole('button', { name: /add sakura pickaxe/i }));
  await user.click(screen.getByRole('button', { name: /add sakura axe/i }));
  await user.click(screen.getByRole('button', { name: /move sakura axe up/i }));
  await user.upload(screen.getByLabelText(/pack cover/i), cover);
  await user.click(screen.getByRole('button', { name: /save pack/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/admin/packs', expect.anything()));
  expect(directUpload.uploadAuthorizedFile).toHaveBeenCalledWith(descriptor, cover, expect.any(Object));
  const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
  const body = JSON.parse(init.body as string);
  expect(body.payload.orderedCreationIds).toEqual([creationB.id, creationA.id]);
  expect(body.uploads.cover).toMatchObject({ clientKey: 'pack-cover', bucket: 'portfolio-renders' });
  expect(init.body).not.toContain('PNG_BINARY_SENTINEL');
});

it('does not clean a newly uploaded cover once api finalization has started', async () => {
  const user = userEvent.setup();
  const cover = new File(['png'], 'cover.png', { type: 'image/png' });
  const descriptor = {
    clientKey: 'pack-cover', kind: 'render', filename: cover.name, size: cover.size, contentType: cover.type,
    bucket: 'portfolio-renders',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png',
    token: 'render-token',
  };
  directUpload.authorizeUploads.mockResolvedValue({ sessionId: 'session', uploads: [descriptor] });
  directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
  global.fetch = vi.fn().mockRejectedValue(new TypeError('response lost')) as typeof fetch;

  render(<PackEditor creations={[]} />);
  await user.type(screen.getByLabelText(/^name/i), 'Sakura Pack');
  await user.upload(screen.getByLabelText(/pack cover/i), cover);
  await user.click(screen.getByRole('button', { name: /save pack/i }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/response lost/i));
  expect(directUpload.cleanupAuthorizedUploads).not.toHaveBeenCalled();
});

it('cleans a new cover after a concrete validation response', async () => {
  const user = userEvent.setup();
  const cover = new File(['png'], 'cover.png', { type: 'image/png' });
  const descriptor = {
    clientKey: 'pack-cover', kind: 'render', filename: cover.name, size: cover.size, contentType: cover.type,
    bucket: 'portfolio-renders',
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png',
    token: 'render-token',
  };
  directUpload.authorizeUploads.mockResolvedValue({ sessionId: 'session', uploads: [descriptor] });
  directUpload.uploadAuthorizedFile.mockResolvedValue(undefined);
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Invalid pack.' }) }) as typeof fetch;

  render(<PackEditor creations={[]} />);
  await user.type(screen.getByLabelText(/^name/i), 'Sakura Pack');
  await user.upload(screen.getByLabelText(/pack cover/i), cover);
  await user.click(screen.getByRole('button', { name: /save pack/i }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid pack/i));
  expect(directUpload.cleanupAuthorizedUploads).toHaveBeenCalledWith([
    expect.objectContaining({ clientKey: 'pack-cover', bucket: 'portfolio-renders' }),
  ]);
});
