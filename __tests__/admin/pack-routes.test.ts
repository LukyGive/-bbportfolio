import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  parsePackMutationBody: vi.fn(),
  createRemotePack: vi.fn(),
  updateRemotePack: vi.fn(),
  deleteRemotePack: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getAdminContext: mocks.getAdminContext }));
vi.mock('@/lib/admin/pack-payload', () => ({ parsePackMutationBody: mocks.parsePackMutationBody }));
vi.mock('@/lib/admin/pack-remote', () => ({
  createRemotePack: mocks.createRemotePack,
  updateRemotePack: mocks.updateRemotePack,
  deleteRemotePack: mocks.deleteRemotePack,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAdminContext.mockResolvedValue({ client: {}, userId: '11111111-1111-4111-8111-111111111111' });
  mocks.parsePackMutationBody.mockReturnValue({
    input: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: [] },
    uploads: {},
    removeCover: false,
  });
});

it('rejects signed-out pack mutations', async () => {
  mocks.getAdminContext.mockResolvedValue(null);
  const { POST } = await import('@/app/api/admin/packs/route');
  const response = await POST(new Request('http://localhost/api/admin/packs', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(401);
});

it('maps duplicate pack slugs to conflict', async () => {
  mocks.createRemotePack.mockRejectedValue(new Error('A pack with this slug already exists.'));
  const { POST } = await import('@/app/api/admin/packs/route');
  const response = await POST(new Request('http://localhost/api/admin/packs', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(409);
});

it('requires originalId for pack updates', async () => {
  const { PUT } = await import('@/app/api/admin/packs/route');
  const response = await PUT(new Request('http://localhost/api/admin/packs', { method: 'PUT', body: '{}' }));
  expect(response.status).toBe(400);
  expect(mocks.updateRemotePack).not.toHaveBeenCalled();
});

it('returns created pack data from the authenticated create flow', async () => {
  const pack = { id: '99999999-9999-4999-8999-999999999999', name: 'Pack' };
  mocks.createRemotePack.mockResolvedValue({ pack });
  const { POST } = await import('@/app/api/admin/packs/route');
  const response = await POST(new Request('http://localhost/api/admin/packs', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ pack });
});
