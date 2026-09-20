import type { CreationInput } from '@/lib/creations/types';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type NormalizedCreationInput = {
  slug: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  animations: string[];
  featured: boolean;
  featured_order: number | null;
  published: boolean;
  created_at: string;
  software: string | null;
  model_type: string | null;
  version: string | null;
  notes: string | null;
};

function slugifyName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueText(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

function validDate(value: unknown): string {
  const fallback = new Date().toISOString().slice(0, 10);
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !DATE_RE.test(value)) throw new Error('Date must use YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Date must be a real calendar date.');
  return value;
}

export function normalizeCreationInput(input: CreationInput): NormalizedCreationInput {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!name) throw new Error('Name is required.');
  if (!category) throw new Error('Category is required.');

  const slug = typeof input.slug === 'string' && input.slug.trim() ? input.slug.trim() : slugifyName(name);
  if (!SAFE_SLUG.test(slug)) throw new Error('Slug is unsafe or invalid.');

  const featured = Boolean(input.featured);
  let featuredOrder: number | null = null;
  if (featured && input.featuredOrder !== undefined && input.featuredOrder !== null) {
    const value = Number(input.featuredOrder);
    if (!Number.isInteger(value) || value < 0) throw new Error('Featured order must be a positive whole number.');
    featuredOrder = value;
  }

  return {
    slug,
    name,
    category,
    tags: uniqueText(input.tags),
    description: typeof input.description === 'string' ? input.description.trim() : '',
    animations: uniqueText(input.animations),
    featured,
    featured_order: featuredOrder,
    published: input.published !== false,
    created_at: validDate(input.createdAt),
    software: optionalText(input.software),
    model_type: optionalText(input.modelType),
    version: optionalText(input.version),
    notes: optionalText(input.notes),
  };
}
