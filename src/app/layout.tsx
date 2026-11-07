import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: { default: 'Physics Graph Helper', template: '%s | Physics Graph Helper' }, description: 'A learning aid for university physics practicals.', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a><header className="site-header"><Link href="/" className="wordmark">Graphbook<span>Physics Graph Helper</span></Link><span className="header-note">University practicals</span></header>{children}<footer className="site-footer"><span>Physics Graph Helper</span><span>Your work. Your understanding.</span></footer></body></html>;
}
