'use server';

import { type ApiKeyCreatedDto, apiKeyCreateSchema } from '@mos/contracts';
import { revalidatePath } from 'next/cache';
import { fromApiError } from '@/lib/action-errors';
import { type ActionState, fromZodError } from '@/lib/action-state';
import { ApiError } from '@/lib/api/client';
import { createKey, revokeKey } from '@/lib/api/keys';
import { type KeyActionState, readKeyCreateForm, withScopeChoice } from '@/lib/forms/key-create';
import { requireUser } from '@/lib/session';

export async function createKeyAction(
  gameId: string,
  _prev: KeyActionState,
  fd: FormData,
): Promise<KeyActionState> {
  const ctx = await requireUser();
  const parsed = apiKeyCreateSchema.safeParse(readKeyCreateForm(fd));
  if (!parsed.success) return withScopeChoice(fromZodError(parsed.error, fd), fd);
  let created: ApiKeyCreatedDto;
  try {
    created = await createKey(ctx, gameId, parsed.data);
  } catch (error) {
    return withScopeChoice(fromApiError(error, fd), fd);
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  // The plaintext key leaves the server once, here, and only as createdKey: not in the message,
  // not in any echoed value, and not in the revalidated page (which never receives it).
  return {
    status: 'success',
    message: `Key "${created.name}" created.`,
    createdKey: { id: created.id, name: created.name, key: created.key },
  };
}

export async function revokeKeyAction(gameId: string, keyId: string): Promise<ActionState> {
  const ctx = await requireUser();
  try {
    await revokeKey(ctx, keyId);
  } catch (error) {
    // A refusal is state for the row to show, not a crash of the page. fromApiError rethrows
    // anything that is not an API error. It reads the form only to echo values; there is none.
    const state = fromApiError(error, new FormData());
    // 404: the key is gone (revoked or deleted elsewhere), so the list on screen is stale.
    if (error instanceof ApiError && error.status === 404) {
      revalidatePath(`/dashboard/games/${gameId}`, 'layout');
    }
    return state;
  }
  revalidatePath(`/dashboard/games/${gameId}`, 'layout');
  return { status: 'success' };
}
