import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { AdminCreation, CreationInput } from '@/lib/creations/types';
import { mapAdminCreation, type CreationRowWithImages } from '@/lib/creations/mapper';
import { ADMIN_CREATION_SELECT } from './query';
import { normalizeCreationInput } from './creations';
import {
  removeObjectGroups,
  removeObjects,
  safeBbmodelFilename,
  uploadBbmodel,
  uploadRender,
  uploadViewerModel,
  validateBbmodelFile,
  validateImageFile,
  validateViewerFile,
  type StorageClientLike,
} from './files';

type Client = SupabaseClient<Database>;

export type ViewerUpload = {
  file: File;
  animationNames: string[];
};

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

async function cleanupNewUploads(
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
  input: CreationInput,
  images: File[],
  bbmodel?: File,
  viewer?: ViewerUpload,
): Promise<MutationResult> {
  const normalized = normalizeCreationInput(input);
  images.forEach(validateImageFile);
  if (bbmodel) validateBbmodelFile(bbmodel);
  if (viewer) validateViewerFile(viewer.file);
  if (bbmodel && !viewer) throw new Error('A generated viewer GLB is required with a .bbmodel source.');

  const { data: inserted, error: insertError } = await client.from('creations').insert(normalized).select('id').single();
  if (insertError || !inserted) throw dbError('Could not create creation', insertError);

  const id = inserted.id;
  const storageClient = client as unknown as StorageClientLike;
  const uploadedRenders: string[] = [];
  let uploadedSource: string | undefined;
  let uploadedViewer: string | undefined;

  try {
    for (const image of images) {
      uploadedRenders.push(await uploadRender(storageClient, id, image, uploadedRenders.length === 0 ? 'cover' : 'gallery'));
    }
    if (bbmodel) uploadedSource = await uploadBbmodel(storageClient, id, bbmodel);
    if (viewer) uploadedViewer = await uploadViewerModel(storageClient, id, viewer.file);

    if (uploadedRenders.length > 0) {
      const galleryRows = uploadedRenders.map((storagePath, index) => ({
        creation_id: id,
        storage_path: storagePath,
        alt_text: normalized.name,
        sort_order: index,
      }));
      const { error } = await client.from('creation_images').insert(galleryRows);
      if (error) throw dbError('Could not save gallery', error);
    }

    const now = new Date().toISOString();
    const attachmentUpdate: Database['public']['Tables']['creations']['Update'] = {
      cover_image_path: uploadedRenders[0] ?? null,
      ...(bbmodel && uploadedSource ? {
        bbmodel_path: uploadedSource,
        bbmodel_filename: safeBbmodelFilename(bbmodel.name),
        bbmodel_size: bbmodel.size,
      } : {}),
      ...(viewer && uploadedViewer ? {
        viewer_model_path: uploadedViewer,
        viewer_status: 'ready',
        viewer_error: null,
        viewer_updated_at: now,
        viewer_animation_names: viewer.animationNames,
      } : {}),
      updated_at: now,
    };
    const { error: updateError } = await client.from('creations').update(attachmentUpdate).eq('id', id);
    if (updateError) throw dbError('Could not attach uploaded files', updateError);

    return { creation: mapAdminCreation(await loadAdminCreation(client, id)) };
  } catch (error) {
    await cleanupNewUploads(client, uploadedRenders, uploadedSource, uploadedViewer);
    await client.from('creations').delete().eq('id', id);
    throw error;
  }
}

export async function updateRemoteCreation(
  client: Client,
  id: string,
  input: CreationInput,
  images: File[],
  bbmodel?: File,
  viewer?: ViewerUpload,
  replaceCover = false,
): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  const normalized = normalizeCreationInput({ ...input, createdAt: input.createdAt ?? current.created_at });
  images.forEach(validateImageFile);
  if (bbmodel) validateBbmodelFile(bbmodel);
  if (viewer) validateViewerFile(viewer.file);
  if (bbmodel && !viewer) throw new Error('A generated viewer GLB is required with a .bbmodel source.');

  const storageClient = client as unknown as StorageClientLike;
  const uploadedRenders: string[] = [];
  let uploadedSource: string | undefined;
  let uploadedViewer: string | undefined;
  let insertedImageIds: string[] = [];

  try {
    for (const image of images) {
      uploadedRenders.push(await uploadRender(storageClient, id, image, current.cover_image_path || uploadedRenders.length > 0 ? 'gallery' : 'cover'));
    }
    if (bbmodel) uploadedSource = await uploadBbmodel(storageClient, id, bbmodel);
    if (viewer) uploadedViewer = await uploadViewerModel(storageClient, id, viewer.file);

    if (uploadedRenders.length > 0) {
      const baseOrder = Math.max(-1, ...(current.creation_images ?? []).map((image) => image.sort_order)) + 1;
      const rows = uploadedRenders.map((storagePath, index) => ({
        creation_id: id,
        storage_path: storagePath,
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
      cover_image_path: replaceCover && uploadedRenders[0]
        ? uploadedRenders[0]
        : current.cover_image_path ?? uploadedRenders[0] ?? null,
      updated_at: now,
      ...(bbmodel && uploadedSource ? {
        bbmodel_path: uploadedSource,
        bbmodel_filename: safeBbmodelFilename(bbmodel.name),
        bbmodel_size: bbmodel.size,
      } : {}),
      ...(viewer && uploadedViewer ? {
        viewer_model_path: uploadedViewer,
        viewer_status: 'ready',
        viewer_error: null,
        viewer_updated_at: now,
        viewer_animation_names: viewer.animationNames,
      } : {}),
    };
    const { error: updateError } = await client.from('creations').update(update).eq('id', id);
    if (updateError) throw dbError('Could not update creation', updateError);

    const cleanupWarnings: string[] = [];
    if (bbmodel && uploadedSource && current.bbmodel_path && current.bbmodel_path !== uploadedSource) {
      try { await removeObjects(storageClient, 'bbmodels', [current.bbmodel_path]); }
      catch (error) { cleanupWarnings.push(error instanceof Error ? error.message : 'Old .bbmodel cleanup failed.'); }
    }
    if (viewer && uploadedViewer && current.viewer_model_path && current.viewer_model_path !== uploadedViewer) {
      try { await removeObjects(storageClient, 'viewer-models', [current.viewer_model_path]); }
      catch (error) { cleanupWarnings.push(error instanceof Error ? error.message : 'Old viewer cleanup failed.'); }
    }

    return {
      creation: mapAdminCreation(await loadAdminCreation(client, id)),
      ...(cleanupWarnings.length ? { cleanupWarning: cleanupWarnings.join(' ') } : {}),
    };
  } catch (error) {
    if (insertedImageIds.length) await client.from('creation_images').delete().in('id', insertedImageIds);
    await cleanupNewUploads(client, uploadedRenders, uploadedSource, uploadedViewer);
    throw error;
  }
}

export async function replaceRemoteViewer(client: Client, id: string, viewer: ViewerUpload): Promise<MutationResult> {
  validateViewerFile(viewer.file);
  const current = await loadAdminCreation(client, id);
  if (!current.bbmodel_path) throw new Error('No .bbmodel attached.');
  const storageClient = client as unknown as StorageClientLike;
  const uploadedViewer = await uploadViewerModel(storageClient, id, viewer.file);

  try {
    const { error } = await client.from('creations').update({
      viewer_model_path: uploadedViewer,
      viewer_status: 'ready',
      viewer_error: null,
      viewer_updated_at: new Date().toISOString(),
      viewer_animation_names: viewer.animationNames,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw dbError('Could not update viewer', error);
  } catch (error) {
    await removeObjects(storageClient, 'viewer-models', [uploadedViewer]).catch(() => undefined);
    throw error;
  }

  let cleanupWarning: string | undefined;
  if (current.viewer_model_path && current.viewer_model_path !== uploadedViewer) {
    try { await removeObjects(storageClient, 'viewer-models', [current.viewer_model_path]); }
    catch (error) { cleanupWarning = error instanceof Error ? error.message : 'Old viewer cleanup failed.'; }
  }

  return {
    creation: mapAdminCreation(await loadAdminCreation(client, id)),
    ...(cleanupWarning ? { cleanupWarning } : {}),
  };
}

export async function recordViewerError(client: Client, id: string, message: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  const hasWorkingViewer = Boolean(current.viewer_model_path && current.viewer_status === 'ready');
  const { error } = await client.from('creations').update({
    viewer_status: hasWorkingViewer ? 'ready' : 'error',
    viewer_error: message.slice(0, 500),
    viewer_updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw dbError('Could not save viewer error', error);
  return { creation: mapAdminCreation(await loadAdminCreation(client, id)) };
}

export async function deleteRemoteCreation(client: Client, id: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  const renderPaths = [current.cover_image_path, ...(current.creation_images ?? []).map((image) => image.storage_path)]
    .filter((path): path is string => Boolean(path));

  const { error } = await client.from('creations').delete().eq('id', id);
  if (error) throw dbError('Could not delete creation', error);

  const cleanupFailures = await cleanupNewUploads(
    client,
    renderPaths,
    current.bbmodel_path ?? undefined,
    current.viewer_model_path ?? undefined,
  );
  return cleanupFailures.length ? { cleanupWarning: cleanupFailures.join(' ') } : {};
}

export async function removeRemoteBbmodel(client: Client, id: string): Promise<MutationResult> {
  const current = await loadAdminCreation(client, id);
  if (!current.bbmodel_path) return { creation: mapAdminCreation(current) };

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

  const cleanupFailures = await removeObjectGroups(client as unknown as StorageClientLike, [
    { bucket: 'bbmodels', paths: [current.bbmodel_path] },
    { bucket: 'viewer-models', paths: current.viewer_model_path ? [current.viewer_model_path] : [] },
  ]);

  return {
    creation: mapAdminCreation(await loadAdminCreation(client, id)),
    ...(cleanupFailures.length ? { cleanupWarning: cleanupFailures.join(' ') } : {}),
  };
}

export async function getPrivateBbmodel(client: Client, id: string): Promise<{ blob: Blob; filename: string }> {
  const current = await loadAdminCreation(client, id);
  if (!current.bbmodel_path || !current.bbmodel_filename) throw new Error('No .bbmodel attached.');
  const { data, error } = await client.storage.from('bbmodels').download(current.bbmodel_path);
  if (error || !data) throw new Error(error?.message || 'Could not download .bbmodel.');
  return { blob: data, filename: current.bbmodel_filename };
}
