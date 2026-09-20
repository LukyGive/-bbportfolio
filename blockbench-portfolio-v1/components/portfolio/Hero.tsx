import Link from 'next/link';

export function Hero() {
  return (
    <section className="hero shell">
      <div className="hero-kicker"><span /> 3D ART · BLOCKBENCH · MINECRAFT</div>
      <h1>Characters, creatures<br />& assets with <em>presence.</em></h1>
      <p>
        A curated collection of custom Blockbench models — from bosses and NPCs
        to weapons, armor and game-ready assets.
      </p>
      <div className="hero-actions">
        <Link className="button button-primary" href="/creations">Explore my work <span aria-hidden="true">↗</span></Link>
        <a className="text-link" href="#selected-work">Selected projects <span aria-hidden="true">↓</span></a>
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <div className="orbit-cube"><i /><i /><i /></div>
      </div>
    </section>
  );
}
