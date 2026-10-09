'use client';

import { KEY_SCOPES } from '@mos/contracts';
import { useActionState, useState } from 'react';
import { FormMessage, selectClassName, TextField } from '@/components/forms/fields';
import { SubmitButton } from '@/components/forms/submit-button';
import { Label } from '@/components/ui/label';
import { IDLE } from '@/lib/action-state';
import { EXPIRY_OPTIONS, type KeyActionState } from '@/lib/forms/key-create';
import { KeyRevealDialog } from './key-reveal-dialog';

interface Props {
  action: (prev: KeyActionState, fd: FormData) => Promise<KeyActionState>;
}

type CreatedKey = NonNullable<KeyActionState['createdKey']>;

export function KeyCreateForm({ action }: Props) {
  // SEC-WEB-10: the plaintext key exists on the client in one place, this state, which feeds the
  // reveal dialog. Closing the dialog clears it, and clearing is idempotent, so no number of
  // closes can bring the key back.
  const [created, setCreated] = useState<CreatedKey | null>(null);
  // useActionState hands its function the state it holds, and React serialises that into the
  // request of a Server Action, where Next also logs it in dev. So the form gives it this client
  // function instead of the action. The action always gets IDLE, takes the key out of its result,
  // and the state React keeps never holds a key.
  const [state, formAction] = useActionState<KeyActionState, FormData>(async (_prev, fd) => {
    const { createdKey, ...result } = await action(IDLE, fd);
    if (createdKey) setCreated(createdKey);
    return result;
  }, IDLE);
  const errors = state.fieldErrors ?? {};
  // React resets the form after every action, and the reset puts each control back on its
  // default. After a failed submit the defaults are therefore the user's own choices, echoed in
  // the state; after a success or on first render they are the form's own defaults.
  const failed = state.status === 'error';
  const chosenScopes: readonly string[] = failed && state.scopes ? state.scopes : KEY_SCOPES;
  const chosenExpiry = (failed && state.values?.expiresInDays) || 'never';

  return (
    <>
      <form action={formAction} className="grid max-w-lg gap-4">
        <TextField
          label="Name"
          name="name"
          placeholder="prod"
          defaultValue={failed ? state.values?.name : undefined}
          error={errors.name}
          required
          maxLength={40}
        />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Scopes</legend>
          {KEY_SCOPES.map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="scopes"
                value={scope}
                defaultChecked={chosenScopes.includes(scope)}
                className="h-4 w-4"
              />
              <code>{scope}</code>
            </label>
          ))}
          {errors.scopes && <p className="text-sm text-destructive">{errors.scopes}</p>}
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="field-expiresInDays">Expires</Label>
          {/* Keyed on the choice, so the select remounts with it (see SelectField). */}
          <select
            key={chosenExpiry}
            id="field-expiresInDays"
            name="expiresInDays"
            defaultValue={chosenExpiry}
            className={selectClassName}
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.expiresInDays && (
            <p className="text-sm text-destructive">{errors.expiresInDays}</p>
          )}
        </div>
        <SubmitButton>Create key</SubmitButton>
        <FormMessage state={state} />
      </form>
      <KeyRevealDialog created={created} onClose={() => setCreated(null)} />
    </>
  );
}
