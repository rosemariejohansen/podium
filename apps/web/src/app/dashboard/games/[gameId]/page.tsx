import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getGame } from '@/lib/api/games';
import { listLeaderboards } from '@/lib/api/leaderboards';
import { orNotFound } from '@/lib/api/or-not-found';
import { requireUser } from '@/lib/session';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export default async function GameOverviewPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const ctx = await requireUser();
  const [game, boards] = await Promise.all([
    orNotFound(getGame(ctx, gameId)),
    orNotFound(listLeaderboards(ctx, gameId)),
  ]);
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Leaderboards" value={game.leaderboardCount} />
        <Stat label="Active API keys" value={game.activeKeyCount} />
        <Stat label="Visibility" value={game.isPublic ? 'Public' : 'Private'} />
      </div>
      <section className="grid gap-2">
        <h2 className="text-lg font-medium">Leaderboards</h2>
        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No leaderboards yet.{' '}
            <Link
              href={`/dashboard/games/${game.id}/leaderboards`}
              className="underline underline-offset-4"
            >
              Create one
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/dashboard/games/${game.id}/leaderboards/${board.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {board.name}
                </Link>{' '}
                <span className="text-muted-foreground">
                  ({board.slug},{' '}
                  {board.sortOrder === 'ASC' ? 'lower is better' : 'higher is better'})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
