import { getAdminContext } from '@/lib/auth/server';
import { cleanupUploadedRefs } from '@/lib/admin/files';
import type { UploadedAssetRef } from '@/lib/admin/upload-contracts';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  const body = await request.json().catch(() => null) as { uploads?: unknown } | null;
  if (!body || !Array.isArray(body.uploads) || body.uploads.length > 22) {
    return Response.json({ error: 'Invalid cleanup upload list.' }, { status: 400 });
  }

  try {
    const warnings = await cleanupUploadedRefs(
      context.client as never,
      context.userId,
      body.uploads as UploadedAssetRef[],
    );
    return Response.json({ ok: true, warnings });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not clean up uploads.' },
      { status: 400 },
    );
  }
}
