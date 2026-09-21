import { PUBLIC_CREATION_SELECT } from '@/lib/creations/public';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapPublicPack, type PackRowWithCreations } from './mapper';
import type { Pack } from './types';

export const PUBLIC_PACK_SELECT = `
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
    sort_order,
    creations (
      ${PUBLIC_CREATION_SELECT}
    )
  )
`;

function warnQuery(label: string, error: unknown) {
  console.warn(`[portfolio] ${label} failed.`, error instanceof Error ? error.message : error);
}

export async function getPublishedPacks(): Promise<Pack[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('packs')
    .select(PUBLIC_PACK_SELECT)
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    warnQuery('Published pack query', error);
    return [];
  }

  return (data ?? []).map((row: unknown) => mapPublicPack(row as PackRowWithCreations));
}

export async function getPackBySlug(slug: string): Promise<Pack | undefined> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('packs')
    .select(PUBLIC_PACK_SELECT)
    .eq('published', true)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    warnQuery(`Pack query for ${slug}`, error);
    return undefined;
  }

  return data ? mapPublicPack(data as unknown as PackRowWithCreations) : undefined;
}
