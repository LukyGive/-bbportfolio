'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminCreation } from '@/lib/creations/types';
import { CreationEditor } from './CreationEditor';

type Props = { initialCreations: AdminCreation[]; categories: string[] };

type EditorState = { mode: 'create' } | { mode: 'edit'; creation: AdminCreation } | null;

export function AdminDashboard({ initialCreations, categories }: Props) {
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return initialCreations;
    return initialCreations.filter((creation) => [creation.name, creation.category, ...creation.tags].join(' ').toLowerCase().includes(needle));
  }, [initialCreations, query]);

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

  return (
    <div className="admin-dashboard">
      <aside className="admin-sidebar-panel">
        <div className="admin-title-row">
          <div><span className="admin-local-dot" /> PORTFOLIO ADMIN</div>
          <div className="admin-title-actions"><Link href="/" target="_blank">View site ↗</Link><form action="/auth/signout" method="post"><button type="submit" className="text-link">Sign out</button></form></div>
        </div>
        <div className="admin-summary">
          <strong>{initialCreations.length}</strong><span>creations</span>
          <strong>{initialCreations.filter((item) => item.featured).length}</strong><span>featured</span>
        </div>
        <button className="admin-button primary wide" type="button" onClick={() => setEditor({ mode: 'create' })}>＋ New creation</button>
        <label className="admin-search">
          <span className="sr-only">Search admin creations</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creations..." />
        </label>

        {error && <div className="admin-alert" role="alert">{error}</div>}

        <div className="admin-list">
          {visible.map((creation) => (
            <div className={`admin-list-item ${editor?.mode === 'edit' && editor.creation.id === creation.id ? 'active' : ''}`} key={creation.id}>
              <button className="admin-list-main" type="button" onClick={() => { setEditor({ mode: 'edit', creation }); setConfirmDeleteId(null); }}>
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
          {visible.length === 0 && <p className="admin-list-empty">No matching creations.</p>}
        </div>
      </aside>

      <section className="admin-workspace">
        {editor?.mode === 'create' && (
          <CreationEditor categories={categories} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}
        {editor?.mode === 'edit' && (
          <CreationEditor key={editor.creation.id} creation={editor.creation} categories={categories} onCancel={() => setEditor(null)} onSaved={() => window.location.reload()} />
        )}
        {!editor && (
          <div className="admin-welcome">
            <span>PORTFOLIO MANAGER</span>
            <h1>Choose what<br />your visitors see.</h1>
            <p>Select a creation to edit it, or add a new model. Toggle <strong>Featured</strong> to curate the homepage manually.</p>
            <button className="admin-button primary" type="button" onClick={() => setEditor({ mode: 'create' })}>Create your next project</button>
          </div>
        )}
      </section>
    </div>
  );
}
