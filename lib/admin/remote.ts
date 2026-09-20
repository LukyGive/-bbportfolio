import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { AdminCreation, CreationInput } from '@/lib/creations/types';
import { mapAdminCreation, type CreationRowWithImages } from '@/lib/creations/mapper';
import { ADMIN_CREATION_SELECT } from './query';
import { normalizeCreationInput } from './creations';
import type { CreationUploads, UploadedAssetRef, UploadedViewerRef } from './upload-contracts';
import {
  cleanupUploadedRefs,
  removeObjectGroups,
  removeObjects,
  safeBbmodelFilename,
  verifyUploadedObject,
  verifyCreationUploads,
  type StorageClientLike,
} from './files';

type Client = SupabaseClient<Database>;

type MutationResult = {
  creation?: AdminCreation;
  cleanupWarning?: string;
};

function dbError(prefix: string, error: { message: string; code?: string } | null): Error {
  if (error?.code === '23505' || /duplicate|unique/i.test(error?.message ?? '')) {
    return new Error('A creation with this slug already exists.');
  }
  return new Error(`${prefix}: ${error?.message ?? 'Unknown database error.'}`);
}

async function loadAdminCreation(client: Client, id: string): Promise<CreationRowWithImages> {
  const { data, error } = await client.from('creations').select(ADMIN_CREATION_SELECT).eq('id', id).maybeSingle();
  if (error) throw dbError('Could not load creation', error);
  if (!data) throw new Error('Creation not found.');
  return data as unknown as CreationRowWithImages;
}

function uploadRefs(uploads: CreationUploads): UploadedAssetRef[] {
  return [
    ...uploads.renders,
    ...(uploads.bbmodel ? [uploads.bbmodel] : []),
    ...(uploads.viewer ? [uploads.viewer] : []),
  ];
}

async function cleanupStoredPaths(
  client: Client,
  renderPaths: string[],
  sourcePath?: string,
  viewerPath?: string,
): Promise<string[]> {
  return removeObjectGroups(client as unknown as StorageClientLike, [
    { bucket: 'portfolio-renders', paths: renderPaths },
    { bucket: 'bbmodels', paths: sourcePath ? [sourcePath] : [] },
    { bucket: 'viewer-models', paths: viewerPath ? [viewerPath] : [] },
  ]);
}

export async function createRemoteCreation(
  client: Client,
  userId: string,
  input: CreationInput,
  uploads: CreationUploads,
): Promise<MutationResult> {
  const storageClient = client as unknown as StorageClientLike;
  let id: string | undefined;

  try {
    const normalized = normalizeCreationInput(input);
    await verifyCreationUploads(storageClient, userId, uploads);

    const { data: inserted, error: insertError } = await client
      .from('creations')
      .insert(normalized)
      .select('id')
      .single();
    if (insertError || !inserted) throw dbError('Could not create creation', insertError);
    const createdId = inserted.id;
    id = createdId;

    if (uploads.renders.length > 0) {
      const galleryRows = uploads.renders.map((render, index) => ({
        creation_id: createdId,
        storage_path: render.path,
        alt_text: normalized.name,
        sort_order: index,
      }));
      const { error } = await client.from('creation_images').insert(galleryRows);
      if (error) throw dbError('Could not save gallery', error);
    }

    const now = new Date().toISOString();
    const attachmentUpdate: Database['public']['Tables']['creations']['Update'] = {
      cover_image_path: uploads.renders[0]?.path ?? null,
      ...(uploads.bbmodel ? {
        bbmodel_path: uploads.bbmodel.path,
        bbmodel_filename: safeBbmodelFilename(uploads.bbmodel.filename),
        bbmodel_size: uploads.bbmodel.size,
      } : {}),
      ...(uploads.viewer ? {
        viewer_model_path: uploads.viewer.path,
        viewer_status: 'ready',
        viewer_error: null,
        viewer_updated_at: now,
        viewer_animation_names: uploads.viewer.animationNames,
      } : {}),
      updated_at: now,
    };
    const { error: updateError } = await client.from('creations').update(attachmentUpdate).eq('id', createdId);
    if (updateError) throw dbError('Could not attach uploaded files', updateError);

    return { creation: mapAdminCreation(await loadAdminCreation(client, createdId)) };
  } catch (error) {
    if (id) {
      try { await client.from('creations').delete().eq('id', id); } catch { /* best-effort rollback */ }
    }
    await cleanupUploadedRefs(storageClient, userId, uploadRefs(uploads)).catch(() => undefined);
    throw error;
  }
}

export async function updateRemoteCreation(
  client: Client,
  userId: string,
  id: string,
  input: CreationInput,
  uploads: CreationUploads,
  replaceCover = false,
): Promise<MutationResult> {
  const storageClient = client as unknown as StorageClientLike;
  let insertedImageIds: string[] = [];
  let current: CreationRowWithImages | undefined;

  try {
    current = await loadAdminCreation(client, id);
    const normalized = normalizeCreationInput({ ...input, createdAt: input.createdAt ?? current.created_at });
    await verifyCreationUploads(storageClient, userId, uploads);

    if (uploads.renders.length > 0) {
      const baseOrder = Math.max(-1, ...(current.creation_images ?? []).map((image) => image.sort_order)) + 1;
      const rows = uploads.renders.map((render, index) => ({
        creation_id: id,
        storage_path: render.path,
        alt_text: normalized.name,
        sort_order: baseOrder + index,
      }));
      const { data, error } = await client.from('creation_images').insert(rows).select('id');
      if (error) throw dbError('Could not save gallery', error);
      insertedImageIds = (data ?? []).map((row) => row.id);
    }

    const now = new Date().toISOString();
    const update: Database['public']['Tables']['creations']['Update'] = {
      ...normalized,
      cover_image_path: replaceCover && uploads.renders[0]
        ? uploads.renders[0].path
        : current.cover_image_path ?? uploads.renders[0]?.path ?? null,
      updated_at: now,
      ...(uploads.bbmodel ? {
        bbmodel_path: uploads.bbmodel.path,
        bbmodel_filename: safeBbmodelFilename(uploads.bbmodel.filename),
        bbmodel_size: uploads.bbmodel.size,
      } : {}),
      ...(uploads.viewer ? {
        viewer_model_path: uploads.viewer.path,
        viewer_status: 'ready',
        viewer_error: null,
        viewer_updated_at: now,
        viewer_animation_names: uploads.viewer.animationNames,
      } : {}),
    };
    const { error: updateError } = await client.from('creations').update(update).eq('id', id);
    if (updateError) throw dbError('Could not update creation', updateError);
  } catch (error) {
    if (insertedImageIds.length) {
      try { await client.from('creation_images').delete().in('id', insertedImageIds); } catch { /* best-effort rollback */ }
    }
    await cleanupUploadedRefs(storageClient, userId, uploadRefs(uploads)).catch(() => undefined);
    throw error;
  }

  const cleanupWarnings: string[] = [];
  if (uploads.bbmodel && current?.bbmodel_path && current.bbmodel_path !== uploads.bbmodel.path) {
    try {
      await removeObjects(storageClient, 'bbmodels', [current.bbmodel_path]);
    } catch (error) {
      cleanupWarnings.push(error instanceof Error ? error.message : 'Old .bbmodel cleanup failed.');
    }
  }
  if (uploads.viewer && current?.viewer_model_path && current.viewer_model_path !== uploads.viewer.path) {
    try {
      await removeObjects(storageClient, 'viewer-models', [current.viewer_model_path]);
    } catch (error) {
      cleanupWarnings.push(error instanceof Error ? error.message : 'Old viewer cleanup failed.');
    }
  }

  return {
    creation: mapAdminCreation(await loadAdminCreation(client, id)),
    ...(cleanupWarnings.length ? { cleanupWarning: cleanupWarnings.join(' ') } : {}),
  };
}

export async function deleteRemoteCreation(client: Client, id: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  const renderPaths = [current.cover_image_path, ...(current.creation_images ?? []).map((image) => image.storage_path)]
    .filter((path): path is string => Boolean(path));

  const { error } = await client.from('creations').delete().eq('id', id);
  if (error) throw dbError('Could not delete creation', error);

  const cleanupFailures = await cleanupStoredPaths(
    client,
    renderPaths,
    current.bbmodel_path ?? undefined,
    current.viewer_model_path ?? undefined,
  );
  return cleanupFailures.length > 0 ? { cleanupWarning: cleanupFailures.join(' ') } : {};
}

export async function removeRemoteBbmodel(client: Client, id: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  if (!current.bbmodel_path && !current.viewer_model_path) return { creation: mapAdminCreation(current) };

  const { error } = await client.from('creations').update({
    bbmodel_path: null,
    bbmodel_filename: null,
    bbmodel_size: null,
    viewer_model_path: null,
    viewer_status: 'none',
    viewer_error: null,
    viewer_updated_at: null,
    viewer_animation_names: [],
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw dbError('Could not detach .bbmodel', error);

  const failures = await removeObjectGroups(client as unknown as StorageClientLike, [
    { bucket: 'bbmodels', paths: current.bbmodel_path ? [current.bbmodel_path] : [] },
    { bucket: 'viewer-models', paths: current.viewer_model_path ? [current.viewer_model_path] : [] },
  ]);

  return {
    creation: mapAdminCreation(await loadAdminCreation(client, id)),
    ...(failures.length ? { cleanupWarning: failures.join(' ') } : {}),
  };
}

export async function replaceRemoteViewer(
  client: Client,
  userId: string,
  id: string,
  viewer: UploadedViewerRef & { animationNames: string[] },
): Promise<MutationResult> {
  const storageClient = client as unknown as StorageClientLike;
  let current: CreationRowWithImages | undefined;

  try {
    current = await loadAdminCreation(client, id);
    if (!current.bbmodel_path) throw new Error('No .bbmodel attached.');
    await verifyUploadedObject(storageClient, userId, viewer);

    const now = new Date().toISOString();
    const { error } = await client.from('creations').update({
      viewer_model_path: viewer.path,
      viewer_status: 'ready',
      viewer_error: null,
      viewer_updated_at: now,
      viewer_animation_names: viewer.animationNames,
      updated_at: now,
    }).eq('id', id);
    if (error) throw dbError('Could not update viewer', error);
  } catch (error) {
    await cleanupUploadedRefs(storageClient, userId, [viewer]).catch(() => undefined);
    throw error;
  }

  let cleanupWarning: string | undefined;
  if (current?.viewer_model_path && current.viewer_model_path !== viewer.path) {
    try {
      await removeObjects(storageClient, 'viewer-models', [current.viewer_model_path]);
    } catch (cleanupError) {
      cleanupWarning = cleanupError instanceof Error ? cleanupError.message : 'Old viewer cleanup failed.';
    }
  }

  return {
    creation: mapAdminCreation(await loadAdminCreation(client, id)),
    ...(cleanupWarning ? { cleanupWarning } : {}),
  };
}

export async function recordViewerError(client: Client, id: string, message: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  const now = new Date().toISOString();
  const hasWorkingViewer = Boolean(current.viewer_model_path && current.viewer_status === 'ready');

  const { error } = await client.from('creations').update({
    viewer_status: hasWorkingViewer ? 'ready' : 'error',
    viewer_error: message.trim().slice(0, 500),
    viewer_updated_at: now,
    updated_at: now,
  }).eq('id', id);
  if (error) throw dbError('Could not record viewer error', error);

  return { creation: mapAdminCreation(await loadAdminCreation(client, id)) };
}

export async function getPrivateBbmodelSignedDownload(
  client: Client,
  id: string,
): Promise<{ url: string; filename: string }> {
  const current = await loadAdminCreation(client, id);
  if (!current.bbmodel_path || !current.bbmodel_filename) throw new Error('No .bbmodel attached.');

  const storage = (client as unknown as StorageClientLike).storage.from('bbmodels');
  if (!storage.createSignedUrl) throw new Error('Storage client cannot sign .bbmodel downloads.');
  const { data, error } = await storage.createSignedUrl(current.bbmodel_path, 60, {
    download: current.bbmodel_filename,
  });
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not sign .bbmodel download.');
  return { url: data.signedUrl, filename: current.bbmodel_filename };
}
