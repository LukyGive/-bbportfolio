'use client';

import { FormEvent, useMemo, useState } from 'react';
import type { Creation, CreationInput } from '@/lib/creations/types';
import { slugify } from '@/lib/utils/slug';
import { FeaturedControls } from './FeaturedControls';
import { ImageField } from './ImageField';

const PLACEHOLDER = '/models/_placeholder/creation-placeholder.svg';

function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

type Props = {
  creation?: Creation;
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
  const [saving, setSaving] = useState(false);
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

    const formData = new FormData();
    formData.set('payload', JSON.stringify(payload));
    if (creation) formData.set('originalId', creation.id);
    for (const image of files) formData.append('images', image);

    try {
      const response = await fetch('/api/admin/creations', {
        method: creation ? 'PUT' : 'POST',
        body: formData,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save this creation.');
      if (result.creation) onSaved?.(result.creation as Creation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this creation.');
    } finally {
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
          <input
            aria-label="Slug"
            value={slug}
            onChange={(event) => { setSlugLocked(true); setSlug(event.target.value); }}
            placeholder="auto-generated-from-name"
          />
        </label>
      </div>

      <div className="admin-form-grid two">
        <label className="admin-field">
          <span>Category <b>*</b></span>
          <input required aria-label="Category" list={datalistId} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Boss, NPC, Item..." />
          <datalist id={datalistId}>{categories.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className="admin-field">
          <span>Created</span>
          <input type="date" value={createdAt} onChange={(event) => setCreatedAt(event.target.value)} />
        </label>
      </div>

      <label className="admin-field">
        <span>Tags <small>comma separated</small></span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Ice, Fantasy, Golem" />
      </label>

      <label className="admin-field">
        <span>Description</span>
        <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the model, its role and visual direction..." />
      </label>

      <ImageField
        files={files}
        onChange={setFiles}
        existingImages={creation ? [...new Set([creation.coverImage, ...creation.images])].filter((image) => image !== PLACEHOLDER) : []}
      />

      <label className="admin-field">
        <span>Animations <small>comma separated</small></span>
        <input value={animations} onChange={(event) => setAnimations(event.target.value)} placeholder="Idle, Walk, Attack, Death" />
      </label>

      <div className="admin-options">
        <label className="admin-check">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          <span><strong>Published</strong><small>Visible on the public portfolio.</small></span>
        </label>
        <FeaturedControls
          featured={featured}
          featuredOrder={featuredOrder}
          onChange={(next) => { setFeatured(next.featured); setFeaturedOrder(next.featuredOrder); }}
        />
      </div>

      <div className="admin-form-grid three">
        <label className="admin-field"><span>Software</span><input value={software} onChange={(event) => setSoftware(event.target.value)} /></label>
        <label className="admin-field"><span>Model type</span><input value={modelType} onChange={(event) => setModelType(event.target.value)} placeholder="Entity / Item" /></label>
        <label className="admin-field"><span>Version</span><input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="Optional" /></label>
      </div>

      <label className="admin-field">
        <span>Project notes</span>
        <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note shown on the project page." />
      </label>

      <div className="admin-editor-actions">
        {onCancel && <button className="admin-button secondary" type="button" onClick={onCancel}>Cancel</button>}
        <button className="admin-button primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save creation'}</button>
      </div>
    </form>
  );
}
