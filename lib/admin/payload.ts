import type { CreationInput } from '../creations/types';
import type {
  CreationUploads,
  UploadedAssetRef,
  UploadedRenderRef,
  UploadedSourceRef,
  UploadedViewerRef,
} from './upload-contracts';
import { validateUploadedAssetRef } from './upload-contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dedupeAnimationNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((name) => typeof name !== 'string')) {
    throw new Error('Invalid viewer animation metadata.');
  }
  return [...new Set(value.map((name) => name.trim()).filter(Boolean))];
}

function parseAssetRef(value: unknown, userId: string): UploadedAssetRef {
  if (!isRecord(value)) throw new Error('Invalid upload asset metadata.');
  const ref = value as unknown as UploadedAssetRef;
  validateUploadedAssetRef(userId, ref);
  return ref;
}

export type CreationMutationBody = {
  input: CreationInput;
  uploads: CreationUploads;
  originalId?: string;
  replaceCover: boolean;
};

export function parseCreationMutationBody(raw: unknown, userId: string): CreationMutationBody {
  if (!isRecord(raw)) throw new Error('Creation payload must be an object.');
  if (!isRecord(raw.payload)) throw new Error('Creation payload is required.');
  if (typeof raw.payload.name !== 'string' || !raw.payload.name.trim()) throw new Error('Name is required.');
  if (typeof raw.payload.category !== 'string' || !raw.payload.category.trim()) throw new Error('Category is required.');

  if (raw.replaceCover !== undefined && typeof raw.replaceCover !== 'boolean') {
    throw new Error('replaceCover must be a boolean.');
  }
  if (raw.originalId !== undefined && (typeof raw.originalId !== 'string' || !raw.originalId.trim())) {
    throw new Error('originalId must be a non-empty string.');
  }

  let uploads: CreationUploads = { renders: [] };
  if (raw.uploads !== undefined) {
    if (!isRecord(raw.uploads)) throw new Error('Invalid uploads metadata.');
    const rendersRaw = raw.uploads.renders ?? [];
    if (!Array.isArray(rendersRaw)) throw new Error('Render uploads must be an array.');
    if (rendersRaw.length > 20) throw new Error('A maximum of 20 renders can be uploaded at once.');

    const renders = rendersRaw.map((value) => {
      const ref = parseAssetRef(value, userId);
      if (ref.kind !== 'render' || ref.bucket !== 'portfolio-renders') throw new Error('Invalid render upload metadata.');
      return ref as UploadedRenderRef;
    });

    let bbmodel: UploadedSourceRef | undefined;
    if (raw.uploads.bbmodel !== undefined) {
      const ref = parseAssetRef(raw.uploads.bbmodel, userId);
      if (ref.kind !== 'bbmodel' || ref.bucket !== 'bbmodels') throw new Error('Invalid .bbmodel upload metadata.');
      bbmodel = ref as UploadedSourceRef;
    }

    let viewer: (UploadedViewerRef & { animationNames: string[] }) | undefined;
    if (raw.uploads.viewer !== undefined) {
      if (!isRecord(raw.uploads.viewer)) throw new Error('Invalid viewer upload metadata.');
      const ref = parseAssetRef(raw.uploads.viewer, userId);
      if (ref.kind !== 'viewer' || ref.bucket !== 'viewer-models') throw new Error('Invalid viewer upload metadata.');
      viewer = {
        ...(ref as UploadedViewerRef),
        animationNames: dedupeAnimationNames(raw.uploads.viewer.animationNames ?? []),
      };
    }

    if (bbmodel && !viewer) throw new Error('A generated viewer GLB is required when attaching or replacing a .bbmodel.');
    if (viewer && !bbmodel) throw new Error('Viewer GLB cannot be attached without a .bbmodel source.');

    uploads = {
      renders,
      ...(bbmodel ? { bbmodel } : {}),
      ...(viewer ? { viewer } : {}),
    };
  }

  return {
    input: raw.payload as unknown as CreationInput,
    uploads,
    replaceCover: raw.replaceCover === true,
    ...(typeof raw.originalId === 'string' ? { originalId: raw.originalId.trim() } : {}),
  };
}

export function parseViewerReplacementBody(
  raw: unknown,
  userId: string,
): UploadedViewerRef & { animationNames: string[] } {
  if (!isRecord(raw) || !isRecord(raw.viewer)) throw new Error('Viewer upload metadata is required.');
  const ref = parseAssetRef(raw.viewer, userId);
  if (ref.kind !== 'viewer' || ref.bucket !== 'viewer-models') throw new Error('Invalid viewer upload metadata.');
  return {
    ...(ref as UploadedViewerRef),
    animationNames: dedupeAnimationNames(raw.viewer.animationNames ?? []),
  };
}
