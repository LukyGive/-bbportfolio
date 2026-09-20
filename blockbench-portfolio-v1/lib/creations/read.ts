import fs from 'node:fs/promises';
import path from 'node:path';
import type { Creation } from './types';
import { validateCreation } from './validate';

const dataFile = path.join(process.cwd(), 'data', 'creations.json');

export function sortNewestFirst(rows: Creation[]): Creation[] {
  return [...rows].sort((a, b) => {
    const byDate = b.createdAt.localeCompare(a.createdAt);
    return byDate || a.name.localeCompare(b.name);
  });
}

export function selectPublished(rows: Creation[]): Creation[] {
  return sortNewestFirst(rows.filter((row) => row.published));
}

export function selectFeatured(rows: Creation[]): Creation[] {
  return rows
    .filter((row) => row.published && row.featured)
    .sort((a, b) => {
      const aOrder = Number.isFinite(a.featuredOrder) ? a.featuredOrder! : Number.POSITIVE_INFINITY;
      const bOrder = Number.isFinite(b.featuredOrder) ? b.featuredOrder! : Number.POSITIVE_INFINITY;
      const byOrder = aOrder - bOrder;
      if (byOrder !== 0) return byOrder;
      const byDate = b.createdAt.localeCompare(a.createdAt);
      return byDate || a.name.localeCompare(b.name);
    });
}

export function parseCreationDataSafely(raw: unknown): Creation[] {
  if (!Array.isArray(raw)) {
    console.warn('[portfolio] data/creations.json must contain an array.');
    return [];
  }

  const valid: Creation[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  for (const item of raw) {
    try {
      const row = validateCreation(item);
      if (ids.has(row.id) || slugs.has(row.slug)) {
        console.warn(`[portfolio] Ignoring duplicate creation ${row.id}/${row.slug}.`);
        continue;
      }
      ids.add(row.id);
      slugs.add(row.slug);
      valid.push(row);
    } catch (error) {
      console.warn('[portfolio] Ignoring invalid creation record.', error instanceof Error ? error.message : error);
    }
  }
  return valid;
}

export async function getAllCreations(): Promise<Creation[]> {
  try {
    const rawText = await fs.readFile(dataFile, 'utf8');
    return parseCreationDataSafely(JSON.parse(rawText));
  } catch (error) {
    console.warn('[portfolio] Could not read creation data.', error instanceof Error ? error.message : error);
    return [];
  }
}

export async function getPublishedCreations(): Promise<Creation[]> {
  return selectPublished(await getAllCreations());
}

export async function getFeaturedCreations(): Promise<Creation[]> {
  return selectFeatured(await getAllCreations());
}

export async function getCreationBySlug(slug: string): Promise<Creation | undefined> {
  return (await getPublishedCreations()).find((creation) => creation.slug === slug);
}

export async function getCategories(): Promise<string[]> {
  return [...new Set((await getPublishedCreations()).map((creation) => creation.category))].sort((a, b) => a.localeCompare(b));
}
