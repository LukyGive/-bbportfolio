'use client';

import { useMemo, useState } from 'react';
import type { Creation } from '@/lib/creations/types';
import { CreationGallery } from './CreationGallery';

export function filterCreations(creations: Creation[], category: string, query: string): Creation[] {
  const needle = query.trim().toLowerCase();
  return creations.filter((creation) => {
    const matchesCategory = category === 'All' || creation.category === category;
    const haystack = [creation.name, ...creation.tags].join(' ').toLowerCase();
    return matchesCategory && haystack.includes(needle);
  });
}

type GalleryClientProps = {
  creations: Creation[];
  categories: string[];
  initialCategory: string;
};

export function GalleryClient({ creations, categories, initialCategory }: GalleryClientProps) {
  const safeInitial = categories.includes(initialCategory) ? initialCategory : 'All';
  const [category, setCategory] = useState(safeInitial);
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () => filterCreations(creations, category, query),
    [creations, category, query],
  );

  return (
    <div className="gallery-browser">
      <div className="gallery-toolbar">
        <div className="filter-scroll" aria-label="Creation categories">
          {['All', ...categories].map((item) => (
            <button
              key={item}
              type="button"
              className={category === item ? 'filter-pill active' : 'filter-pill'}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label className="search-field">
          <span className="sr-only">Search creations</span>
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models or tags..."
          />
        </label>
      </div>
      <div className="gallery-count"><span>{String(visible.length).padStart(2, '0')}</span> creations</div>
      <CreationGallery creations={visible} />
    </div>
  );
}
