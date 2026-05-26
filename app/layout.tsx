import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'cupid player',
  description: 'Shared YouTube Music remote — admin plays, listeners control the queue.',
  icons: { icon: '/pink/favicon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: 'resizes-content',
  themeColor: '#5a3a4a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
