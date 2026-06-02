// app/layout.tsx
import type { Metadata } from 'next';
import { Syne, DM_Mono, Instrument_Serif } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['400','500','600','700'] });
const dmMono = DM_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['300','400','500'] });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'], variable: '--font-serif',
  style: ['normal','italic'], weight: '400',
});

export const metadata: Metadata = {
  title: 'Ledger — Personal Finance Platform',
  description: 'Your financial cockpit. AI-powered money management with persistent HUD.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
