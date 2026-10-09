'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/forms/fields';
import { SubmitButton } from '@/components/forms/submit-button';
import { type ActionState, IDLE } from '@/lib/action-state';

interface Props {
  name: string;
  /** The revoke action bound to this game and key. */
  action: () => Promise<ActionState>;
}

export function RevokeKeyButton({ name, action }: Props) {
  // A refusal comes back as state and shows next to the button; it does not reach the error
  // boundary. The state stays on the client: the action takes no arguments, so it is never sent
  // back with the next submit.
  const [state, formAction] = useActionState<ActionState, FormData>(() => action(), IDLE);
  return (
    <form
      action={formAction}
      className="grid gap-1"
      onSubmit={(event) => {
        if (!window.confirm(`Revoke key "${name}"? Games using it stop working immediately.`)) {
          event.preventDefault();
        }
      }}
    >
      <SubmitButton variant="outline" size="sm">
        Revoke
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
