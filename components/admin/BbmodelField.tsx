'use client';

import { useState } from 'react';

type Props = {
  creationId?: string;
  existing?: { filename: string; size: number };
  file: File | null;
  onChange: (file: File | null) => void;
  onRemoved?: () => void;
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BbmodelField({ creationId, existing, file, onChange, onRemoved }: Props) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');

  async function removeExisting() {
    if (!creationId || !existing || removing) return;
    setRemoving(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/bbmodel/${creationId}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not remove .bbmodel.');
      onRemoved?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not remove .bbmodel.');
      setRemoving(false);
    }
  }

  return (
    <div className="admin-source-field">
      <div className="admin-source-heading">
        <div><span>Blockbench source</span><small>Private · never shown publicly</small></div>
        <span className="admin-private-badge">🔒 PRIVATE</span>
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      {existing && creationId && (
        <div className="admin-source-current">
          <div><strong>{existing.filename}</strong><small>{formatSize(existing.size)}</small></div>
          <div className="admin-source-actions">
            <a className="admin-button secondary" href={`/api/admin/bbmodel/${creationId}`}>Download</a>
            <button className="admin-button secondary" type="button" disabled={removing} onClick={() => void removeExisting()}>
              {removing ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}

      <label className="admin-upload admin-source-upload">
        <input
          aria-label="Blockbench source"
          type="file"
          accept=".bbmodel"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <span className="admin-upload-icon" aria-hidden="true">＋</span>
        <strong>{existing ? 'Replace .bbmodel' : 'Add .bbmodel'}</strong>
        <small>One source file · max 50 MB</small>
      </label>

      {file && (
        <div className="admin-source-pending">
          <span>New source</span><strong>{file.name}</strong><small>{formatSize(file.size)}</small>
          <button type="button" className="text-link" onClick={() => onChange(null)}>Clear</button>
        </div>
      )}
    </div>
  );
}
