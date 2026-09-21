'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import type { AdminCreation } from '@/lib/creations/types';
import type { AdminPack, PackInput } from '@/lib/packs/types';
import type { UploadRequestFile, UploadedAssetRef, UploadedRenderRef } from '@/lib/admin/upload-contracts';
import {
  authorizeUploads,
  cleanupAuthorizedUploads,
  toUploadedAssetRef,
  uploadAuthorizedFile,
} from '@/lib/admin/direct-upload';
import { slugify } from '@/lib/utils/slug';
import { PackMemberPicker } from './PackMemberPicker';

type SaveStage = 'idle' | 'preparing' | 'uploading' | 'finalizing';

type Props = {
  pack?: AdminPack;
  creations: AdminCreation[];
  onSaved?: (pack: AdminPack) => void;
  onCancel?: () => void;
};

function saveLabel(stage: SaveStage, progress: number | null, saving: boolean): string {
  if (stage === 'preparing') return 'Preparing cover upload…';
  if (stage === 'uploading') return `Uploading cover…${progress === null ? '' : ` ${progress}%`}`;
  if (stage === 'finalizing' || saving) return 'Saving pack…';
  return 'Save pack';
}

export function PackEditor({ pack, creations, onSaved, onCancel }: Props) {
  const [name, setName] = useState(pack?.name ?? '');
  const [slug, setSlug] = useState(pack?.slug ?? '');
  const [slugLocked, setSlugLocked] = useState(Boolean(pack));
  const [description, setDescription] = useState(pack?.description ?? '');
  const [published, setPublished] = useState(pack?.published ?? true);
  const [orderedCreationIds, setOrderedCreationIds] = useState<string[]>(pack?.orderedCreationIds ?? []);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<SaveStage>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  function handleName(value: string) {
    setName(value);
    if (!slugLocked) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setProgress(null);

    const payload: PackInput = {
      slug,
      name,
      description,
      published,
      orderedCreationIds,
    };

    const successfullyUploaded: UploadedAssetRef[] = [];
    let finalizationStarted = false;

    try {
      let coverRef: UploadedRenderRef | undefined;
      if (coverFile) {
        const request: UploadRequestFile = {
          clientKey: 'pack-cover',
          kind: 'render',
          filename: coverFile.name,
          size: coverFile.size,
          contentType: coverFile.type,
        };
        setStage('preparing');
        const authorization = await authorizeUploads([request]);
        const descriptor = authorization.uploads.find((item) => item.clientKey === 'pack-cover');
        if (!descriptor) throw new Error('Missing cover upload authorization.');

        setStage('uploading');
        setProgress(0);
        await uploadAuthorizedFile(descriptor, coverFile, { onProgress: setProgress });
        const uploaded = toUploadedAssetRef(descriptor);
        successfullyUploaded.push(uploaded);
        coverRef = uploaded as UploadedRenderRef;
      }

      setStage('finalizing');
      setProgress(null);
      finalizationStarted = true;
      const response = await fetch('/api/admin/packs', {
        method: pack ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload,
          ...(coverRef ? { uploads: { cover: coverRef } } : {}),
          ...(pack ? { originalId: pack.id } : {}),
          ...(pack && removeCover && !coverRef ? { removeCover: true } : {}),
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: unknown; pack?: unknown };
      if (!response.ok) {
        // A concrete 4xx response proves finalization did not succeed. Clean the
        // just-uploaded cover even when validation failed before the remote
        // mutation helper had a chance to see it. Keep 5xx/network failures
        // untouched because the database outcome may be ambiguous.
        if (response.status < 500 && coverRef) {
          await cleanupAuthorizedUploads([coverRef]).catch(() => undefined);
        }
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not save this pack.');
      }
      if (result.pack) onSaved?.(result.pack as AdminPack);
    } catch (caught) {
      if (!finalizationStarted && successfullyUploaded.length > 0) {
        await cleanupAuthorizedUploads(successfullyUploaded).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : 'Could not save this pack.');
    } finally {
      setStage('idle');
      setProgress(null);
      setSaving(false);
    }
  }

  return (
    <form className="admin-editor" onSubmit={handleSubmit}>
      <div className="admin-editor-heading">
        <div><span>{pack ? 'Edit pack' : 'New pack'}</span><h2>{pack?.name || 'Untitled pack'}</h2></div>
        {onCancel && <button className="icon-button" type="button" onClick={onCancel} aria-label="Close editor">×</button>}
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <div className="admin-form-grid two">
        <label className="admin-field">
          <span>Name <b>*</b></span>
          <input required aria-label="Name" value={name} onChange={(event) => handleName(event.target.value)} placeholder="e.g. Sakura Pack" />
        </label>
        <label className="admin-field">
          <span>Slug</span>
          <input aria-label="Slug" value={slug} onChange={(event) => { setSlugLocked(true); setSlug(event.target.value); }} placeholder="auto-generated-from-name" />
        </label>
      </div>

      <label className="admin-field">
        <span>Description</span>
        <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the complete collection..." />
      </label>

      <div className="pack-cover-field">
        <label className="admin-field">
          <span>Pack cover <small>optional — otherwise automatic mosaic</small></span>
          <input
            aria-label="Pack cover"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setCoverFile(next);
              if (next) setRemoveCover(false);
            }}
          />
        </label>
        {coverFile && <div className="admin-file-note">New cover: <strong>{coverFile.name}</strong></div>}
        {!coverFile && pack?.coverImage && !removeCover && (
          <div className="pack-cover-preview">
            <Image src={pack.coverImage} alt={`${pack.name} current cover`} fill sizes="460px" />
          </div>
        )}
        {pack?.coverImage && (
          <label className="admin-check">
            <input
              type="checkbox"
              checked={removeCover}
              disabled={Boolean(coverFile)}
              onChange={(event) => setRemoveCover(event.target.checked)}
            />
            <span><strong>Remove current cover and use automatic mosaic</strong><small>Only applies when no new cover is selected.</small></span>
          </label>
        )}
      </div>

      <PackMemberPicker creations={creations} value={orderedCreationIds} onChange={setOrderedCreationIds} />

      <div className="admin-options">
        <label className="admin-check">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          <span><strong>Published</strong><small>Visible on the public Packs page. Draft member creations remain hidden publicly.</small></span>
        </label>
      </div>

      <div className="admin-editor-actions">
        {onCancel && <button className="admin-button secondary" type="button" onClick={onCancel}>Cancel</button>}
        <button className="admin-button primary" type="submit" disabled={saving}>{saveLabel(stage, progress, saving)}</button>
      </div>
    </form>
  );
}
