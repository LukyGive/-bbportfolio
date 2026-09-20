import path from 'node:path';
import { slugify } from './slug';

const ALLOWED_EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg', '.gif']);

export function safeImageFilename(originalName: string): string {
  if (!originalName || originalName.includes('..') || /[\\/]/.test(originalName)) {
    throw new Error('Unsafe image filename.');
  }

  const base = path.basename(originalName);
  const extension = path.extname(base).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Unsupported image filename extension.');

  const stem = path.basename(base, path.extname(base));
  const safeStem = slugify(stem);
  if (!safeStem) throw new Error('Unsafe image filename.');
  return `${safeStem}${extension}`;
}
