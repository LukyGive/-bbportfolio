'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminCreation } from '@/lib/creations/types';
import type { AdminPack } from '@/lib/packs/types';
import { CreationEditor } from './CreationEditor';
import { PackEditor } from './PackEditor';

type Props = {
  initialCreations: AdminCreation[];
  initialPacks: AdminPack[];
  categories: string[];
};

type Section = 'creations' | 'packs';
type EditorState =
  | { kind: 'creation'; mode: 'create' }
  | { kind: 'creation'; mode: 'edit'; creation: AdminCreation }
  | { kind: 'pack'; mode: 'create' }
  | { kind: 'pack'; mode: 'edit'; pack: AdminPack }
  | null;

export function AdminDashboard({ initialCreations, initialPacks, categories }: Props) {
  const [section, setSection] = useState<Section>('creations');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const visibleCreations = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialCreations;
    return initialCreations.filter((creation) => [creation.name, creation.category, ...creation.tags].join(' ').toLowerCase().includes(needle));
  }, [initialCreations, query]);

  const visiblePacks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialPacks;
    return initialPacks.filter((pack) => [pack.name, pack.slug, pack.description].join(' ').toLowerCase().includes(needle));
  }, [initialPacks, query]);

  function switchSection(next: Section) {
    setSection(next);
    setQuery('');
    setEditor(null);
    setConfirmDeleteId(null);
    setError('');
  }

  async function deleteCreation(creation: AdminCreation) {
    if (confirmDeleteId !== creation.id) {
      setConfirmDeleteId(creation.id);
      return;
    }
    setDeletingId(creation.id);
    setError('');
    try {
      const response = await fetch('/api/admin/creations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: creation.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not delete creation.');
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete creation.');
      setDeletingId(null);
    }
  }

  async function deletePack(pack: AdminPack) {
    if (confirmDeleteId !== pack.id) {
      setConfirmDeleteId(pack.id);
      return;
    }
    setDeletingId(pack.id);
    setError('');
    try {
      const response = await fetch('/api/admin/packs', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pack.id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not delete pack.');
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete pack.');
      setDeletingId(null);
    }
  }

  return (
    <div className="admin-dashboard">
      <aside className="admin-sidebar-panel">
        <div className="admin-title-row">
          <div><span className="admin-local-dot" /> PORTFOLIO ADMIN</div>
          <div className="admin-title-actions"><Link href="/" target="_blank">View site ↗</Link><form action="/auth/signout" method="post"><button type="submit" className="text-link">Sign out</button></form></div>
        </div>

        <div className="admin-section-tabs" role="group" aria-label="Admin section">
          <button className={`admin-section-tab ${section === 'creations' ? 'active' : ''}`} type="button" onClick={() => switchSection('creations')}>Creations</button>
          <button className={`admin-section-tab ${section === 'packs' ? 'active' : ''}`} type="button" onClick={() => switchSection('packs')}>Packs</button>
        </div>

        {section === 'creations' ? (
          <>
            <div className="admin-summary">
              <strong>{initialCreations.length}</strong><span>creations</span>
              <strong>{initialCreations.filter((item) => item.featured).length}</strong><span>featured</span>
            </div>
            <button className="admin-button primary wide" type="button" onClick={() => setEditor({ kind: 'creation', mode: 'create' })}>＋ New creation</button>
            <label className="admin-search">
              <span className="sr-only">Search admin creations</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creations..." />
            </label>
          </>
        ) : (
          <>
            <div className="admin-summary">
              <strong>{initialPacks.length}</strong><span>packs</span>
              <strong>{initialPacks.filter((item) => item.published).length}</strong><span>published</span>
            </div>
            <button className="admin-button primary wide" type="button" onClick={() => setEditor({ kind: 'pack', mode: 'create' })}>＋ New pack</button>
            <label className="admin-search">
              <span className="sr-only">Search admin packs</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search packs..." />
            </label>
          </>
        )}

        {error && <div className="admin-alert" role="alert">{error}</div>}

        <div className="admin-list">
          {section === 'creations' && visibleCreations.map((creation) => (
            <div className={`admin-list-item ${editor?.kind === 'creation' && editor.mode === 'edit' && editor.creation.id === creation.id ? 'active' : ''}`} key={creation.id}>
              <button className="admin-list-main" type="button" onClick={() => { setEditor({ kind: 'creation', mode: 'edit', creation }); setConfirmDeleteId(null); }}>
                <span className="admin-list-thumb">{creation.name.slice(0, 1).toUpperCase()}</span>
                <span><strong>{creation.name}</strong><small>{creation.category} · {creation.published ? 'Published' : 'Draft'}</small></span>
                <span className="admin-list-flags">{creation.bbmodel && <b title="Private .bbmodel attached">🔒</b>}{creation.featured && <i title="Featured" aria-label="Featured">★</i>}</span>
              </button>
              <button
                className={confirmDeleteId === creation.id ? 'admin-delete confirm' : 'admin-delete'}
                type="button"
                disabled={deletingId === creation.id}
                onClick={() => void deleteCreation(creation)}
                aria-label={confirmDeleteId === creation.id ? `Confirm delete ${creation.name}` : `Delete ${creation.name}`}
              >
                {deletingId === creation.id ? '…' : confirmDeleteId === creation.id ? 'Confirm' : 'Delete'}
              </button>
            </div>
          ))}

          {section === 'packs' && visiblePacks.map((pack) => (
            <div className={`admin-list-item ${editor?.kind === 'pack' && editor.mode === 'edit' && editor.pack.id === pack.id ? 'active' : ''}`} key={pack.id}>
              <button className="admin-list-main" type="button" onClick={() => { setEditor({ kind: 'pack', mode: 'edit', pack }); setConfirmDeleteId(null); }}>
                <span className="admin-list-thumb">{pack.name.slice(0, 1).toUpperCase()}</span>
                <span><strong>{pack.name}</strong><small>{pack.memberCount} {pack.memberCount === 1 ? 'model' : 'models'} · {pack.published ? 'Published' : 'Draft'}</small></span>
              </button>
              <button
                className={confirmDeleteId === pack.id ? 'admin-delete confirm' : 'admin-delete'}
                type="button"
                disabled={deletingId === pack.id}
                onClick={() => void deletePack(pack)}
                aria-label={confirmDeleteId === pack.id ? `Confirm delete ${pack.name}` : `Delete ${pack.name}`}
              >
                {deletingId === pack.id ? '…' : confirmDeleteId === pack.id ? 'Confirm' : 'Delete'}
              </button>
            </div>
          ))}

          {section === 'creations' && visibleCreations.length === 0 && <p className="admin-list-empty">No matching creations.</p>}
          {section === 'packs' && visiblePacks.length === 0 && <p className="admin-list-empty">No matching packs.</p>}
        </div>
      </aside>

      <section className="admin-workspace">
        {editor?.kind === 'creation' && editor.mode === 'create' && (
          <CreationEditor categories={categories} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}
        {editor?.kind === 'creation' && editor.mode === 'edit' && (
          <CreationEditor key={editor.creation.id} creation={editor.creation} categories={categories} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}
        {editor?.kind === 'pack' && editor.mode === 'create' && (
          <PackEditor creations={initialCreations} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}
        {editor?.kind === 'pack' && editor.mode === 'edit' && (
          <PackEditor key={editor.pack.id} pack={editor.pack} creations={initialCreations} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}

        {!editor && section === 'creations' && (
          <div className="admin-welcome">
            <span>PORTFOLIO MANAGER</span>
            <h1>Choose what<br />your visitors see.</h1>
            <p>Select a creation to edit it, or add a new model. Toggle <strong>Featured</strong> to curate the homepage manually.</p>
            <button className="admin-button primary" type="button" onClick={() => setEditor({ kind: 'creation', mode: 'create' })}>Create your next project</button>
          </div>
        )}

        {!editor && section === 'packs' && (
          <div className="admin-welcome">
            <span>PACK MANAGER</span>
            <h1>Build curated<br />collections.</h1>
            <p>Create a pack from existing models, choose their display order, and optionally add a dedicated cover.</p>
            <button className="admin-button primary" type="button" onClick={() => setEditor({ kind: 'pack', mode: 'create' })}>Create a new pack</button>
          </div>
        )}
      </section>
    </div>
  );
}
