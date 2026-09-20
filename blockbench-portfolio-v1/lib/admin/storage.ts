import fs from 'node:fs/promises';
import path from 'node:path';
import type { Creation, CreationInput } from '../creations/types';
import { validateCreation, validateCreationList } from '../creations/validate';
import { slugify } from '../utils/slug';
import { safeImageFilename } from '../utils/filenames';
import { assertSafeSlug } from './guards';

export type StoragePaths = { dataFile: string; modelsDir: string };

const DEFAULT_PATHS: StoragePaths = {
  dataFile: path.join(process.cwd(), 'data', 'creations.json'),
  modelsDir: path.join(process.cwd(), 'public', 'models'),
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

function pathsOrDefault(paths?: StoragePaths): StoragePaths {
  return paths ?? DEFAULT_PATHS;
}

async function readStrict(paths: StoragePaths): Promise<Creation[]> {
  try {
    const raw = JSON.parse(await fs.readFile(paths.dataFile, 'utf8'));
    return validateCreationList(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function deterministicSort(rows: Creation[]): Creation[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
}

async function atomicWrite(rows: Creation[], paths: StoragePaths): Promise<void> {
  validateCreationList(rows);
  await fs.mkdir(path.dirname(paths.dataFile), { recursive: true });
  const temp = `${paths.dataFile}.tmp`;
  const serialized = `${JSON.stringify(deterministicSort(rows), null, 2)}\n`;
  await fs.writeFile(temp, serialized, 'utf8');
  await fs.rename(temp, paths.dataFile);
}

function normalizeInput(input: CreationInput): Creation {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!name) throw new Error('Name is required.');
  if (!category) throw new Error('Category is required.');

  const slug = (input.slug?.trim() || slugify(name));
  const id = (input.id?.trim() || slug);
  assertSafeSlug(slug);
  assertSafeSlug(id);

  return validateCreation({
    ...input,
    id,
    slug,
    name,
    category,
    tags: Array.isArray(input.tags) ? input.tags : [],
    description: typeof input.description === 'string' ? input.description : '',
    coverImage: input.coverImage || PLACEHOLDER,
    images: Array.isArray(input.images) ? input.images : [],
    animations: Array.isArray(input.animations) ? input.animations : [],
    featured: Boolean(input.featured),
    featuredOrder: input.featured ? input.featuredOrder : undefined,
    published: input.published !== false,
    createdAt: input.createdAt || new Date().toISOString().slice(0, 10),
  });
}

function validateFiles(files: File[]): { file: File; name: string }[] {
  if (files.length > 20) throw new Error('A maximum of 20 images can be uploaded at once.');
  const seen = new Set<string>();
  return files.map((file) => {
    if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed.');
    if (file.size > MAX_FILE_SIZE) throw new Error('Each image must be 10 MB or smaller.');
    const name = safeImageFilename(file.name);
    if (seen.has(name)) throw new Error(`Duplicate image filename: ${name}`);
    seen.add(name);
    return { file, name };
  });
}

async function writeImages(slug: string, files: File[], paths: StoragePaths): Promise<string[]> {
  assertSafeSlug(slug);
  const prepared = validateFiles(files);
  if (!prepared.length) return [];

  const directory = path.join(paths.modelsDir, slug);
  await fs.mkdir(directory, { recursive: true });
  const publicPaths: string[] = [];
  const diskPaths: string[] = [];
  try {
    for (const { file, name } of prepared) {
      const target = path.join(directory, name);
      await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));
      diskPaths.push(target);
      publicPaths.push(`/models/${slug}/${name}`);
    }
    return publicPaths;
  } catch (error) {
    await Promise.all(diskPaths.map((target) => fs.rm(target, { force: true }).catch(() => undefined)));
    throw error;
  }
}

function withUploadedImages(base: Creation, uploaded: string[], preferFirstAsCover: boolean): Creation {
  if (!uploaded.length) return base;
  const replacingPlaceholder = base.coverImage === PLACEHOLDER;
  const existingImages = replacingPlaceholder ? base.images.filter((image) => image !== PLACEHOLDER) : base.images;
  const images = [...new Set([...existingImages, ...uploaded])];
  const coverImage = preferFirstAsCover || replacingPlaceholder ? uploaded[0] : base.coverImage;
  return validateCreation({ ...base, coverImage, images });
}

function rewriteSlugPaths(creation: Creation, oldSlug: string, newSlug: string): Creation {
  const oldPrefix = `/models/${oldSlug}/`;
  const rewrite = (value: string) => value.startsWith(oldPrefix) ? `/models/${newSlug}/${value.slice(oldPrefix.length)}` : value;
  return validateCreation({
    ...creation,
    coverImage: rewrite(creation.coverImage),
    images: creation.images.map(rewrite),
  });
}

export async function createCreation(input: CreationInput, files: File[], customPaths?: StoragePaths): Promise<Creation> {
  const paths = pathsOrDefault(customPaths);
  const rows = await readStrict(paths);
  let creation = normalizeInput(input);
  if (rows.some((row) => row.id === creation.id)) throw new Error(`Duplicate ID: ${creation.id}`);
  if (rows.some((row) => row.slug === creation.slug)) throw new Error(`Duplicate slug: ${creation.slug}`);

  const preparedFiles = validateFiles(files);
  const createdDir = path.join(paths.modelsDir, creation.slug);
  let wroteImages = false;
  try {
    const uploaded = await writeImages(creation.slug, preparedFiles.map(({ file }) => file), paths);
    wroteImages = uploaded.length > 0;
    creation = withUploadedImages(creation, uploaded, true);
    await atomicWrite([...rows, creation], paths);
    return creation;
  } catch (error) {
    if (wroteImages) await fs.rm(createdDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function updateCreation(originalId: string, input: CreationInput, files: File[], customPaths?: StoragePaths): Promise<Creation> {
  const paths = pathsOrDefault(customPaths);
  const rows = await readStrict(paths);
  const currentIndex = rows.findIndex((row) => row.id === originalId);
  if (currentIndex < 0) throw new Error('Creation not found.');
  const current = rows[currentIndex];
  let next = normalizeInput({ ...input, id: input.id || current.id, createdAt: input.createdAt || current.createdAt });

  if (rows.some((row, index) => index !== currentIndex && row.id === next.id)) throw new Error(`Duplicate ID: ${next.id}`);
  if (rows.some((row, index) => index !== currentIndex && row.slug === next.slug)) throw new Error(`Duplicate slug: ${next.slug}`);

  const preparedFiles = validateFiles(files);
  const oldSlug = current.slug;
  const newSlug = next.slug;
  let movedFolder = false;
  let oldDir = '';
  let newDir = '';
  const addedFiles: string[] = [];

  try {
    if (oldSlug !== newSlug) {
      assertSafeSlug(oldSlug);
      assertSafeSlug(newSlug);
      oldDir = path.join(paths.modelsDir, oldSlug);
      newDir = path.join(paths.modelsDir, newSlug);
      try {
        await fs.access(oldDir);
        await fs.mkdir(path.dirname(newDir), { recursive: true });
        try {
          await fs.access(newDir);
          throw new Error('Destination model folder already exists.');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        await fs.rename(oldDir, newDir);
        movedFolder = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      next = rewriteSlugPaths(next, oldSlug, newSlug);
    }

    const uploaded = await writeImages(newSlug, preparedFiles.map(({ file }) => file), paths);
    addedFiles.push(...uploaded);
    next = withUploadedImages(next, uploaded, false);
    const replacement = [...rows];
    replacement[currentIndex] = next;
    await atomicWrite(replacement, paths);
    return next;
  } catch (error) {
    for (const publicPath of addedFiles) {
      const relative = publicPath.replace(/^\/models\//, '');
      await fs.rm(path.join(paths.modelsDir, relative), { force: true }).catch(() => undefined);
    }
    if (movedFolder && oldDir && newDir) await fs.rename(newDir, oldDir).catch(() => undefined);
    throw error;
  }
}

export async function deleteCreation(id: string, customPaths?: StoragePaths): Promise<void> {
  const paths = pathsOrDefault(customPaths);
  const rows = await readStrict(paths);
  const target = rows.find((row) => row.id === id);
  if (!target) throw new Error('Creation not found.');
  assertSafeSlug(target.slug);

  const remaining = rows.filter((row) => row.id !== id);
  await atomicWrite(remaining, paths);
  await fs.rm(path.join(paths.modelsDir, target.slug), { recursive: true, force: true });
}
