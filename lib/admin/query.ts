import { requireAdmin } from '@/lib/auth/server';
import { mapAdminCreation, type CreationRowWithImages } from '@/lib/creations/mapper';
import type { AdminCreation } from '@/lib/creations/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const ADMIN_CREATION_SELECT = `
  id,
  slug,
  name,
  category,
  tags,
  description,
  animations,
  featured,
  featured_order,
  published,
  created_at,
  updated_at,
  software,
  model_type,
  version,
  notes,
  cover_image_path,
  bbmodel_path,
  bbmodel_filename,
  bbmodel_size,
  creation_images (
    id,
    creation_id,
    storage_path,
    alt_text,
    sort_order,
    created_at
  )
`;

export async function getAllCreationsForAdmin(): Promise<AdminCreation[]> {
  await requireAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from('creations').select(ADMIN_CREATION_SELECT).order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load admin creations: ${error.message}`);
  return (data ?? []).map((row) => mapAdminCreation(row as unknown as CreationRowWithImages));
}
