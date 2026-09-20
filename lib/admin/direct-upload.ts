'use client';

import type {
  AuthorizedUpload,
  UploadRequestFile,
  UploadedAssetRef,
} from './upload-contracts';

const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;


export function tusUploadFingerprint(descriptor: AuthorizedUpload, file: File): Promise<string> {
  return Promise.resolve([
    'bbportfolio-tus',
    descriptor.path,
    file.name,
    file.type,
    file.size,
    file.lastModified,
  ].join('::'));
}

type TransportOptions = {
  onProgress?: (uploaded: number, total: number) => void;
  signal?: AbortSignal;
};

type UploadFunction = (
  descriptor: AuthorizedUpload,
  file: File,
  options: TransportOptions,
) => Promise<void>;

type UploadAuthorizedFileOptions = {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
  standardUpload?: UploadFunction;
  resumableUpload?: UploadFunction;
};

export async function authorizeUploads(files: UploadRequestFile[]): Promise<{
  sessionId: string;
  uploads: AuthorizedUpload[];
}> {
  const response = await fetch('/api/admin/uploads/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  const result = await response.json().catch(() => ({})) as {
    sessionId?: unknown;
    uploads?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Could not prepare uploads.');
  }
  if (typeof result.sessionId !== 'string' || !Array.isArray(result.uploads)) {
    throw new Error('Upload authorization response is invalid.');
  }
  return { sessionId: result.sessionId, uploads: result.uploads as AuthorizedUpload[] };
}

async function defaultStandardUpload(
  descriptor: AuthorizedUpload,
  file: File,
  options: TransportOptions,
): Promise<void> {
  if (options.signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');
  const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
  const client = createBrowserSupabaseClient();
  options.onProgress?.(0, file.size);
  const { error } = await client.storage
    .from(descriptor.bucket)
    .uploadToSignedUrl(descriptor.path, descriptor.token, file, {
      contentType: descriptor.contentType || file.type || 'application/octet-stream',
      ...(descriptor.cacheControl ? { cacheControl: descriptor.cacheControl } : {}),
    });
  if (error) throw new Error(error.message || `Could not upload ${descriptor.kind}.`);
  options.onProgress?.(file.size, file.size);
}

async function defaultResumableUpload(
  descriptor: AuthorizedUpload,
  file: File,
  options: TransportOptions,
): Promise<void> {
  const [{ Upload }, { getSupabasePublicEnv }] = await Promise.all([
    import('tus-js-client'),
    import('@/lib/supabase/env'),
  ]);
  const { url } = getSupabasePublicEnv();
  const projectRef = new URL(url).hostname.split('.')[0];
  if (!projectRef) throw new Error('Could not determine Supabase project reference.');

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const upload = new Upload(file, {
      endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { 'x-signature': descriptor.token },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      fingerprint: (input) => tusUploadFingerprint(descriptor, input as File),
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: descriptor.bucket,
        objectName: descriptor.path,
        contentType: descriptor.contentType || file.type || 'application/octet-stream',
        cacheControl: descriptor.cacheControl ?? '3600',
      },
      onProgress: (uploaded: number, total: number) => options.onProgress?.(uploaded, total),
      onError: finishReject,
      onSuccess: finishResolve,
    });

    const abort = () => {
      void upload.abort().finally(() => finishReject(new DOMException('Upload cancelled.', 'AbortError')));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });

    void upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
      upload.start();
    }).catch(finishReject);
  });
}

export async function uploadAuthorizedFile(
  descriptor: AuthorizedUpload,
  file: File,
  options: UploadAuthorizedFileOptions = {},
): Promise<void> {
  if (file.size !== descriptor.size) throw new Error('Upload file size does not match its authorization.');
  if (options.signal?.aborted) throw new DOMException('Upload cancelled.', 'AbortError');

  const report = (uploaded: number, total: number) => {
    if (total <= 0) return;
    options.onProgress?.(Math.max(0, Math.min(100, Math.round((uploaded / total) * 100))));
  };
  const transportOptions: TransportOptions = { onProgress: report, signal: options.signal };

  if (file.size > RESUMABLE_THRESHOLD) {
    await (options.resumableUpload ?? defaultResumableUpload)(descriptor, file, transportOptions);
  } else {
    await (options.standardUpload ?? defaultStandardUpload)(descriptor, file, transportOptions);
  }
}

export function toUploadedAssetRef(descriptor: AuthorizedUpload): UploadedAssetRef {
  return {
    clientKey: descriptor.clientKey,
    kind: descriptor.kind,
    filename: descriptor.filename,
    size: descriptor.size,
    contentType: descriptor.contentType,
    bucket: descriptor.bucket,
    path: descriptor.path,
  };
}

export async function cleanupAuthorizedUploads(refs: UploadedAssetRef[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const response = await fetch('/api/admin/uploads/cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uploads: refs }),
  });
  const result = await response.json().catch(() => ({})) as { error?: unknown; warnings?: unknown };
  if (!response.ok) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Could not clean up uploads.');
  }
  return Array.isArray(result.warnings)
    ? result.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];
}
