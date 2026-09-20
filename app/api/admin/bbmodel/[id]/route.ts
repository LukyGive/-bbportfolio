import { getAdminContext } from '@/lib/auth/server';
import { getPrivateBbmodel, removeRemoteBbmodel } from '@/lib/admin/remote';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const { blob, filename } = await getPrivateBbmodel(context.client, id);
    const safeAscii = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    return new Response(blob, {
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not download .bbmodel.';
    const status = /not found|no \.bbmodel/i.test(message) ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    return Response.json({ ok: true, ...(await removeRemoteBbmodel(context.client, id)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove .bbmodel.';
    return Response.json({ error: message }, { status: /not found/i.test(message) ? 404 : 500 });
  }
}
