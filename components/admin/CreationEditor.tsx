'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { AdminCreation, Creation, CreationInput } from '@/lib/creations/types';
import type {
  CreationUploads,
  UploadRequestFile,
  UploadedAssetRef,
  UploadedRenderRef,
  UploadedSourceRef,
  UploadedViewerRef,
} from '@/lib/admin/upload-contracts';
import {
  authorizeUploads,
  cleanupAuthorizedUploads,
  toUploadedAssetRef,
  uploadAuthorizedFile,
} from '@/lib/admin/direct-upload';
import { slugify } from '@/lib/utils/slug';
import { FeaturedControls } from './FeaturedControls';
import { ImageField } from './ImageField';
import { BbmodelField } from './BbmodelField';
import { ViewerStatus } from './ViewerStatus';

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

type SaveStage =
  | 'idle'
  | 'converting'
  | 'preparing'
  | 'uploading-source'
  | 'uploading-viewer'
  | 'uploading-renders'
  | 'finalizing';

function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function stageErrorMessage(stage: SaveStage, caught: unknown): string {
  const message = caught instanceof Error ? caught.message : 'Could not save this creation.';
  if (stage === 'converting') return `3D preview generation failed: ${message}`;
  if (stage === 'preparing') return `Could not prepare uploads: ${message}`;
  if (stage === 'uploading-source') return `Source upload failed: ${message}`;
  if (stage === 'uploading-viewer') return `Viewer upload failed: ${message}`;
  if (stage === 'uploading-renders') return `Render upload failed: ${message}`;
  return message;
}

function saveLabel(stage: SaveStage, progress: number | null, saving: boolean): string {
  const percent = progress === null ? '' : ` ${progress}%`;
  if (stage === 'converting') return 'Generating 3D preview…';
  if (stage === 'preparing') return 'Preparing upload…';
  if (stage === 'uploading-source') return `Uploading source…${percent}`;
  if (stage === 'uploading-viewer') return `Uploading viewer…${percent}`;
  if (stage === 'uploading-renders') return `Uploading renders…${percent}`;
  if (stage === 'finalizing' || saving) return 'Saving creation…';
  return 'Save creation';
}

type Props = {
  creation?: AdminCreation;
  categories: string[];
  onSaved?: (creation: Creation) => void;
  onCancel?: () => void;
};

export function CreationEditor({ creation, categories, onSaved, onCancel }: Props) {
  const [name, setName] = useState(creation?.name ?? '');
  const [slug, setSlug] = useState(creation?.slug ?? '');
  const [slugLocked, setSlugLocked] = useState(Boolean(creation));
  const [category, setCategory] = useState(creation?.category ?? '');
  const [tags, setTags] = useState(creation?.tags.join(', ') ?? '');
  const [description, setDescription] = useState(creation?.description ?? '');
  const [animations, setAnimations] = useState(creation?.animations.join(', ') ?? '');
  const [published, setPublished] = useState(creation?.published ?? true);
  const [featured, setFeatured] = useState(creation?.featured ?? false);
  const [featuredOrder, setFeaturedOrder] = useState<number | undefined>(creation?.featuredOrder);
  const [software, setSoftware] = useState(creation?.software ?? 'Blockbench');
  const [modelType, setModelType] = useState(creation?.modelType ?? '');
  const [version, setVersion] = useState(creation?.version ?? '');
  const [notes, setNotes] = useState(creation?.notes ?? '');
  const [createdAt, setCreatedAt] = useState(creation?.createdAt ?? new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [bbmodel, setBbmodel] = useState<File | null>(null);
  const [replaceCover, setReplaceCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewerStage, setViewerStage] = useState<SaveStage>('idle');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const datalistId = useMemo(() => `categories-${creation?.id ?? 'new'}`, [creation?.id]);

  function handleName(value: string) {
    setName(value);
    if (!slugLocked) setSlug(slugify(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setUploadProgress(null);

    const payload: CreationInput = {
      ...(creation ? { id: creation.id } : {}),
      slug,
      name,
      category,
      tags: splitList(tags),
      description,
      coverImage: creation?.coverImage ?? PLACEHOLDER,
      images: creation?.images ?? [],
      animations: splitList(animations),
      featured,
      ...(featured && featuredOrder !== undefined ? { featuredOrder } : {}),
      published,
      createdAt,
      ...(software.trim() ? { software: software.trim() } : {}),
      ...(modelType.trim() ? { modelType: modelType.trim() } : {}),
      ...(version.trim() ? { version: version.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    let currentStage: SaveStage = 'idle';
    const setStage = (stage: SaveStage) => {
      currentStage = stage;
      setViewerStage(stage);
      setUploadProgress(null);
    };
    const successfullyUploaded: UploadedAssetRef[] = [];
    let finalized = false;
    let finalizationStarted = false;

    try {
      let viewerArtifact: Awaited<ReturnType<typeof import('@/lib/viewer-v2/extract')['extractBbmodelPreview']>> | undefined;
      if (bbmodel) {
        setStage('converting');
        const { extractBbmodelPreview } = await import('@/lib/viewer-v2/extract');
        viewerArtifact = await extractBbmodelPreview(bbmodel);
      }

      const fileByKey = new Map<string, File>();
      const requests: UploadRequestFile[] = [];

      files.forEach((file, index) => {
        const clientKey = `render:${index}`;
        fileByKey.set(clientKey, file);
        requests.push({
          clientKey,
          kind: 'render',
          filename: file.name,
          size: file.size,
          contentType: file.type,
        });
      });

      if (bbmodel) {
        fileByKey.set('bbmodel', bbmodel);
        requests.push({
          clientKey: 'bbmodel',
          kind: 'bbmodel',
          filename: bbmodel.name,
          size: bbmodel.size,
          contentType: bbmodel.type || 'application/octet-stream',
        });
      }

      if (viewerArtifact) {
        fileByKey.set('viewer', viewerArtifact.file);
        requests.push({
          clientKey: 'viewer',
          kind: 'viewer',
          filename: viewerArtifact.file.name,
          size: viewerArtifact.file.size,
          contentType: viewerArtifact.file.type || 'application/json',
        });
      }

      let authorized = new Map<string, Awaited<ReturnType<typeof authorizeUploads>>['uploads'][number]>();
      if (requests.length > 0) {
        setStage('preparing');
        const authorization = await authorizeUploads(requests);
        authorized = new Map(authorization.uploads.map((item) => [item.clientKey, item] as const));
      }

      const uploadOne = async (clientKey: string, stage: SaveStage) => {
        const descriptor = authorized.get(clientKey);
        const file = fileByKey.get(clientKey);
        if (!descriptor || !file) throw new Error(`Missing upload authorization for ${clientKey}.`);
        setStage(stage);
        setUploadProgress(0);
        await uploadAuthorizedFile(descriptor, file, { onProgress: setUploadProgress });
        successfullyUploaded.push(toUploadedAssetRef(descriptor));
      };

      if (bbmodel) {
        await uploadOne('bbmodel', 'uploading-source');
        await uploadOne('viewer', 'uploading-viewer');
      }
      for (let index = 0; index < files.length; index += 1) {
        await uploadOne(`render:${index}`, 'uploading-renders');
      }

      const uploadedByKey = new Map(successfullyUploaded.map((ref) => [ref.clientKey, ref] as const));
      const renderRefs = files.map((_file, index) => {
        const ref = uploadedByKey.get(`render:${index}`);
        if (!ref) throw new Error(`Render upload render:${index} is incomplete.`);
        return ref as UploadedRenderRef;
      });
      const uploads: CreationUploads = { renders: renderRefs };

      if (bbmodel && viewerArtifact) {
        const sourceRef = uploadedByKey.get('bbmodel') as UploadedSourceRef | undefined;
        const viewerRef = uploadedByKey.get('viewer') as UploadedViewerRef | undefined;
        if (!sourceRef || !viewerRef) throw new Error('Source/viewer upload pair is incomplete.');
        uploads.bbmodel = sourceRef;
        uploads.viewer = { ...viewerRef, animationNames: viewerArtifact.animationNames };
      }

      setStage('finalizing');
      finalizationStarted = true;
      const response = await fetch('/api/admin/creations', {
        method: creation ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload,
          uploads,
          ...(creation ? { originalId: creation.id } : {}),
          ...(creation && replaceCover ? { replaceCover: true } : {}),
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: unknown; creation?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Could not save this creation.');
      }
      finalized = true;
      if (result.creation) onSaved?.(result.creation as Creation);
    } catch (caught) {
      if (!finalizationStarted && !finalized && successfullyUploaded.length > 0) {
        await cleanupAuthorizedUploads(successfullyUploaded).catch(() => undefined);
      }
      setError(stageErrorMessage(currentStage, caught));
    } finally {
      setViewerStage('idle');
      setUploadProgress(null);
      setSaving(false);
    }
  }

  return (
    <form className="admin-editor" onSubmit={handleSubmit}>
      <div className="admin-editor-heading">
        <div><span>{creation ? 'Edit creation' : 'New creation'}</span><h2>{creation?.name || 'Untitled model'}</h2></div>
        {onCancel && <button className="icon-button" type="button" onClick={onCancel} aria-label="Close editor">×</button>}
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <div className="admin-form-grid two">
        <label className="admin-field">
          <span>Name <b>*</b></span>
          <input required aria-label="Name" value={name} onChange={(event) => handleName(event.target.value)} placeholder="e.g. Vorakh" />
        </label>
        <label className="admin-field">
          <span>Slug</span>
          <input aria-label="Slug" value={slug} onChange={(event) => { setSlugLocked(true); setSlug(event.target.value); }} placeholder="auto-generated-from-name" />
        </label>
      </div>

      <div className="admin-form-grid two">
        <label className="admin-field">
          <span>Category <b>*</b></span>
          <input required aria-label="Category" list={datalistId} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Boss, NPC, Item..." />
          <datalist id={datalistId}>{categories.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className="admin-field"><span>Created</span><input type="date" value={createdAt} onChange={(event) => setCreatedAt(event.target.value)} /></label>
      </div>

      <label className="admin-field"><span>Tags <small>comma separated</small></span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Ice, Fantasy, Golem" /></label>
      <label className="admin-field"><span>Description</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the model, its role and visual direction..." /></label>

      <ImageField files={files} onChange={setFiles} existingImages={creation?.galleryImages ?? []} />

      {creation && files.length > 0 && (
        <label className="admin-check admin-cover-choice">
          <input type="checkbox" checked={replaceCover} onChange={(event) => setReplaceCover(event.target.checked)} />
          <span><strong>Use first new render as cover</strong><small>The current cover stays in the gallery.</small></span>
        </label>
      )}

      <BbmodelField
        creationId={creation?.id}
        existing={creation?.bbmodel}
        file={bbmodel}
        onChange={setBbmodel}
        onRemoved={() => window.location.reload()}
      />

      {creation?.id && creation.bbmodel && (
        <ViewerStatus
          creationId={creation.id}
          sourceFilename={creation.bbmodel.filename}
          status={creation.viewerStatus}
          error={creation.viewerError}
          animationCount={creation.viewer?.animationNames.length ?? 0}
          onRegenerated={() => window.location.reload()}
        />
      )}

      <label className="admin-field"><span>Animations <small>comma separated</small></span><input value={animations} onChange={(event) => setAnimations(event.target.value)} placeholder="Idle, Walk, Attack, Death" /></label>

      <div className="admin-options">
        <label className="admin-check">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          <span><strong>Published</strong><small>Visible on the public portfolio.</small></span>
        </label>
        <FeaturedControls featured={featured} featuredOrder={featuredOrder} onChange={(next) => { setFeatured(next.featured); setFeaturedOrder(next.featuredOrder); }} />
      </div>

      <div className="admin-form-grid three">
        <label className="admin-field"><span>Software</span><input value={software} onChange={(event) => setSoftware(event.target.value)} /></label>
        <label className="admin-field"><span>Model type</span><input value={modelType} onChange={(event) => setModelType(event.target.value)} placeholder="Entity / Item" /></label>
        <label className="admin-field"><span>Version</span><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Optional" /></label>
      </div>

      <label className="admin-field"><span>Project notes</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note shown on the project page." /></label>

      <div className="admin-editor-actions">
        {onCancel && <button className="admin-button secondary" type="button" onClick={onCancel}>Cancel</button>}
        <button className="admin-button primary" type="submit" disabled={saving}>{saveLabel(viewerStage, uploadProgress, saving)}</button>
      </div>
    </form>
  );
}
