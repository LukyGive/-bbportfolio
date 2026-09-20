import type { Creation } from './types';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertRecord(input: unknown): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Creation must be an object.');
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new Error('Optional metadata must be text.');
  const normalized = value.trim();
  return normalized || undefined;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be a list of text values.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

function imagePath(value: unknown, field: string): string {
  const normalized = requiredString(value, field);
  if (!normalized.startsWith('/models/') || normalized.includes('..') || normalized.includes('\\')) {
    throw new Error(`${field} image path must live under /models/.`);
  }
  return normalized;
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
  return value;
}

export function validateCreation(input: unknown): Creation {
  assertRecord(input);

  const id = requiredString(input.id, 'ID');
  const slug = requiredString(input.slug, 'Slug');
  if (!SLUG_RE.test(slug)) throw new Error('Slug is unsafe or invalid.');
  if (!SLUG_RE.test(id)) throw new Error('ID is unsafe or invalid.');

  const createdAt = requiredString(input.createdAt, 'Date');
  const parsedDate = new Date(`${createdAt}T00:00:00Z`);
  if (!DATE_RE.test(createdAt) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== createdAt) {
    throw new Error('Date must use a real YYYY-MM-DD calendar date.');
  }

  const rawImages = Array.isArray(input.images) ? input.images : [];
  const images = rawImages.map((image) => imagePath(image, 'Gallery'));

  const featuredOrder = input.featuredOrder === undefined || input.featuredOrder === null || input.featuredOrder === ''
    ? undefined
    : Number(input.featuredOrder);
  if (featuredOrder !== undefined && (!Number.isInteger(featuredOrder) || featuredOrder < 0)) {
    throw new Error('Featured order must be a positive whole number.');
  }

  return {
    id,
    slug,
    name: requiredString(input.name, 'Name'),
    category: requiredString(input.category, 'Category'),
    tags: stringList(input.tags ?? [], 'Tags'),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    coverImage: imagePath(input.coverImage, 'Cover'),
    images,
    animations: stringList(input.animations ?? [], 'Animations'),
    featured: booleanValue(input.featured, 'Featured'),
    ...(featuredOrder !== undefined ? { featuredOrder } : {}),
    published: booleanValue(input.published, 'Published'),
    createdAt,
    ...(optionalString(input.software) ? { software: optionalString(input.software) } : {}),
    ...(optionalString(input.modelType) ? { modelType: optionalString(input.modelType) } : {}),
    ...(optionalString(input.version) ? { version: optionalString(input.version) } : {}),
    ...(optionalString(input.notes) ? { notes: optionalString(input.notes) } : {}),
  };
}

export function validateCreationList(input: unknown): Creation[] {
  if (!Array.isArray(input)) throw new Error('Creation data must be an array.');
  const rows = input.map(validateCreation);
  const ids = new Set<string>();
  const slugs = new Set<string>();

  for (const row of rows) {
    if (ids.has(row.id)) throw new Error(`Duplicate ID: ${row.id}`);
    if (slugs.has(row.slug)) throw new Error(`Duplicate slug: ${row.slug}`);
    ids.add(row.id);
    slugs.add(row.slug);
  }

  return rows;
}
