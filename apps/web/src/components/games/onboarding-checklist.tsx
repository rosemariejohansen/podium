import type { GameDto } from '@mos/contracts';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * The dashboard onboarding checklist: Create a game → Create an API key → Send your first score
 * (PRD §3.1). PRD §10.1 shows it to users with no games or no scores. The web app has no score
 * signal yet, so for now it hides once any game has an active key; Week 2 adds "first score".
 */
export function OnboardingChecklist({ games }: { games: GameDto[] }) {
  const firstGame = games[0];
  const steps = [
    { label: 'Create a game', done: games.length > 0, href: '/dashboard/games/new' },
    {
      label: 'Create an API key',
      done: games.some((g) => g.activeKeyCount > 0),
      href: firstGame ? `/dashboard/games/${firstGame.id}/keys` : undefined,
    },
    { label: 'Send your first score with that key', done: false, href: undefined },
  ];
  if (steps[1]!.done) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Get started</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2">
              <span aria-hidden>{step.done ? '✓' : '○'}</span>
              <span className="sr-only">{step.done ? 'Done:' : 'To do:'}</span>
              {step.href && !step.done ? (
                <Link href={step.href} className="underline underline-offset-4">
                  {step.label}
                </Link>
              ) : (
                <span className={step.done ? 'text-muted-foreground line-through' : undefined}>
                  {step.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
