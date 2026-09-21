import { requireAdmin } from '@/lib/auth/server';
import { mapAdminPack, type PackRowWithCreations } from '@/lib/packs/mapper';
import type { AdminPack } from '@/lib/packs/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const ADMIN_PACK_SELECT = `
  id,
  slug,
  name,
  description,
  cover_image_path,
  published,
  created_at,
  updated_at,
  pack_creations (
    pack_id,
    creation_id,
    sort_order
  )
`;

export async function getAllPacksForAdmin(): Promise<AdminPack[]> {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('packs')
    .select(ADMIN_PACK_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load admin packs: ${error.message}`);
  return (data ?? []).map((row: unknown) => mapAdminPack(row as PackRowWithCreations));
}
