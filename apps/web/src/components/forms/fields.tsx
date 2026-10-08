import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/action-state';

type TextFieldProps = ComponentProps<typeof Input> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, name, error, hint, ...props }: TextFieldProps) {
  const id = `field-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  const isError = state.status === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
    >
      {state.message}
    </p>
  );
}

type SelectFieldProps = Omit<
  ComponentProps<'select'>,
  'id' | 'name' | 'value' | 'defaultValue' | 'className'
> & {
  label: string;
  name: string;
  /** Initial choice. Pass the echoed `state.values` entry, so a failed submit keeps the choice. */
  defaultValue: string;
};

/**
 * Labelled native select. Unlike <input> and <textarea>, React writes a select's
 * `defaultValue` to <option>.defaultSelected only when the select mounts; a later
 * `defaultValue` is ignored unless `multiple` changes. React 19 runs a native `form.reset()`
 * after every form action, and that puts a select back on its defaultSelected option, so a
 * re-rendered select would drop the user's choice after a failed submit. Keying it on
 * `defaultValue` remounts it whenever the echoed value changes, before the reset runs.
 */
export function SelectField({ label, name, defaultValue, children, ...props }: SelectFieldProps) {
  const id = `field-${name}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        key={defaultValue}
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={selectClassName}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

/**
 * Native select styled like the shadcn input (classes mirror src/components/ui/input.tsx);
 * native controls always submit with Server Actions.
 * Prefer `SelectField`. A hand-rolled <select> whose `defaultValue` can change (for example an
 * echoed `state.values` entry) must be keyed on that value, for the reason `SelectField` gives.
 */
export const selectClassName =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30';
