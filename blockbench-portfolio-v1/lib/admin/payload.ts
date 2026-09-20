import type { CreationInput } from '../creations/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseCreationFormData(formData: FormData): {
  input: CreationInput;
  images: File[];
  originalId?: string;
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

  const originalIdEntry = formData.get('originalId');
  const originalId = typeof originalIdEntry === 'string' && originalIdEntry.trim() ? originalIdEntry.trim() : undefined;

  return { input: raw as CreationInput, images, ...(originalId ? { originalId } : {}) };
}
