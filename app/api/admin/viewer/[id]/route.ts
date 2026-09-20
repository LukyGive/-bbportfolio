import { getAdminContext } from '@/lib/auth/server';
import { recordViewerError, replaceRemoteViewer } from '@/lib/admin/remote';
import { validateViewerFile } from '@/lib/admin/files';

export const runtime = 'nodejs';

function parseAnimationNames(entry: FormDataEntryValue | null): string[] {
  if (typeof entry !== 'string' || !entry.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(entry); }
  catch { throw new Error('Invalid viewer animation metadata.'); }
  if (!Array.isArray(parsed) || parsed.some((name) => typeof name !== 'string')) {
    throw new Error('Invalid viewer animation metadata.');
  }
  return [...new Set(parsed.map((name) => name.trim()).filter(Boolean))];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('viewerModel');
    if (!(file instanceof File) || file.size <= 0) {
      return Response.json({ error: 'Viewer GLB is required.' }, { status: 400 });
    }
    validateViewerFile(file);
    const animationNames = parseAnimationNames(formData.get('viewerAnimationNames'));
    return Response.json({ ok: true, ...(await replaceRemoteViewer(context.client, id, { file, animationNames })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not regenerate viewer.';
    return Response.json({ error: message }, { status: /not found|no \.bbmodel/i.test(message) ? 404 : 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null) as { error?: unknown } | null;
    if (!body || typeof body.error !== 'string' || !body.error.trim()) {
      return Response.json({ error: 'Viewer error message is required.' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await recordViewerError(context.client, id, body.error.trim().slice(0, 500))) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save viewer error.';
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
