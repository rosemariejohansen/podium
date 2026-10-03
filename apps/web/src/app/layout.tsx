import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Podium',
  description: 'Leaderboards for games: API keys, score submission, moderation and stats.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires dynamic rendering for every page (Next.js CSP guide).
  await connection();
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
