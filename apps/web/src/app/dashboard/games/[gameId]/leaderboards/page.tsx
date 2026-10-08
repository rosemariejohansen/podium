import Link from 'next/link';
import { LeaderboardForm } from '@/components/leaderboards/leaderboard-form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { listLeaderboards } from '@/lib/api/leaderboards';
import { orNotFound } from '@/lib/api/or-not-found';
import { requireUser } from '@/lib/session';
import { createLeaderboardAction } from './actions';

const bounds = (min: number | null, max: number | null) =>
  min === null && max === null ? '—' : `${min ?? '−∞'} … ${max ?? '∞'}`;

export default async function LeaderboardsPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const boards = await orNotFound(listLeaderboards(await requireUser(), gameId));
  return (
    <div className="grid gap-8">
      {boards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No leaderboards yet. Create the first one below.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Ranking</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Bounds</TableHead>
              <TableHead>Review margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {boards.map((board) => (
              <TableRow key={board.id}>
                <TableCell>
                  <Link
                    href={`/dashboard/games/${gameId}/leaderboards/${board.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {board.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{board.slug}</TableCell>
                <TableCell>
                  {board.sortOrder === 'ASC' ? 'Lower is better' : 'Higher is better'}
                </TableCell>
                <TableCell>{board.unit ?? '—'}</TableCell>
                <TableCell>{bounds(board.minScore, board.maxScore)}</TableCell>
                <TableCell>
                  {board.reviewMarginPct}% after {board.reviewMinEntries} entries
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <section className="grid gap-4">
        <h2 className="text-lg font-medium">New leaderboard</h2>
        <LeaderboardForm action={createLeaderboardAction.bind(null, gameId)} />
      </section>
    </div>
  );
}
