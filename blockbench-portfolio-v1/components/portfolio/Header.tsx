import Link from 'next/link';

export function Header() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Portfolio home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>
            <strong>LUCAS</strong>
            <small>BLOCKBENCH ARTIST</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          <Link href="/creations">Work</Link>
          <a href="/#categories">Categories</a>
        </nav>
      </div>
    </header>
  );
}
