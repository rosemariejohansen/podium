import { GameTabs } from '@/components/games/game-tabs';
import { getGame } from '@/lib/api/games';
import { orNotFound } from '@/lib/api/or-not-found';
import { requireUser } from '@/lib/session';

export default async function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = await orNotFound(getGame(await requireUser(), gameId));
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{game.name}</h1>
        <p className="text-sm text-muted-foreground">
          /{game.slug} · {game.isPublic ? 'Public' : 'Private'}
        </p>
      </div>
      <GameTabs gameId={game.id} />
      {children}
    </div>
  );
}
