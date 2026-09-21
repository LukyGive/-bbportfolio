import type { Metadata } from 'next';
import { Header } from '@/components/portfolio/Header';
import './globals.css';
import './portfolio-fixes.css';

export const metadata: Metadata = {
  title: {
    default: 'Lucas — Blockbench Artist',
    template: '%s · Lucas — Blockbench Artist',
  },
  description: 'A curated portfolio of custom Blockbench creations, characters, bosses, items and game assets.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
