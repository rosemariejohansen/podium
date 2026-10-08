'use server';

import { gameCreateSchema, gameUpdateSchema } from '@mos/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fromApiError } from '@/lib/action-errors';
import { type ActionState, fromZodError, nullableText, str, text } from '@/lib/action-state';
import { createGame, deleteGame, updateGame } from '@/lib/api/games';
import { requireUser } from '@/lib/session';

export async function createGameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = gameCreateSchema.safeParse({
    name: str(fd, 'name'),
    slug: str(fd, 'slug'),
    description: text(fd, 'description'),
  });
  if (!parsed.success) return fromZodError(parsed.error, fd);
  let gameId: string;
  try {
    gameId = (await createGame(ctx, parsed.data)).id;
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath('/dashboard');
  redirect(`/dashboard/games/${gameId}`);
}

export async function updateGameAction(
  gameId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireUser();
  const parsed = gameUpdateSchema.safeParse({
    name: str(fd, 'name'),
    description: nullableText(fd, 'description'),
    isPublic: fd.get('isPublic') === 'on',
  });
  if (!parsed.success) return fromZodError(parsed.error, fd);
  try {
    await updateGame(ctx, gameId, parsed.data);
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  return { status: 'success', message: 'Saved.' };
}

export async function deleteGameAction(
  gameId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const ctx = await requireUser();
  try {
    await deleteGame(ctx, gameId, str(fd, 'confirm'));
  } catch (error) {
    return fromApiError(error, fd);
  }
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
