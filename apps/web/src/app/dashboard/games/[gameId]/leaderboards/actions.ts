'use server';

import { leaderboardCreateSchema, leaderboardUpdateSchema } from '@mos/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fromApiError } from '@/lib/action-errors';
import {
  type ActionState,
  fromZodError,
  nullableNum,
  nullableText,
  num,
  str,
  text,
} from '@/lib/action-state';
import { createLeaderboard, deleteLeaderboard, updateLeaderboard } from '@/lib/api/leaderboards';
import { requireUser } from '@/lib/session';

export async function createLeaderboardAction(
  gameId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = leaderboardCreateSchema.safeParse({
    name: str(fd, 'name'),
    slug: str(fd, 'slug'),
    sortOrder: str(fd, 'sortOrder'),
    unit: text(fd, 'unit'),
    minScore: num(fd, 'minScore'),
    maxScore: num(fd, 'maxScore'),
    reviewMarginPct: num(fd, 'reviewMarginPct'),
    reviewMinEntries: num(fd, 'reviewMinEntries'),
  });
  if (!parsed.success) return fromZodError(parsed.error, fd);
  try {
    await createLeaderboard(ctx, gameId, parsed.data);
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  return { status: 'success', message: `Leaderboard "${parsed.data.name}" created.` };
}

export async function updateLeaderboardAction(
  gameId: string,
  boardId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = leaderboardUpdateSchema.safeParse({
    name: str(fd, 'name'),
    unit: nullableText(fd, 'unit'),
    minScore: nullableNum(fd, 'minScore'),
    maxScore: nullableNum(fd, 'maxScore'),
    reviewMarginPct: num(fd, 'reviewMarginPct'),
    reviewMinEntries: num(fd, 'reviewMinEntries'),
  });
  if (!parsed.success) return fromZodError(parsed.error, fd);
  try {
    await updateLeaderboard(ctx, boardId, parsed.data);
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  return { status: 'success', message: 'Saved.' };
}

export async function deleteLeaderboardAction(
  gameId: string,
  boardId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireUser();
  try {
    await deleteLeaderboard(ctx, boardId, str(fd, 'confirm'));
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  redirect(`/dashboard/games/${gameId}/leaderboards`);
}
