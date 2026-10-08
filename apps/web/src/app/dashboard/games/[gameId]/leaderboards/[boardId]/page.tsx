import { notFound } from 'next/navigation';
import { ConfirmDeleteForm } from '@/components/forms/confirm-delete-form';
import { LeaderboardForm } from '@/components/leaderboards/leaderboard-form';
import { listLeaderboards } from '@/lib/api/leaderboards';
import { orNotFound } from '@/lib/api/or-not-found';
import { requireUser } from '@/lib/session';
import { deleteLeaderboardAction, updateLeaderboardAction } from '../actions';

export default async function LeaderboardEditPage({
  params,
}: {
  params: Promise<{ gameId: string; boardId: string }>;
}) {
  const { gameId, boardId } = await params;
  // There is no single-board endpoint; a game has at most 20 boards.
  const board = (await orNotFound(listLeaderboards(await requireUser(), gameId))).find(
    (b) => b.id === boardId,
  );
  if (!board) notFound();
  return (
    <div className="grid gap-10">
      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-medium">{board.name}</h2>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{board.slug}</span> ·{' '}
            {board.sortOrder === 'ASC' ? 'lower is better' : 'higher is better'}
          </p>
        </div>
        <LeaderboardForm
          board={board}
          action={updateLeaderboardAction.bind(null, gameId, board.id)}
        />
      </section>
      <section className="grid gap-4 rounded-lg border border-destructive/50 p-4">
        <h2 className="text-lg font-medium text-destructive">Delete leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Deletes the leaderboard and all of its scores.
        </p>
        <ConfirmDeleteForm
          expected={board.name}
          label="Delete leaderboard"
          action={deleteLeaderboardAction.bind(null, gameId, board.id)}
        />
      </section>
    </div>
  );
}
