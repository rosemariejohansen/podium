import { ConfirmDeleteForm } from '@/components/forms/confirm-delete-form';
import { GameSettingsForm } from '@/components/games/game-settings-form';
import { deleteGameAction, updateGameAction } from '@/app/dashboard/games/actions';
import { getGame } from '@/lib/api/games';
import { orNotFound } from '@/lib/api/or-not-found';
import { requireUser } from '@/lib/session';

export default async function GameSettingsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const game = await orNotFound(getGame(await requireUser(), gameId));
  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <h2 className="text-lg font-medium">General</h2>
        <GameSettingsForm game={game} action={updateGameAction.bind(null, game.id)} />
      </section>
      <section className="grid gap-4 rounded-lg border border-destructive/50 p-4">
        <h2 className="text-lg font-medium text-destructive">Delete game</h2>
        <p className="text-sm text-muted-foreground">
          Deletes every leaderboard, score and API key of this game. This cannot be undone.
        </p>
        <ConfirmDeleteForm
          expected={game.name}
          label="Delete game"
          action={deleteGameAction.bind(null, game.id)}
        />
      </section>
    </div>
  );
}
