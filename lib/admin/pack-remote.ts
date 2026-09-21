import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mapAdminPack, type PackRowWithCreations } from '@/lib/packs/mapper';
import type { AdminPack, PackInput } from '@/lib/packs/types';
import { ADMIN_PACK_SELECT } from './pack-query';
import type { PackUploads, UploadedAssetRef } from './upload-contracts';
import {
  cleanupUploadedRefs,
  removeObjects,
  verifyUploadedObject,
  type StorageClientLike,
} from './files';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Client = SupabaseClient<Database>;

type MutationResult = {
  pack?: AdminPack;
  cleanupWarning?: string;
};

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePackInput(input: PackInput) {
  const name = input.name.trim();
  if (!name) throw new Error('Name is required.');
  const slug = input.slug?.trim() || slugify(name);
  if (!SAFE_SLUG.test(slug)) throw new Error('Slug is unsafe or invalid.');
  return {
    slug,
    name,
    description: input.description.trim(),
    published: input.published !== false,
  };
}

function dbError(prefix: string, error: { message: string; code?: string } | null): Error {
  if (error?.code === '23505' || /duplicate|unique/i.test(error?.message ?? '')) {
    return new Error('A pack with this slug already exists.');
  }
  return new Error(`${prefix}: ${error?.message ?? 'Unknown database error.'}`);
}

async function loadAdminPack(client: Client, id: string): Promise<PackRowWithCreations> {
  const { data, error } = await client.from('packs').select(ADMIN_PACK_SELECT).eq('id', id).maybeSingle();
  if (error) throw dbError('Could not load pack', error);
  if (!data) throw new Error('Pack not found.');
  return data as unknown as PackRowWithCreations;
}

async function validateMemberIds(client: Client, orderedCreationIds: string[]): Promise<void> {
  if (orderedCreationIds.length === 0) return;
  const { data, error } = await client.from('creations').select('id').in('id', orderedCreationIds);
  if (error) throw dbError('Could not validate pack creations', error);
  const returned = new Set((data ?? []).map((row: { id: string }) => row.id));
  if (returned.size !== orderedCreationIds.length || orderedCreationIds.some((id) => !returned.has(id))) {
    throw new Error('One or more selected creations do not exist.');
  }
}

function newUploadRefs(uploads: PackUploads): UploadedAssetRef[] {
  return uploads.cover ? [uploads.cover] : [];
}

function orderedMemberIds(row: PackRowWithCreations): string[] {
  return [...(row.pack_creations ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.creation_id.localeCompare(b.creation_id))
    .map((member) => member.creation_id);
}

export async function createRemotePack(
  client: Client,
  userId: string,
  input: PackInput,
  uploads: PackUploads,
): Promise<MutationResult> {
  const storageClient = client as unknown as StorageClientLike;
  let createdId: string | undefined;
  let committed = false;
  let safeToCleanupNewCover = true;

  try {
    const normalized = normalizePackInput(input);
    await validateMemberIds(client, input.orderedCreationIds);
    if (uploads.cover) await verifyUploadedObject(storageClient, userId, uploads.cover);

    let insertResult;
    try {
      insertResult = await client
        .from('packs')
        .insert({ ...normalized, cover_image_path: uploads.cover?.path ?? null })
        .select('id')
        .single();
    } catch (insertFailure) {
      safeToCleanupNewCover = false;
      throw insertFailure;
    }
    const { data: inserted, error } = insertResult;
    if (error || !inserted) throw dbError('Could not create pack', error);
    createdId = inserted.id;

    let membershipResult;
    try {
      membershipResult = await client.rpc('replace_pack_creations', {
        target_pack_id: createdId,
        ordered_creation_ids: input.orderedCreationIds,
      });
    } catch (membershipFailure) {
      safeToCleanupNewCover = false;
      throw membershipFailure;
    }
    if (membershipResult.error) throw dbError('Could not save pack creations', membershipResult.error);
    committed = true;
  } catch (error) {
    if (createdId && !committed) {
      try {
        const { error: rollbackError } = await client.from('packs').delete().eq('id', createdId);
        if (rollbackError) safeToCleanupNewCover = false;
        else safeToCleanupNewCover = true;
      } catch {
        safeToCleanupNewCover = false;
      }
    }
    if (!committed && safeToCleanupNewCover) {
      await cleanupUploadedRefs(storageClient, userId, newUploadRefs(uploads)).catch(() => undefined);
    }
    throw error;
  }

  return { pack: mapAdminPack(await loadAdminPack(client, createdId!)) };
}

export async function updateRemotePack(
  client: Client,
  userId: string,
  id: string,
  input: PackInput,
  uploads: PackUploads,
  removeCover = false,
): Promise<MutationResult> {
  const storageClient = client as unknown as StorageClientLike;
  let current: PackRowWithCreations | undefined;
  let nextCoverPath: string | null | undefined;
  let dbCommitted = false;
  let safeToCleanupNewCover = true;

  try {
    current = await loadAdminPack(client, id);
    const normalized = normalizePackInput(input);
    nextCoverPath = uploads.cover
      ? uploads.cover.path
      : removeCover
        ? null
        : current.cover_image_path;
    await validateMemberIds(client, input.orderedCreationIds);
    if (uploads.cover) await verifyUploadedObject(storageClient, userId, uploads.cover);

    const nextUpdatedAt = new Date().toISOString();
    let updateResult;
    try {
      updateResult = await client.from('packs').update({
        ...normalized,
        cover_image_path: nextCoverPath,
        updated_at: nextUpdatedAt,
      }).eq('id', id);
    } catch (updateFailure) {
      safeToCleanupNewCover = false;
      throw updateFailure;
    }
    if (updateResult.error) throw dbError('Could not update pack', updateResult.error);

    let membershipFailure: Error | undefined;
    try {
      const membershipResult = await client.rpc('replace_pack_creations', {
        target_pack_id: id,
        ordered_creation_ids: input.orderedCreationIds,
      });
      if (membershipResult.error) membershipFailure = dbError('Could not save pack creations', membershipResult.error);
    } catch (caught) {
      membershipFailure = caught instanceof Error ? caught : new Error('Could not save pack creations.');
    }

    if (membershipFailure) {
      let memberRollbackMessage = '';
      try {
        const memberRollback = await client.rpc('replace_pack_creations', {
          target_pack_id: id,
          ordered_creation_ids: orderedMemberIds(current),
        });
        if (memberRollback.error) memberRollbackMessage = memberRollback.error.message;
      } catch (rollbackFailure) {
        memberRollbackMessage = rollbackFailure instanceof Error ? rollbackFailure.message : 'Membership rollback failed.';
      }

      try {
        const { error: rollbackError } = await client.from('packs').update({
          slug: current.slug,
          name: current.name,
          description: current.description,
          published: current.published,
          cover_image_path: current.cover_image_path,
          updated_at: current.updated_at,
        }).eq('id', id);
        if (rollbackError) {
          safeToCleanupNewCover = false;
          throw new Error(`Could not save pack creations and scalar rollback failed: ${rollbackError.message}`);
        }
      } catch (rollbackFailure) {
        safeToCleanupNewCover = false;
        throw rollbackFailure;
      }

      if (memberRollbackMessage) {
        throw new Error(`${membershipFailure.message} Membership rollback also failed: ${memberRollbackMessage}`);
      }
      throw membershipFailure;
    }

    dbCommitted = true;
  } catch (error) {
    if (!dbCommitted && safeToCleanupNewCover) {
      await cleanupUploadedRefs(storageClient, userId, newUploadRefs(uploads)).catch(() => undefined);
    }
    throw error;
  }

  const finalizedCurrent = current!;
  let cleanupWarning: string | undefined;
  if (finalizedCurrent.cover_image_path && finalizedCurrent.cover_image_path !== nextCoverPath && (uploads.cover || removeCover)) {
    try {
      await removeObjects(storageClient, 'portfolio-renders', [finalizedCurrent.cover_image_path]);
    } catch (error) {
      cleanupWarning = error instanceof Error ? error.message : 'Old pack cover cleanup failed.';
    }
  }

  return {
    pack: mapAdminPack(await loadAdminPack(client, id)),
    ...(cleanupWarning ? { cleanupWarning } : {}),
  };
}

export async function deleteRemotePack(client: Client, id: string): Promise<MutationResult> {
  const current = await loadAdminPack(client, id);
  const { error } = await client.from('packs').delete().eq('id', id);
  if (error) throw dbError('Could not delete pack', error);

  if (!current.cover_image_path) return {};
  try {
    await removeObjects(client as unknown as StorageClientLike, 'portfolio-renders', [current.cover_image_path]);
    return {};
  } catch (cleanupError) {
    return {
      cleanupWarning: cleanupError instanceof Error ? cleanupError.message : 'Pack cover cleanup failed.',
    };
  }
}
