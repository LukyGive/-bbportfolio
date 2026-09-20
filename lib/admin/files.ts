import { randomUUID } from 'node:crypto';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BBMODEL_BYTES = 50 * 1024 * 1024;
const MAX_VIEWER_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);

type ManagedBucket = 'portfolio-renders' | 'bbmodels' | 'viewer-models';

export type UploadFile = Pick<File, 'name' | 'type' | 'size'> & Blob;

type StorageBucket = {
  upload(path: string, fileBody: Blob, options?: { contentType?: string; upsert?: boolean; cacheControl?: string }): Promise<{ data: unknown; error: { message?: string } | null }>;
  remove(paths: string[]): Promise<{ data: unknown; error: { message?: string } | null }>;
  download?(path: string): Promise<{ data: Blob | null; error: { message?: string } | null }>;
};

export type StorageClientLike = {
  storage: { from(bucket: string): StorageBucket };
};

function leafName(name: string): string {
  return name.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

function sourceStem(name: string): string {
  return leafName(name).replace(/\.bbmodel$/i, '');
}

export function safeBbmodelFilename(originalName: string): string {
  const stem = sourceStem(originalName)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!stem) throw new Error('Unsafe .bbmodel filename.');
  return `${stem}.bbmodel`;
}

export function validateBbmodelFile(file: Pick<File, 'name' | 'size'>): void {
  if (!/\.bbmodel$/i.test(leafName(file.name))) throw new Error('Blockbench source must use the .bbmodel extension.');
  if (file.size <= 0) throw new Error('The .bbmodel file is empty.');
  if (file.size > MAX_BBMODEL_BYTES) throw new Error('The .bbmodel file must be 50 MB or smaller.');
}

export function validateViewerFile(file: Pick<File, 'name' | 'type' | 'size'>): void {
  if (!/\.glb$/i.test(leafName(file.name))) throw new Error('Viewer model must use the .glb extension.');
  if (file.size <= 0) throw new Error('The viewer GLB is empty.');
  if (file.size > MAX_VIEWER_BYTES) throw new Error('The viewer GLB must be 50 MB or smaller.');
}

export function validateImageFile(file: Pick<File, 'name' | 'type' | 'size'>): void {
  const extension = leafName(file.name).split('.').pop()?.toLowerCase() ?? '';
  if (!IMAGE_TYPES.has(file.type) || !IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported image file. Use PNG, JPEG, WebP or AVIF.');
  }
  if (file.size <= 0) throw new Error('The image file is empty.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 10 MB or smaller.');
}

function assertCreationId(creationId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(creationId)) {
    throw new Error('Invalid creation id.');
  }
}

function imageExtension(name: string): string {
  const extension = leafName(name).split('.').pop()?.toLowerCase() ?? '';
  if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('Unsupported image filename extension.');
  return extension === 'jpeg' ? 'jpg' : extension;
}

export function renderObjectPath(creationId: string, file: Pick<File, 'name'>, kind: 'cover' | 'gallery'): string {
  assertCreationId(creationId);
  const extension = imageExtension(file.name);
  if (kind === 'cover') return `${creationId}/cover-${randomUUID()}.${extension}`;
  return `${creationId}/gallery/${randomUUID()}.${extension}`;
}

export function bbmodelObjectPath(creationId: string, file: Pick<File, 'name'>): string {
  assertCreationId(creationId);
  return `${creationId}/${randomUUID()}-${safeBbmodelFilename(file.name)}`;
}

export function viewerObjectPath(creationId: string): string {
  assertCreationId(creationId);
  return `${creationId}/${randomUUID()}.glb`;
}

export async function uploadRender(client: StorageClientLike, creationId: string, file: File, kind: 'cover' | 'gallery'): Promise<string> {
  validateImageFile(file);
  const path = renderObjectPath(creationId, file, kind);
  const { error } = await client.storage.from('portfolio-renders').upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Could not upload image.');
  return path;
}

export async function uploadBbmodel(client: StorageClientLike, creationId: string, file: File): Promise<string> {
  validateBbmodelFile(file);
  const path = bbmodelObjectPath(creationId, file);
  const { error } = await client.storage.from('bbmodels').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Could not upload .bbmodel.');
  return path;
}

export async function uploadViewerModel(client: StorageClientLike, creationId: string, file: File): Promise<string> {
  validateViewerFile(file);
  const path = viewerObjectPath(creationId);
  const { error } = await client.storage.from('viewer-models').upload(path, file, {
    contentType: 'model/gltf-binary',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'Could not upload viewer GLB.');
  return path;
}

export async function removeObjects(client: StorageClientLike, bucket: ManagedBucket, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  const { error } = await client.storage.from(bucket).remove(unique);
  if (error) throw new Error(error.message || `Could not remove ${bucket} objects.`);
}

export type StorageObjectGroup = { bucket: ManagedBucket; paths: string[] };

export async function removeObjectGroups(client: StorageClientLike, groups: StorageObjectGroup[]): Promise<string[]> {
  const results = await Promise.allSettled(groups.map(({ bucket, paths }) => removeObjects(client, bucket, paths)));
  return results.flatMap((result) => result.status === 'fulfilled'
    ? []
    : [result.reason instanceof Error ? result.reason.message : 'Remote file cleanup failed.']);
}
