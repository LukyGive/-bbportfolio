'use client';

import { useState } from 'react';
import type { ViewerStatus as ViewerStatusValue } from '@/lib/creations/types';
import {
  authorizeUploads,
  cleanupAuthorizedUploads,
  toUploadedAssetRef,
  uploadAuthorizedFile,
} from '@/lib/admin/direct-upload';

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
  const [progress, setProgress] = useState<number | null>(null);
  const [localError, setLocalError] = useState('');

  async function regenerate() {
    if (working) return;
    setWorking(true);
    setProgress(null);
    setLocalError('');
    let uploadedViewer: ReturnType<typeof toUploadedAssetRef> | undefined;
    let finalizationStarted = false;

    try {
      const sourceResponse = await fetch(`/api/admin/bbmodel/${creationId}`);
      if (!sourceResponse.ok) throw new Error('Could not load private Blockbench source.');
      const source = new File([await sourceResponse.blob()], sourceFilename, { type: 'application/json' });
      const { convertBbmodelToViewer } = await import('@/lib/viewer/convert');
      const artifact = await convertBbmodelToViewer(source);

      const authorization = await authorizeUploads([{
        clientKey: 'viewer',
        kind: 'viewer',
        filename: artifact.file.name,
        size: artifact.file.size,
        contentType: 'model/gltf-binary',
      }]);
      const descriptor = authorization.uploads.find((item) => item.clientKey === 'viewer');
      if (!descriptor) throw new Error('Viewer upload authorization is missing.');

      setProgress(0);
      await uploadAuthorizedFile(descriptor, artifact.file, { onProgress: setProgress });
      uploadedViewer = toUploadedAssetRef(descriptor);

      finalizationStarted = true;
      const response = await fetch(`/api/admin/viewer/${creationId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          viewer: { ...uploadedViewer, animationNames: artifact.animationNames },
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not regenerate viewer.');
      }
      uploadedViewer = undefined;
      onRegenerated?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not regenerate viewer.';
      setLocalError(message);
      if (uploadedViewer && !finalizationStarted) {
        await cleanupAuthorizedUploads([uploadedViewer]).catch(() => undefined);
      }
      await fetch(`/api/admin/viewer/${creationId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: message }),
      }).catch(() => undefined);
    } finally {
      setProgress(null);
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
        {working ? (progress === null ? 'Generating…' : `Uploading… ${progress}%`) : 'Regenerate viewer'}
      </button>
    </div>
  );
}
