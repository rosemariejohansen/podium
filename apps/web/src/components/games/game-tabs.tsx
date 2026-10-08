'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const GAME_TABS: { segment: string; label: string }[] = [
  { segment: '', label: 'Overview' },
  { segment: 'leaderboards', label: 'Leaderboards' },
  { segment: 'settings', label: 'Settings' },
];

export function GameTabs({ gameId }: { gameId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/games/${gameId}`;
  return (
    <nav aria-label="Game sections" className="flex gap-1 border-b">
      {GAME_TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              active
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
