import type { CreationInput } from '../creations/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export type ParsedViewerUpload = {
  file: File;
  animationNames: string[];
};

export function parseCreationFormData(formData: FormData): {
  input: CreationInput;
  images: File[];
  bbmodel?: File;
  viewer?: ParsedViewerUpload;
  originalId?: string;
  replaceCover: boolean;
} {
  const payload = formData.get('payload');
  if (typeof payload !== 'string' || !payload.trim()) throw new Error('Missing JSON payload.');

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw new Error('Invalid JSON payload.');
  }
  if (!isRecord(raw)) throw new Error('Creation payload must be an object.');
  if (typeof raw.name !== 'string' || !raw.name.trim()) throw new Error('Name is required.');
  if (typeof raw.category !== 'string' || !raw.category.trim()) throw new Error('Category is required.');

  const entries = formData.getAll('images');
  if (entries.length > 20) throw new Error('A maximum of 20 images can be uploaded at once.');
  const images = entries.map((entry) => {
    if (!(entry instanceof File)) throw new Error('Images must be uploaded as files.');
    if (!entry.type.startsWith('image/')) throw new Error('Only image files are allowed.');
    return entry;
  });

  const sourceEntries = formData.getAll('bbmodel').filter((entry) => entry instanceof File && entry.size > 0);
  if (sourceEntries.length > 1) throw new Error('Only one .bbmodel file can be attached.');
  const bbmodel = sourceEntries[0] instanceof File ? sourceEntries[0] : undefined;

  const viewerEntry = formData.get('viewerModel');
  const animationEntry = formData.get('viewerAnimationNames');
  let viewer: ParsedViewerUpload | undefined;

  if (viewerEntry instanceof File && viewerEntry.size > 0) {
    let parsedNames: unknown = [];
    try {
      parsedNames = typeof animationEntry === 'string' && animationEntry.trim()
        ? JSON.parse(animationEntry)
        : [];
    } catch {
      throw new Error('Invalid viewer animation metadata.');
    }
    if (!Array.isArray(parsedNames) || parsedNames.some((name) => typeof name !== 'string')) {
      throw new Error('Invalid viewer animation metadata.');
    }
    viewer = {
      file: viewerEntry,
      animationNames: [...new Set(parsedNames.map((name) => name.trim()).filter(Boolean))],
    };
  }

  const replaceCover = formData.get('replaceCover') === 'true';
  const originalIdEntry = formData.get('originalId');
  const originalId = typeof originalIdEntry === 'string' && originalIdEntry.trim() ? originalIdEntry.trim() : undefined;

  if (bbmodel && !viewer) {
    throw new Error('A generated viewer GLB is required when attaching or replacing a .bbmodel.');
  }
  if (viewer && !bbmodel && !originalId) {
    throw new Error('Viewer GLB cannot be attached without a .bbmodel source.');
  }

  return {
    input: raw as CreationInput,
    images,
    replaceCover,
    ...(bbmodel ? { bbmodel } : {}),
    ...(viewer ? { viewer } : {}),
    ...(originalId ? { originalId } : {}),
  };
}
