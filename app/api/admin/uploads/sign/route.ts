import { getAdminContext } from '@/lib/auth/server';
import { authorizeUploadBatch } from '@/lib/admin/files';
import type { UploadRequestFile } from '@/lib/admin/upload-contracts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { files?: unknown } | null;
  if (!body || !Array.isArray(body.files)) {
    return Response.json({ error: 'Upload files are required.' }, { status: 400 });
  }

  try {
    const result = await authorizeUploadBatch(
      context.client as never,
      context.userId,
      body.files as UploadRequestFile[],
    );
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not authorize uploads.' },
      { status: 400 },
    );
  }
}
