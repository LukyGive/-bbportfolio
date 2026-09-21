import { mapPublicCreation, publicRenderUrl, type CreationRowWithImages } from '@/lib/creations/mapper';
import type { Database } from '@/lib/supabase/database.types';
import type { AdminPack, Pack } from './types';

type PackRow = Database['public']['Tables']['packs']['Row'];
type PackMemberRow = Database['public']['Tables']['pack_creations']['Row'] & {
  creations?: CreationRowWithImages | null;
};

export type PackRowWithCreations = PackRow & {
  pack_creations?: PackMemberRow[] | null;
};

function sortedMembers(row: PackRowWithCreations): PackMemberRow[] {
  return [...(row.pack_creations ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order || a.creation_id.localeCompare(b.creation_id));
}

function basePack(row: PackRow, baseUrl?: string) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.cover_image_path ? { coverImage: publicRenderUrl(row.cover_image_path, baseUrl) } : {}),
  };
}

export function mapPublicPack(row: PackRowWithCreations, baseUrl?: string): Pack {
  const creations = sortedMembers(row)
    .filter((member) => member.creations?.published === true)
    .map((member) => mapPublicCreation(member.creations as CreationRowWithImages, baseUrl));

  return { ...basePack(row, baseUrl), creations };
}

export function mapAdminPack(row: PackRowWithCreations, baseUrl?: string): AdminPack {
  const members = sortedMembers(row);
  return {
    ...basePack(row, baseUrl),
    orderedCreationIds: members.map((member) => member.creation_id),
    memberCount: members.length,
  };
}
