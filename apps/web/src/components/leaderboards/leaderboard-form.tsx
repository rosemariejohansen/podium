'use client';

import type { LeaderboardDto } from '@mos/contracts';
import { useActionState } from 'react';
import { FormMessage, SelectField, TextField } from '@/components/forms/fields';
import { SubmitButton } from '@/components/forms/submit-button';
import { type ActionState, IDLE } from '@/lib/action-state';

interface Props {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  /** Present when editing; slug and ranking are then fixed (FR-LB-2). */
  board?: LeaderboardDto;
}

export function LeaderboardForm({ action, board }: Props) {
  const [state, formAction] = useActionState(action, IDLE);
  const err = state.fieldErrors ?? {};
  const val = (key: string, fallback: string | number | null | undefined) =>
    state.values?.[key] ?? (fallback === null || fallback === undefined ? '' : String(fallback));

  return (
    <form action={formAction} className="grid max-w-lg gap-4">
      <TextField
        label="Name"
        name="name"
        defaultValue={val('name', board?.name)}
        error={err.name}
        required
        maxLength={60}
      />
      {!board && (
        <>
          <TextField
            label="Slug"
            name="slug"
            defaultValue={val('slug', '')}
            error={err.slug}
            hint="Used by the API (/v1/leaderboards/your-slug). Cannot be changed later."
            required
          />
          <SelectField label="Ranking" name="sortOrder" defaultValue={val('sortOrder', 'DESC')}>
            <option value="DESC">Higher is better (points)</option>
            <option value="ASC">Lower is better (times)</option>
          </SelectField>
        </>
      )}
      <TextField
        label="Unit (optional)"
        name="unit"
        defaultValue={val('unit', board?.unit)}
        error={err.unit}
        maxLength={10}
        placeholder="ms, pts"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Minimum score"
          name="minScore"
          type="number"
          step={1}
          defaultValue={val('minScore', board?.minScore)}
          error={err.minScore}
        />
        <TextField
          label="Maximum score"
          name="maxScore"
          type="number"
          step={1}
          defaultValue={val('maxScore', board?.maxScore)}
          error={err.maxScore}
        />
        <TextField
          label="Review margin (%)"
          name="reviewMarginPct"
          type="number"
          min={1}
          max={1000}
          defaultValue={val('reviewMarginPct', board?.reviewMarginPct ?? 25)}
          error={err.reviewMarginPct}
          hint="Scores that beat #1 by more than this go to review."
        />
        <TextField
          label="Entries before review starts"
          name="reviewMinEntries"
          type="number"
          min={1}
          max={10000}
          defaultValue={val('reviewMinEntries', board?.reviewMinEntries ?? 10)}
          error={err.reviewMinEntries}
        />
      </div>
      <SubmitButton>{board ? 'Save changes' : 'Create leaderboard'}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
