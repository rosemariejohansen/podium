import Link from 'next/link';
import { OnboardingChecklist } from '@/components/games/onboarding-checklist';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listGames } from '@/lib/api/games';
import { requireUser } from '@/lib/session';

export default async function DashboardPage() {
  const games = await listGames(await requireUser());
  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your games</h1>
        <Link href="/dashboard/games/new" className={buttonVariants()}>
          New game
        </Link>
      </div>
      <OnboardingChecklist games={games} />
      {games.length === 0 ? (
        <p className="text-muted-foreground">
          You have no games yet. Create one to get an API key.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {games.map((game) => (
            <li key={game.id}>
              <Link
                href={`/dashboard/games/${game.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{game.name}</CardTitle>
                    <CardDescription>/{game.slug}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {game.leaderboardCount} leaderboards · {game.activeKeyCount} active keys
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
