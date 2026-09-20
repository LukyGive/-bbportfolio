'use client';

import { useEffect, useMemo } from 'react';

type ImageFieldProps = {
  files: File[];
  onChange: (files: File[]) => void;
  existingImages?: string[];
};

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageField({ files, onChange, existingImages = [] }: ImageFieldProps) {
  const previews = useMemo(() => files.map((file) => ({
    file,
    url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '',
  })), [files]);

  useEffect(() => () => {
    for (const preview of previews) if (preview.url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(preview.url);
  }, [previews]);

  return (
    <div className="admin-images">
      <label className="admin-upload">
        <input
          aria-label="Add render images"
          type="file"
          accept="image/webp,image/png,image/jpeg,image/gif"
          multiple
          onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        />
        <span className="admin-upload-icon" aria-hidden="true">＋</span>
        <strong>Add render images</strong>
        <small>WebP, PNG, JPG or GIF · max 10 MB each</small>
      </label>

      {(existingImages.length > 0 || previews.length > 0) && (
        <div className="admin-image-list">
          {existingImages.map((image) => (
            <div className="admin-image-chip" key={image}>
              <span className="admin-image-thumb" aria-hidden="true" />
              <div><strong>{image.split('/').pop()}</strong><small>Already saved</small></div>
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
