import type { Database } from '@/lib/supabase/database.types';
import type { AdminCreation, AdminGalleryImage, Creation, ViewerStatus } from './types';

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

type CreationRow = Database['public']['Tables']['creations']['Row'];
type ImageRow = Database['public']['Tables']['creation_images']['Row'];
export type CreationRowWithImages = CreationRow & { creation_images?: ImageRow[] | null };

function optionalText(value: string | null): string | undefined {
  return value?.trim() || undefined;
}

function publicStorageUrl(
  bucket: 'portfolio-renders' | 'viewer-models',
  storagePath: string,
  baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
): string {
  const root = baseUrl.replace(/\/$/, '');
  if (!root) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required to build public Storage URLs.');
  const safePath = storagePath.split('/').map(encodeURIComponent).join('/');
  return `${root}/storage/v1/object/public/${bucket}/${safePath}`;
}

export function publicRenderUrl(storagePath: string, baseUrl?: string): string {
  return publicStorageUrl('portfolio-renders', storagePath, baseUrl);
}

export function publicViewerUrl(storagePath: string, baseUrl?: string): string {
  return publicStorageUrl('viewer-models', storagePath, baseUrl);
}

export function mapPublicCreation(row: CreationRowWithImages, baseUrl?: string): Creation {
  const coverImage = row.cover_image_path ? publicRenderUrl(row.cover_image_path, baseUrl) : PLACEHOLDER;
  const images = [...(row.creation_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((image) => publicRenderUrl(image.storage_path, baseUrl));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    tags: [...row.tags],
    description: row.description,
    coverImage,
    images,
    animations: [...row.animations],
    featured: row.featured,
    ...(row.featured_order !== null ? { featuredOrder: row.featured_order } : {}),
    published: row.published,
    createdAt: row.created_at,
    ...(optionalText(row.software) ? { software: optionalText(row.software) } : {}),
    ...(optionalText(row.model_type) ? { modelType: optionalText(row.model_type) } : {}),
    ...(optionalText(row.version) ? { version: optionalText(row.version) } : {}),
    ...(optionalText(row.notes) ? { notes: optionalText(row.notes) } : {}),
    ...(row.viewer_status === 'ready' && row.viewer_model_path ? {
      viewer: {
        modelUrl: publicViewerUrl(row.viewer_model_path, baseUrl),
        animationNames: [...row.viewer_animation_names],
      },
    } : {}),
  };
}

export function mapAdminCreation(row: CreationRowWithImages, baseUrl?: string): AdminCreation {
  const publicCreation = mapPublicCreation(row, baseUrl);
  const galleryImages: AdminGalleryImage[] = [...(row.creation_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((image) => ({
      id: image.id,
      url: publicRenderUrl(image.storage_path, baseUrl),
      altText: image.alt_text,
      sortOrder: image.sort_order,
    }));

  const rawStatus = row.viewer_status;
  const viewerStatus: ViewerStatus = rawStatus === 'processing' || rawStatus === 'ready' || rawStatus === 'error'
    ? rawStatus
    : 'none';

  return {
    ...publicCreation,
    galleryImages,
    viewerStatus,
    ...(row.viewer_error ? { viewerError: row.viewer_error } : {}),
    ...(row.viewer_updated_at ? { viewerUpdatedAt: row.viewer_updated_at } : {}),
    ...(row.bbmodel_filename && row.bbmodel_size !== null ? {
      bbmodel: { filename: row.bbmodel_filename, size: row.bbmodel_size },
    } : {}),
  };
}
