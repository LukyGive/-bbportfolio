'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AdminGalleryImage } from '@/lib/creations/types';

type ImageFieldProps = {
  files: File[];
  onChange: (files: File[]) => void;
  existingImages?: AdminGalleryImage[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageField({ files, onChange, existingImages = [] }: ImageFieldProps) {
  const [savedImages, setSavedImages] = useState(existingImages);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const previews = useMemo(() => files.map((file) => ({
    file,
    url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
  })), [files]);

  useEffect(() => () => {
    for (const preview of previews) if (preview.url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(preview.url);
  }, [previews]);

  async function mutateSavedImage(id: string, method: 'PATCH' | 'DELETE', direction?: 'up' | 'down') {
    if (busyId) return;
    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/images/${id}`, {
        method,
        ...(direction ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ direction }),
        } : {}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not update gallery.');
      if (Array.isArray(result.images)) setSavedImages(result.images as AdminGalleryImage[]);
      if (result.cleanupWarning) setError(`Image removed, but cleanup needs attention: ${result.cleanupWarning}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update gallery.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-images">
      <label className="admin-upload">
        <input
          aria-label="Add render images"
          type="file"
          accept="image/webp,image/png,image/jpeg,image/avif"
          multiple
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
        <span className="admin-upload-icon" aria-hidden="true">＋</span>
        <strong>Add render images</strong>
        <small>WebP, PNG, JPG or AVIF · max 10 MB each</small>
      </label>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      {(savedImages.length > 0 || previews.length > 0) && (
        <div className="admin-image-list">
          {savedImages.map((image, index) => (
            <div className="admin-image-chip admin-image-managed" key={image.id}>
              <img src={image.url} alt={image.altText || ''} />
              <div><strong>Saved render {index + 1}</strong><small>Gallery position {index + 1}</small></div>
              <div className="admin-image-actions">
                <button type="button" className="text-link" disabled={busyId === image.id || index === 0} onClick={() => void mutateSavedImage(image.id, 'PATCH', 'up')}>↑</button>
                <button type="button" className="text-link" disabled={busyId === image.id || index === savedImages.length - 1} onClick={() => void mutateSavedImage(image.id, 'PATCH', 'down')}>↓</button>
                <button type="button" className="text-link danger" disabled={busyId === image.id} onClick={() => void mutateSavedImage(image.id, 'DELETE')}>{busyId === image.id ? '…' : 'Remove'}</button>
              </div>
            </div>
          ))}
          {previews.map(({ file, url }) => (
            <div className="admin-image-chip" key={`${file.name}-${file.lastModified}`}>
              {url ? <img src={url} alt="" /> : <span className="admin-image-thumb" aria-hidden="true" />}
              <div><strong>{file.name}</strong><small>{formatSize(file.size)}</small></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
