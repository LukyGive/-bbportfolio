import Link from 'next/link';

export function CategoryShortcuts({ categories }: { categories: string[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="category-shortcuts">
      {categories.map((category, index) => (
        <Link key={category} href={`/creations?category=${encodeURIComponent(category)}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{category}</strong>
          <i aria-hidden="true">↗</i>
        </Link>
      ))}
    </div>
  );
}
