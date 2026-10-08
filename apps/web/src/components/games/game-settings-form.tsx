'use client';

import type { GameDto } from '@mos/contracts';
import { useActionState } from 'react';
import { FormMessage, TextField } from '@/components/forms/fields';
import { SubmitButton } from '@/components/forms/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { type ActionState, IDLE } from '@/lib/action-state';

interface Props {
  game: GameDto;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}

export function GameSettingsForm({ game, action }: Props) {
  const [state, formAction] = useActionState(action, IDLE);
  const values = state.values;
  const descriptionError = state.fieldErrors?.description;
  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <TextField
        label="Name"
        name="name"
        defaultValue={values?.name ?? game.name}
        error={state.fieldErrors?.name}
        required
        maxLength={60}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="field-description">Description</Label>
        <Textarea
          id="field-description"
          name="description"
          defaultValue={values?.description ?? game.description ?? ''}
          maxLength={280}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? 'field-description-error' : undefined}
        />
        {descriptionError && (
          <p id="field-description-error" className="text-sm text-destructive">
            {descriptionError}
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isPublic"
          defaultChecked={values ? values.isPublic === 'on' : game.isPublic}
          className="h-4 w-4"
        />
        Public leaderboards at /g/{game.slug}
      </label>
      <SubmitButton>Save</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
