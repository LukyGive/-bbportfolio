'use client';

import { useState } from 'react';
import type { ViewerStatus as ViewerStatusValue } from '@/lib/creations/types';

type Props = {
  creationId: string;
  sourceFilename: string;
  status: ViewerStatusValue;
  error?: string;
  animationCount: number;
  onRegenerated?: () => void;
};

export function ViewerStatus({
  creationId,
  sourceFilename,
  status,
  error,
  animationCount,
  onRegenerated,
}: Props) {
  const [working, setWorking] = useState(false);
  const [localError, setLocalError] = useState('');

  async function regenerate() {
    if (working) return;
    setWorking(true);
    setLocalError('');
    try {
      const sourceResponse = await fetch(`/api/admin/bbmodel/${creationId}`);
      if (!sourceResponse.ok) throw new Error('Could not load private Blockbench source.');
      const source = new File([await sourceResponse.blob()], sourceFilename, { type: 'application/json' });
      const { convertBbmodelToViewer } = await import('@/lib/viewer/convert');
      const artifact = await convertBbmodelToViewer(source);

      const body = new FormData();
      body.set('viewerModel', artifact.file);
      body.set('viewerAnimationNames', JSON.stringify(artifact.animationNames));
      const response = await fetch(`/api/admin/viewer/${creationId}`, { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not regenerate viewer.');
      onRegenerated?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not regenerate viewer.';
      setLocalError(message);
      await fetch(`/api/admin/viewer/${creationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: message }),
      }).catch(() => undefined);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="admin-viewer-status">
      <div>
        {status === 'ready' && <strong>✓ 3D viewer generated</strong>}
        {status === 'processing' && <strong>Generating 3D viewer…</strong>}
        {status === 'error' && <strong>Viewer conversion failed</strong>}
        {status === 'none' && <strong>No 3D viewer generated</strong>}
        {status === 'ready' && <small>{animationCount} {animationCount === 1 ? 'animation' : 'animations'}</small>}
        {(localError || error) && <small className="admin-viewer-error">{localError || error}</small>}
      </div>
      <button className="admin-button secondary" type="button" disabled={working} onClick={() => void regenerate()}>
        {working ? 'Generating…' : 'Regenerate viewer'}
      </button>
    </div>
  );
}
