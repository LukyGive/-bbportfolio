import type { PackInput } from '@/lib/packs/types';
import type { PackUploads, UploadedAssetRef, UploadedRenderRef } from './upload-contracts';
import { validateUploadedAssetRef } from './upload-contracts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseAssetRef(value: unknown, userId: string): UploadedAssetRef {
  if (!isRecord(value)) throw new Error('Invalid upload asset metadata.');
  const ref = value as unknown as UploadedAssetRef;
  validateUploadedAssetRef(userId, ref);
  return ref;
}

export type PackMutationBody = {
  input: PackInput;
  uploads: PackUploads;
  originalId?: string;
  removeCover: boolean;
};

export function parsePackMutationBody(raw: unknown, userId: string): PackMutationBody {
  if (!isRecord(raw)) throw new Error('Pack payload must be an object.');
  if (!isRecord(raw.payload)) throw new Error('Pack payload is required.');
  if (typeof raw.payload.name !== 'string' || !raw.payload.name.trim()) throw new Error('Name is required.');
  if (raw.payload.slug !== undefined && typeof raw.payload.slug !== 'string') {
    throw new Error('Slug must be a string.');
  }
  const submittedSlug = typeof raw.payload.slug === 'string' ? raw.payload.slug.trim() : '';
  if (submittedSlug && !SAFE_SLUG.test(submittedSlug)) throw new Error('Slug is unsafe or invalid.');
  if (raw.payload.description !== undefined && typeof raw.payload.description !== 'string') {
    throw new Error('Description must be a string.');
  }
  if (raw.payload.published !== undefined && typeof raw.payload.published !== 'boolean') {
    throw new Error('Published must be a boolean.');
  }

  const ids = raw.payload.orderedCreationIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
    throw new Error('orderedCreationIds must contain valid UUIDs.');
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate creation ids are not allowed.');

  if (raw.removeCover !== undefined && typeof raw.removeCover !== 'boolean') {
    throw new Error('removeCover must be a boolean.');
  }
  if (raw.originalId !== undefined && (typeof raw.originalId !== 'string' || !UUID.test(raw.originalId))) {
    throw new Error('originalId must be a valid UUID.');
  }

  let uploads: PackUploads = {};
  if (raw.uploads !== undefined) {
    if (!isRecord(raw.uploads)) throw new Error('Invalid uploads metadata.');
    if (raw.uploads.cover !== undefined) {
      const ref = parseAssetRef(raw.uploads.cover, userId);
      if (ref.kind !== 'render' || ref.bucket !== 'portfolio-renders') {
        throw new Error('Invalid pack cover upload metadata.');
      }
      uploads = { cover: ref as UploadedRenderRef };
    }
  }

  const removeCover = raw.removeCover === true;
  if (removeCover && uploads.cover) throw new Error('Cannot remove and replace the pack cover at the same time.');

  return {
    input: {
      slug: typeof raw.payload.slug === 'string' ? raw.payload.slug : undefined,
      name: raw.payload.name,
      description: typeof raw.payload.description === 'string' ? raw.payload.description : '',
      published: raw.payload.published ?? true,
      orderedCreationIds: ids as string[],
    },
    uploads,
    removeCover,
    ...(typeof raw.originalId === 'string' ? { originalId: raw.originalId } : {}),
  };
}
