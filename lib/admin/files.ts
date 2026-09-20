import { randomUUID } from 'node:crypto';
import type { AuthorizedUpload, UploadRequestFile, UploadedAssetRef } from './upload-contracts';
import { bucketForUploadKind, validateUploadedAssetRef, validateUploadRequestFile } from './upload-contracts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BBMODEL_BYTES = 50 * 1024 * 1024;
const MAX_VIEWER_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);

export type UploadFile = Pick<File, 'name' | 'type' | 'size'> & Blob;

type StorageBucket = {
  remove(paths: string[]): Promise<{ data: unknown; error: { message?: string } | null }>;
  createSignedUploadUrl?(path: string, options?: { upsert?: boolean }): Promise<{ data: { token?: string; signedUrl?: string } | null; error: { message?: string } | null }>;
  createSignedUrl?(path: string, expiresIn: number, options?: { download?: boolean | string }): Promise<{ data: { signedUrl?: string } | null; error: { message?: string } | null }>;
  list?(path?: string, options?: { limit?: number; search?: string }): Promise<{ data: Array<{ name: string; metadata?: Record<string, unknown> }> | null; error: { message?: string } | null }>;
};

export type StorageClientLike = {
  storage: { from(bucket: string): StorageBucket };
};

function leafName(name: string): string {
  return name.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

function sourceStem(name: string): string {
  const leaf = leafName(name);
  return leaf.replace(/\.bbmodel$/i, '');
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
  if (!/\.bbmodel$/i.test(leafName(file.name))) {
    throw new Error('Blockbench source must use the .bbmodel extension.');
  }
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


function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function createAuthorizedObjectPath(
  userId: string,
  sessionId: string,
  request: UploadRequestFile,
): string {
  assertUuid(userId, 'admin user id');
  assertUuid(sessionId, 'upload session id');
  validateUploadRequestFile(request);

  const id = randomUUID();
  if (request.kind === 'bbmodel') {
    return `uploads/${userId}/${sessionId}/${id}-${safeBbmodelFilename(request.filename)}`;
  }
  if (request.kind === 'viewer') {
    return `uploads/${userId}/${sessionId}/${id}.glb`;
  }
  const extension = imageExtension(request.filename);
  return `uploads/${userId}/${sessionId}/${id}.${extension}`;
}


export async function authorizeUploadBatch(
  client: StorageClientLike,
  userId: string,
  requests: UploadRequestFile[],
): Promise<{ sessionId: string; uploads: AuthorizedUpload[] }> {
  assertUuid(userId, 'admin user id');
  if (!Array.isArray(requests) || requests.length === 0) throw new Error('At least one upload is required.');
  if (requests.length > 22) throw new Error('A maximum of 22 files can be authorized at once.');
  if (requests.filter((item) => item.kind === 'render').length > 20) {
    throw new Error('A maximum of 20 renders can be uploaded at once.');
  }
  if (requests.filter((item) => item.kind === 'bbmodel').length > 1) {
    throw new Error('Only one .bbmodel can be uploaded at once.');
  }
  if (requests.filter((item) => item.kind === 'viewer').length > 1) {
    throw new Error('Only one viewer GLB can be uploaded at once.');
  }

  requests.forEach(validateUploadRequestFile);
  const sessionId = randomUUID();
  const uploads: AuthorizedUpload[] = [];

  for (const request of requests) {
    const bucket = bucketForUploadKind(request.kind);
    const path = createAuthorizedObjectPath(userId, sessionId, request);
    const storage = client.storage.from(bucket);
    if (!storage.createSignedUploadUrl) throw new Error('Storage client cannot create signed upload URLs.');
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (error || !data?.token) throw new Error(error?.message || `Could not authorize ${request.kind} upload.`);
    uploads.push({
      ...request,
      bucket,
      path,
      token: data.token,
      ...(request.kind === 'bbmodel' ? {} : { cacheControl: '31536000' }),
    });
  }

  return { sessionId, uploads };
}

export function renderObjectPath(creationId: string, file: Pick<File, 'name'>, kind: 'cover' | 'gallery'): string {
  assertCreationId(creationId);
  const extension = imageExtension(file.name);
  if (kind === 'cover') return `${creationId}/cover-${randomUUID()}.${extension}`;
  return `${creationId}/gallery/${randomUUID()}.${extension}`;
}

export function viewerObjectPath(creationId: string): string {
  assertCreationId(creationId);
  return `${creationId}/${randomUUID()}.glb`;
}

export function bbmodelObjectPath(creationId: string, file: Pick<File, 'name'>): string {
  assertCreationId(creationId);
  return `${creationId}/${randomUUID()}-${safeBbmodelFilename(file.name)}`;
}

export type ManagedBucket = 'portfolio-renders' | 'bbmodels' | 'viewer-models';

export async function removeObjects(client: StorageClientLike, bucket: ManagedBucket, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  const { error } = await client.storage.from(bucket).remove(unique);
  if (error) throw new Error(error.message || `Could not remove ${bucket} objects.`);
}


export type StorageObjectGroup = {
  bucket: ManagedBucket;
  paths: string[];
};

export async function removeObjectGroups(
  client: StorageClientLike,
  groups: StorageObjectGroup[],
): Promise<string[]> {
  const results = await Promise.allSettled(
    groups.map(({ bucket, paths }) => removeObjects(client, bucket, paths)),
  );

  return results.flatMap((result) => {
    if (result.status === 'fulfilled') return [];
    return [result.reason instanceof Error ? result.reason.message : 'Remote file cleanup failed.'];
  });
}


export async function cleanupUploadedRefs(
  client: StorageClientLike,
  userId: string,
  refs: UploadedAssetRef[],
): Promise<string[]> {
  if (!Array.isArray(refs) || refs.length > 22) throw new Error('Invalid cleanup upload list.');
  refs.forEach((ref) => validateUploadedAssetRef(userId, ref));

  const grouped = new Map<ManagedBucket, string[]>();
  for (const ref of refs) {
    const bucket = ref.bucket as ManagedBucket;
    grouped.set(bucket, [...(grouped.get(bucket) ?? []), ref.path]);
  }

  return removeObjectGroups(client, [...grouped.entries()].map(([bucket, paths]) => ({ bucket, paths })));
}


export async function verifyUploadedObject(
  client: StorageClientLike,
  userId: string,
  ref: UploadedAssetRef,
): Promise<void> {
  validateUploadedAssetRef(userId, ref);

  const parts = ref.path.split('/');
  const name = parts.pop();
  const folder = parts.join('/');
  if (!name) throw new Error('Invalid upload path.');

  const storage = client.storage.from(ref.bucket);
  if (!storage.list) throw new Error('Storage client cannot verify uploaded objects.');
  const { data, error } = await storage.list(folder, { limit: 100, search: name });
  if (error) throw new Error(error.message || `Could not verify ${ref.kind} upload.`);

  const item = (data ?? []).find((entry) => entry.name === name);
  if (!item) throw new Error(`Uploaded ${ref.kind} object was not found.`);

  const rawSize = item.metadata?.size ?? item.metadata?.contentLength;
  const actualSize = typeof rawSize === 'number' ? rawSize : Number(rawSize);
  if (Number.isFinite(actualSize)) {
    validateUploadRequestFile({ ...ref, size: actualSize });
    if (actualSize !== ref.size) throw new Error(`Uploaded ${ref.kind} size does not match authorization.`);
  }
}

export async function verifyCreationUploads(
  client: StorageClientLike,
  userId: string,
  uploads: import('./upload-contracts').CreationUploads,
): Promise<void> {
  if (uploads.renders.length > 20) throw new Error('A maximum of 20 renders can be uploaded at once.');
  if (uploads.bbmodel && !uploads.viewer) throw new Error('A generated viewer GLB is required with a .bbmodel source.');
  if (uploads.viewer && !uploads.bbmodel) throw new Error('Viewer GLB cannot be attached without a .bbmodel source.');

  for (const render of uploads.renders) await verifyUploadedObject(client, userId, render);
  if (uploads.bbmodel) await verifyUploadedObject(client, userId, uploads.bbmodel);
  if (uploads.viewer) await verifyUploadedObject(client, userId, uploads.viewer);
}
