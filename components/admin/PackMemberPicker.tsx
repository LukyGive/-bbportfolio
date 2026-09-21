'use client';

import { useMemo, useState } from 'react';
import type { AdminCreation } from '@/lib/creations/types';

type Props = {
  creations: AdminCreation[];
  value: string[];
  onChange: (orderedIds: string[]) => void;
};

export function PackMemberPicker({ creations, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const byId = useMemo(() => new Map(creations.map((creation) => [creation.id, creation] as const)), [creations]);
  const selectedSet = useMemo(() => new Set(value), [value]);

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return creations.filter((creation) => {
      if (selectedSet.has(creation.id)) return false;
      if (!needle) return true;
      return [creation.name, creation.category, ...creation.tags].join(' ').toLowerCase().includes(needle);
    });
  }, [creations, query, selectedSet]);

  const add = (id: string) => {
    if (!value.includes(id)) onChange([...value, id]);
  };
  const remove = (id: string) => onChange(value.filter((memberId) => memberId !== id));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [member] = next.splice(from, 1);
    next.splice(to, 0, member);
    onChange(next);
  };

  return (
    <div className="pack-picker">
      <label className="admin-field pack-picker-search">
        <span>Pack contents</span>
        <input
          type="search"
          aria-label="Search creations for pack"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search creations to add..."
        />
      </label>

      <div className="pack-picker-columns">
        <section className="pack-picker-panel" aria-label="Available creations">
          <header>Available creations</header>
          <div className="pack-picker-list">
            {available.map((creation) => (
              <div className="pack-picker-row" key={creation.id}>
                <div className="pack-picker-row-main">
                  <strong>{creation.name}</strong>
                  <small>{creation.category} · {creation.published ? 'Published' : 'Draft'}</small>
                </div>
                <button
                  type="button"
                  className="pack-picker-action"
                  onClick={() => add(creation.id)}
                  aria-label={`Add ${creation.name}`}
                >Add</button>
              </div>
            ))}
            {available.length === 0 && <div className="pack-picker-empty">No available creations match.</div>}
          </div>
        </section>

        <section className="pack-picker-panel" aria-label="Selected creations">
          <header>Selected · drag or use arrows</header>
          <div className="pack-picker-list">
            {value.map((id, index) => {
              const creation = byId.get(id);
              if (!creation) return null;
              return (
                <div
                  className="pack-picker-row"
                  key={id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const rawFrom = event.dataTransfer.getData('text/plain');
                    if (!/^\d+$/.test(rawFrom)) return;
                    const from = Number(rawFrom);
                    if (Number.isInteger(from)) move(from, index);
                  }}
                >
                  <span className="pack-picker-handle" aria-hidden="true">≡</span>
                  <div className="pack-picker-row-main">
                    <strong>{creation.name}</strong>
                    <small>{creation.category} · position {index + 1}</small>
                  </div>
                  <div className="pack-picker-controls">
                    <button type="button" className="pack-picker-action" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label={`Move ${creation.name} up`}>↑</button>
                    <button type="button" className="pack-picker-action" disabled={index === value.length - 1} onClick={() => move(index, index + 1)} aria-label={`Move ${creation.name} down`}>↓</button>
                    <button type="button" className="pack-picker-action" onClick={() => remove(id)} aria-label={`Remove ${creation.name}`}>×</button>
                  </div>
                </div>
              );
            })}
            {value.length === 0 && <div className="pack-picker-empty">No creations selected yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
