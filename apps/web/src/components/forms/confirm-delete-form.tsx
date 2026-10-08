'use client';

import { useActionState, useState } from 'react';
import { type ActionState, IDLE } from '@/lib/action-state';
import { FormMessage, TextField } from './fields';
import { SubmitButton } from './submit-button';

interface Props {
  /** The exact, case-sensitive text the user must type (PRD SEC-WEB-7). */
  expected: string;
  label: string;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
}

export function ConfirmDeleteForm({ expected, label, action }: Props) {
  const [state, formAction] = useActionState(action, IDLE);
  const [typed, setTyped] = useState('');
  return (
    <form action={formAction} className="grid max-w-md gap-3">
      <TextField
        label={`Type "${expected}" to confirm`}
        name="confirm"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton variant="destructive" disabled={typed !== expected}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
