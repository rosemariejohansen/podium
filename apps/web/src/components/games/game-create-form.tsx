'use client';

import { useActionState } from 'react';
import { createGameAction } from '@/app/dashboard/games/actions';
import { FormMessage, TextField } from '@/components/forms/fields';
import { SubmitButton } from '@/components/forms/submit-button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { IDLE } from '@/lib/action-state';

export function GameCreateForm() {
  const [state, formAction] = useActionState(createGameAction, IDLE);
  const values = state.values ?? {};
  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <TextField
        label="Name"
        name="name"
        defaultValue={values.name}
        error={state.fieldErrors?.name}
        required
        maxLength={60}
      />
      <TextField
        label="Slug"
        name="slug"
        defaultValue={values.slug}
        error={state.fieldErrors?.slug}
        hint="Used in public URLs (/g/your-slug). Cannot be changed later."
        required
        pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
      />
      <div className="grid gap-1.5">
        <Label htmlFor="field-description">Description (optional)</Label>
        <Textarea
          id="field-description"
          name="description"
          defaultValue={values.description}
          maxLength={280}
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">{state.fieldErrors.description}</p>
        )}
      </div>
      <SubmitButton>Create game</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
