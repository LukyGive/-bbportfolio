import { expect, it, vi } from 'vitest';
import { createRemotePack, deleteRemotePack, updateRemotePack } from '@/lib/admin/pack-remote';

const userId = '11111111-1111-4111-8111-111111111111';
const packId = '99999999-9999-4999-8999-999999999999';
const creationA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const creationB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function makePackClient(options: { existingIds?: string[]; coverPath?: string | null; rpcError?: string } = {}) {
  const existingIds = options.existingIds ?? [creationA, creationB];
  const row: Record<string, unknown> = {
    id: packId,
    slug: 'sakura-pack',
    name: 'Sakura Pack',
    description: '',
    cover_image_path: options.coverPath ?? null,
    published: true,
    created_at: '2026-09-21T00:00:00Z',
    updated_at: '2026-09-21T00:00:00Z',
    pack_creations: [],
  };
  const removed: string[] = [];
  const rpc = vi.fn(async (_name: string, args: { ordered_creation_ids: string[] }) => {
    if (options.rpcError) return { data: undefined, error: { message: options.rpcError } };
    row.pack_creations = args.ordered_creation_ids.map((id, index) => ({ pack_id: packId, creation_id: id, sort_order: index }));
    return { data: undefined, error: null };
  });
  const deletePack = vi.fn().mockResolvedValue({ error: null });

  const client = {
    rpc,
    storage: {
      from() {
        return {
          async remove(paths: string[]) { removed.push(...paths); return { data: null, error: null }; },
          async list(_folder: string, options: { search?: string }) {
            return { data: [{ name: options.search ?? '', metadata: { size: 10 } }], error: null };
          },
        };
      },
    },
    from(table: string) {
      if (table === 'creations') {
        return {
          select() {
            return {
              in: async (_column: string, ids: string[]) => ({
                data: ids.filter((id) => existingIds.includes(id)).map((id) => ({ id })),
                error: null,
              }),
            };
          },
        };
      }
      if (table !== 'packs') throw new Error(`Unexpected table ${table}`);
      return {
        insert(payload: Record<string, unknown>) {
          Object.assign(row, payload);
          return { select() { return { single: async () => ({ data: { id: packId }, error: null }) }; } };
        },
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: structuredClone(row), error: null }) }; } };
        },
        update(payload: Record<string, unknown>) {
          Object.assign(row, payload);
          return { eq: async () => ({ error: null }) };
        },
        delete() {
          return { eq: deletePack };
        },
      };
    },
  };

  return { client, rpc, row, removed, deletePack };
}

it('passes submitted member order to the atomic replacement rpc', async () => {
  const { client, rpc } = makePackClient();
  await createRemotePack(client as never, userId, {
    name: 'Sakura Pack', slug: 'sakura-pack', description: '', published: true,
    orderedCreationIds: [creationB, creationA],
  }, {});

  expect(rpc).toHaveBeenCalledWith('replace_pack_creations', {
    target_pack_id: packId,
    ordered_creation_ids: [creationB, creationA],
  });
});

it('rejects missing creation ids before replacing membership', async () => {
  const { client, rpc } = makePackClient({ existingIds: [creationA] });
  await expect(createRemotePack(client as never, userId, {
    name: 'Sakura Pack', slug: 'sakura-pack', description: '', published: true,
    orderedCreationIds: [creationA, creationB],
  }, {})).rejects.toThrow(/do not exist/i);
  expect(rpc).not.toHaveBeenCalled();
});

it('persists reordered membership on update and deletes only the pack row', async () => {
  const { client, rpc, deletePack } = makePackClient();
  await updateRemotePack(client as never, userId, packId, {
    name: 'Sakura Pack', slug: 'sakura-pack', description: 'Updated', published: true,
    orderedCreationIds: [creationA, creationB],
  }, {}, false);
  expect(rpc).toHaveBeenLastCalledWith('replace_pack_creations', {
    target_pack_id: packId,
    ordered_creation_ids: [creationA, creationB],
  });

  await deleteRemotePack(client as never, packId);
  expect(deletePack).toHaveBeenCalledWith('id', packId);
});


it('restores scalar fields and original member order after an ambiguous membership failure', async () => {
  const oldCover = 'old/pack-cover.webp';
  const newCover = {
    clientKey: 'pack-cover', kind: 'render' as const, bucket: 'portfolio-renders' as const,
    path: 'uploads/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png',
    filename: 'cover.png', size: 10, contentType: 'image/png',
  };
  const { client, row, removed, rpc } = makePackClient({ coverPath: oldCover });
  row.pack_creations = [
    { pack_id: packId, creation_id: creationA, sort_order: 0 },
    { pack_id: packId, creation_id: creationB, sort_order: 1 },
  ];

  rpc
    .mockImplementationOnce(async (_name: string, args: { ordered_creation_ids: string[] }) => {
      // Simulate a lost response after the server may already have committed the new order.
      row.pack_creations = args.ordered_creation_ids.map((id, index) => ({ pack_id: packId, creation_id: id, sort_order: index }));
      throw new Error('network response lost');
    })
    .mockImplementationOnce(async (_name: string, args: { ordered_creation_ids: string[] }) => {
      row.pack_creations = args.ordered_creation_ids.map((id, index) => ({ pack_id: packId, creation_id: id, sort_order: index }));
      return { data: undefined, error: null };
    });

  await expect(updateRemotePack(client as never, userId, packId, {
    name: 'Changed Pack', slug: 'changed-pack', description: 'Changed', published: false,
    orderedCreationIds: [creationB, creationA],
  }, { cover: newCover }, false)).rejects.toThrow(/network response lost/i);

  expect(row.name).toBe('Sakura Pack');
  expect(row.slug).toBe('sakura-pack');
  expect(row.description).toBe('');
  expect(row.published).toBe(true);
  expect(row.cover_image_path).toBe(oldCover);
  expect((row.pack_creations as Array<{ creation_id: string }>).map((member) => member.creation_id)).toEqual([creationA, creationB]);
  expect(rpc).toHaveBeenNthCalledWith(2, 'replace_pack_creations', {
    target_pack_id: packId,
    ordered_creation_ids: [creationA, creationB],
  });
  expect(removed).toContain(newCover.path);
  expect(removed).not.toContain(oldCover);
});
