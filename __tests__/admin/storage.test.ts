import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCreation, deleteCreation, updateCreation, type StoragePaths } from '@/lib/admin/storage';
import type { CreationInput } from '@/lib/creations/types';

const roots: string[] = [];
async function tempPaths(): Promise<StoragePaths> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-'));
  roots.push(root);
  const dataFile = path.join(root, 'data', 'creations.json');
  const modelsDir = path.join(root, 'public', 'models');
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.mkdir(modelsDir, { recursive: true });
  await fs.writeFile(dataFile, '[]\n');
  return { dataFile, modelsDir };
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

const base: CreationInput = {
  name: 'Vorakh', category: 'Boss', tags: ['Ice'], description: 'Ice boss',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: ['Idle'],
  featured: true, featuredOrder: 1, published: true, createdAt: '2026-09-20',
};

describe('creation storage', () => {
  it('rejects duplicate IDs and slugs', async () => {
    const paths = await tempPaths();
    await createCreation({ ...base, id: 'vorakh', slug: 'vorakh' }, [], paths);
    await expect(createCreation({ ...base, id: 'vorakh', slug: 'other' }, [], paths)).rejects.toThrow(/duplicate id/i);
    await expect(createCreation({ ...base, id: 'other', slug: 'vorakh' }, [], paths)).rejects.toThrow(/duplicate slug/i);
  });

  it('writes deterministic two-space JSON with trailing newline', async () => {
    const paths = await tempPaths();
    await createCreation(base, [], paths);
    const raw = await fs.readFile(paths.dataFile, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw).toContain('  "id"');
  });

  it('deletes only the matching creation folder', async () => {
    const paths = await tempPaths();
    await createCreation({ ...base, id: 'a', slug: 'a', name: 'A' }, [new File(['a'], 'a.png', { type: 'image/png' })], paths);
    await createCreation({ ...base, id: 'b', slug: 'b', name: 'B' }, [new File(['b'], 'b.png', { type: 'image/png' })], paths);
    await deleteCreation('a', paths);
    await expect(fs.access(path.join(paths.modelsDir, 'a'))).rejects.toThrow();
    await expect(fs.access(path.join(paths.modelsDir, 'b'))).resolves.toBeUndefined();
  });

  it('renaming a slug moves only its own image directory', async () => {
    const paths = await tempPaths();
    await createCreation({ ...base, id: 'a', slug: 'a', name: 'A' }, [new File(['a'], 'a.png', { type: 'image/png' })], paths);
    await createCreation({ ...base, id: 'b', slug: 'b', name: 'B' }, [new File(['b'], 'b.png', { type: 'image/png' })], paths);
    await updateCreation('a', { ...base, id: 'a', slug: 'renamed', name: 'A' }, [], paths);
    await expect(fs.access(path.join(paths.modelsDir, 'a'))).rejects.toThrow();
    await expect(fs.access(path.join(paths.modelsDir, 'renamed'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(paths.modelsDir, 'b'))).resolves.toBeUndefined();
  });


  it('removes the placeholder from gallery images when the first real render is uploaded', async () => {
    const paths = await tempPaths();
    const created = await createCreation(
      { ...base, images: ['/models/_placeholder/creation-placeholder.svg'] },
      [new File(['x'], 'cover.png', { type: 'image/png' })],
      paths,
    );
    expect(created.coverImage).toBe('/models/vorakh/cover.png');
    expect(created.images).not.toContain('/models/_placeholder/creation-placeholder.svg');
  });

  it('rejects uploads whose normalized filenames collide', async () => {
    const paths = await tempPaths();
    await expect(createCreation(
      base,
      [
        new File(['a'], 'Sakura Render.png', { type: 'image/png' }),
        new File(['b'], 'sakura-render.PNG', { type: 'image/png' }),
      ],
      paths,
    )).rejects.toThrow(/duplicate image filename/i);
  });

  it('invalid creation data never replaces the JSON file', async () => {
    const paths = await tempPaths();
    const before = await fs.readFile(paths.dataFile, 'utf8');
    await expect(createCreation({ ...base, name: '' }, [], paths)).rejects.toThrow(/name/i);
    expect(await fs.readFile(paths.dataFile, 'utf8')).toBe(before);
  });
});
