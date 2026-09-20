import { getAdminContext } from '@/lib/auth/server';
import { getPrivateBbmodelSignedDownload, removeRemoteBbmodel } from '@/lib/admin/remote';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAdminContext();
  if (!context) return Response.json({ error: 'Unauthorized.' }, { status: 401 });

  try {
    const { id } = await params;
    const { url } = await getPrivateBbmodelSignedDownload(context.client, id);
    return Response.redirect(url, 302);
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
