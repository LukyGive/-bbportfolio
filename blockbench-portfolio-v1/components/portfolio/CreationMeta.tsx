import type { Creation } from '@/lib/creations/types';

export function CreationMeta({ creation }: { creation: Creation }) {
  const technical = [
    ['Software', creation.software],
    ['Model type', creation.modelType],
    ['Version', creation.version],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <aside className="detail-sidebar">
      <div className="meta-block">
        <span className="meta-label">Category</span>
        <strong>{creation.category}</strong>
      </div>
      {creation.tags.length > 0 && (
        <div className="meta-block">
          <span className="meta-label">Tags</span>
          <div className="tag-list">{creation.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
      )}
      {creation.animations.length > 0 && (
        <div className="meta-block">
          <span className="meta-label">Animations</span>
          <ul className="animation-list">{creation.animations.map((animation) => <li key={animation}>{animation}</li>)}</ul>
        </div>
      )}
      {technical.length > 0 && (
        <div className="meta-block technical-list">
          <span className="meta-label">Technical</span>
          {technical.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      )}
      {creation.notes && (
        <div className="meta-block">
          <span className="meta-label">Notes</span>
          <p>{creation.notes}</p>
        </div>
      )}
    </aside>
  );
}
