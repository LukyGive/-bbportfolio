import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="not-found shell">
      <span className="eyebrow">404 · Not found</span>
      <h1>This model isn’t here.</h1>
      <p>The creation may be unpublished, renamed or no longer part of the portfolio.</p>
      <Link className="button button-primary" href="/creations">Back to creations <span aria-hidden="true">↗</span></Link>
    </div>
  );
}
