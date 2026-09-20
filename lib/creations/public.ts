import { createServerSupabaseClient } from '@/lib/supabase/server';
import { mapPublicCreation, type CreationRowWithImages } from './mapper';
import { sortFeaturedCreations, sortNewestFirst } from './sort';
import type { Creation } from './types';

export { sortFeaturedCreations } from './sort';

export const PUBLIC_CREATION_SELECT = `
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
  software,
  model_type,
  version,
  notes,
  cover_image_path,
  viewer_model_path,
  viewer_status,
  viewer_animation_names,
  creation_images (
    id,
    creation_id,
    storage_path,
    alt_text,
    sort_order,
    created_at
  )
`;

function warnQuery(label: string, error: unknown) {
  console.warn(`[portfolio] ${label} failed.`, error instanceof Error ? error.message : error);
}

export async function getPublishedCreations(): Promise<Creation[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('creations')
    .select(PUBLIC_CREATION_SELECT)
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    warnQuery('Published creation query', error);
    return [];
  }

  return sortNewestFirst((data ?? []).map((row) => mapPublicCreation(row as unknown as CreationRowWithImages)));
}

export async function getFeaturedCreations(): Promise<Creation[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('creations')
    .select(PUBLIC_CREATION_SELECT)
    .eq('published', true)
    .eq('featured', true);

  if (error) {
    warnQuery('Featured creation query', error);
    return [];
  }

  return sortFeaturedCreations((data ?? []).map((row) => mapPublicCreation(row as unknown as CreationRowWithImages)));
}

export async function getCreationBySlug(slug: string): Promise<Creation | undefined> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('creations')
    .select(PUBLIC_CREATION_SELECT)
    .eq('published', true)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    warnQuery(`Creation query for ${slug}`, error);
    return undefined;
  }

  return data ? mapPublicCreation(data as unknown as CreationRowWithImages) : undefined;
}

export async function getCategories(): Promise<string[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('creations')
    .select('category')
    .eq('published', true)
    .order('category', { ascending: true });

  if (error) {
    warnQuery('Category query', error);
    return [];
  }

  const categories = (data ?? [])
    .map((row: { category: string }) => row.category)
    .filter((category): category is string => Boolean(category));
  return [...new Set<string>(categories)];
}
