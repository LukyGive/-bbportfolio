import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { publicRenderUrl } from '@/lib/creations/mapper';
import type { AdminGalleryImage } from '@/lib/creations/types';
import { removeObjects, type StorageClientLike } from './files';
import type { GalleryMoveDirection } from './gallery-order';

type Client = SupabaseClient<Database>;

type GalleryRow = Database['public']['Tables']['creation_images']['Row'];

function toAdminImage(row: GalleryRow): AdminGalleryImage {
  return {
    id: row.id,
    url: publicRenderUrl(row.storage_path),
    altText: row.alt_text,
    sortOrder: row.sort_order,
  };
}

async function loadImage(client: Client, id: string): Promise<GalleryRow> {
  const { data, error } = await client.from('creation_images').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Could not load gallery image: ${error.message}`);
  if (!data) throw new Error('Gallery image not found.');
  return data;
}

export async function listAdminGallery(client: Client, creationId: string): Promise<AdminGalleryImage[]> {
  const { data, error } = await client
    .from('creation_images')
    .select('*')
    .eq('creation_id', creationId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load gallery: ${error.message}`);
  return (data ?? []).map(toAdminImage);
}

export async function moveRemoteGalleryImage(client: Client, id: string, direction: GalleryMoveDirection): Promise<AdminGalleryImage[]> {
  const target = await loadImage(client, id);
  const { data, error } = await client
    .from('creation_images')
    .select('*')
    .eq('creation_id', target.creation_id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load gallery: ${error.message}`);

  const rows = data ?? [];
  const currentIndex = rows.findIndex((row) => row.id === id);
  const neighborIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || neighborIndex < 0 || neighborIndex >= rows.length) return rows.map(toAdminImage);

  const neighbor = rows[neighborIndex];
  const targetOrder = target.sort_order;
  const neighborOrder = neighbor.sort_order;

  const { error: firstError } = await client.from('creation_images').update({ sort_order: neighborOrder }).eq('id', target.id);
  if (firstError) throw new Error(`Could not reorder gallery: ${firstError.message}`);
  const { error: secondError } = await client.from('creation_images').update({ sort_order: targetOrder }).eq('id', neighbor.id);
  if (secondError) {
    await client.from('creation_images').update({ sort_order: targetOrder }).eq('id', target.id);
    throw new Error(`Could not reorder gallery: ${secondError.message}`);
  }

  return listAdminGallery(client, target.creation_id);
}

export async function deleteRemoteGalleryImage(client: Client, id: string): Promise<{ images: AdminGalleryImage[]; cleanupWarning?: string }> {
  const target = await loadImage(client, id);
  const { data: creation, error: creationError } = await client
    .from('creations')
    .select('cover_image_path')
    .eq('id', target.creation_id)
    .maybeSingle();
  if (creationError) throw new Error(`Could not load creation cover: ${creationError.message}`);
  if (!creation) throw new Error('Creation not found.');

  const { error: deleteError } = await client.from('creation_images').delete().eq('id', target.id);
  if (deleteError) throw new Error(`Could not remove gallery image: ${deleteError.message}`);

  let cleanupWarning: string | undefined;
  if (creation.cover_image_path !== target.storage_path) {
    try {
      await removeObjects(client as unknown as StorageClientLike, 'portfolio-renders', [target.storage_path]);
    } catch (error) {
      cleanupWarning = error instanceof Error ? error.message : 'Render cleanup failed.';
    }
  }

  return {
    images: await listAdminGallery(client, target.creation_id),
    ...(cleanupWarning ? { cleanupWarning } : {}),
  };
}
