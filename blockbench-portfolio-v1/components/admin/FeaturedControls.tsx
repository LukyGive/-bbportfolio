'use client';

type FeaturedControlsProps = {
  featured: boolean;
  featuredOrder?: number;
  onChange: (next: { featured: boolean; featuredOrder?: number }) => void;
};

export function FeaturedControls({ featured, featuredOrder, onChange }: FeaturedControlsProps) {
  return (
    <div className="admin-featured-controls">
      <label className="admin-check">
        <input
          type="checkbox"
          checked={featured}
          onChange={(event) => onChange({
            featured: event.target.checked,
            featuredOrder: event.target.checked ? (featuredOrder ?? 1) : undefined,
          })}
        />
        <span><strong>Featured</strong><small>Show this creation on the homepage.</small></span>
      </label>
      {featured && (
        <label className="admin-field compact-field">
          <span>Featured order</span>
          <input
            aria-label="Featured order"
            type="number"
            min="0"
            step="1"
            value={featuredOrder ?? 1}
            onChange={(event) => onChange({ featured: true, featuredOrder: Math.max(0, Number(event.target.value) || 0) })}
          />
        </label>
      )}
    </div>
  );
}
