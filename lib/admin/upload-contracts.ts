export type UploadKind = 'render' | 'bbmodel' | 'viewer';
export type ManagedUploadBucket = 'portfolio-renders' | 'bbmodels' | 'viewer-models';

export type UploadRequestFile = {
  clientKey: string;
  kind: UploadKind;
  filename: string;
  size: number;
  contentType: string;
};

export type AuthorizedUpload = UploadRequestFile & {
  bucket: ManagedUploadBucket;
  path: string;
  token: string;
  cacheControl?: string;
};

export type UploadedAssetRef = Omit<AuthorizedUpload, 'token' | 'cacheControl'>;
export type UploadedRenderRef = UploadedAssetRef & { kind: 'render'; bucket: 'portfolio-renders' };
export type UploadedSourceRef = UploadedAssetRef & { kind: 'bbmodel'; bucket: 'bbmodels' };
export type UploadedViewerRef = UploadedAssetRef & { kind: 'viewer'; bucket: 'viewer-models' };

export type CreationUploads = {
  renders: UploadedRenderRef[];
  bbmodel?: UploadedSourceRef;
  viewer?: UploadedViewerRef & { animationNames: string[] };
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BBMODEL_BYTES = 50 * 1024 * 1024;
const MAX_VIEWER_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif']);
const BBMODEL_TYPES = new Set(['application/json', 'application/octet-stream', 'text/plain']);
const LEGACY_VIEWER_TYPES = new Set(['model/gltf-binary', 'application/octet-stream']);
const PREVIEW_VIEWER_TYPES = new Set(['application/json', 'application/octet-stream']);
const UUID_SOURCE = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

function leafName(name: string): string {
  return name.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
}

function extension(name: string): string {
  return leafName(name).split('.').pop()?.toLowerCase() ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSafeFilename(filename: string): void {
  if (!filename || filename.length > 255 || filename.includes('\0')) {
    throw new Error('Invalid upload filename.');
  }
}

function validateImageMetadata(file: UploadRequestFile): void {
  const ext = extension(file.filename);
  if (!IMAGE_TYPES.has(file.contentType) || !IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported image file. Use PNG, JPEG, WebP or AVIF.');
  }
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Images must be 10 MiB or smaller.');
}

export function bucketForUploadKind(kind: UploadKind): ManagedUploadBucket {
  if (kind === 'render') return 'portfolio-renders';
  if (kind === 'bbmodel') return 'bbmodels';
  return 'viewer-models';
}

export function validateUploadRequestFile(file: UploadRequestFile): void {
  if (!file || typeof file !== 'object') throw new Error('Invalid upload metadata.');
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(file.clientKey)) throw new Error('Invalid upload client key.');
  if (!['render', 'bbmodel', 'viewer'].includes(file.kind)) throw new Error('Invalid upload kind.');
  assertSafeFilename(file.filename);
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('Invalid upload size.');
  if (typeof file.contentType !== 'string' || file.contentType.length > 150) throw new Error('Invalid upload content type.');

  if (file.kind === 'bbmodel') {
    if (!/\.bbmodel$/i.test(leafName(file.filename))) throw new Error('Blockbench source must use .bbmodel.');
    if (!BBMODEL_TYPES.has(file.contentType)) throw new Error('Invalid .bbmodel content type.');
    if (file.size > MAX_BBMODEL_BYTES) throw new Error('The .bbmodel file must be 50 MiB or smaller.');
    return;
  }

  if (file.kind === 'viewer') {
    const ext = extension(file.filename);
    const isLegacyGlb = ext === 'glb' && LEGACY_VIEWER_TYPES.has(file.contentType);
    const isBbPreview = ext === 'bbpreview' && PREVIEW_VIEWER_TYPES.has(file.contentType);
    if (!isLegacyGlb && !isBbPreview) {
      if (ext !== 'glb' && ext !== 'bbpreview') throw new Error('Viewer file must use .glb or .bbpreview.');
      throw new Error('Invalid viewer content type.');
    }
    if (file.size > MAX_VIEWER_BYTES) throw new Error('The viewer file must be 50 MiB or smaller.');
    return;
  }

  validateImageMetadata(file);
}

export function validateUploadedAssetRef(userId: string, ref: UploadedAssetRef): void {
  validateUploadRequestFile(ref);
  const expectedBucket = bucketForUploadKind(ref.kind);
  if (ref.bucket !== expectedBucket) throw new Error('Upload bucket does not match asset kind.');

  const expectedExtension = ref.kind === 'bbmodel'
    ? 'bbmodel'
    : ref.kind === 'viewer'
      ? extension(ref.filename)
      : extension(ref.filename) === 'jpeg' ? 'jpg' : extension(ref.filename);

  const suffix = ref.kind === 'bbmodel'
    ? `(?:-[A-Za-z0-9_-]+)?\\.${expectedExtension}`
    : `\\.${expectedExtension}`;
  const pathPattern = new RegExp(
    `^uploads/${escapeRegExp(userId)}/${UUID_SOURCE}/${UUID_SOURCE}${suffix}$`,
    'i',
  );
  if (!pathPattern.test(ref.path)) throw new Error('Invalid upload path for current admin.');
}
