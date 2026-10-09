import type { ActionState } from '@/lib/action-state';

export interface KeyActionState extends ActionState {
  /** Present only in the response to a successful create; shown once in the reveal dialog. */
  createdKey?: { id: string; name: string; key: string };
  /**
   * The scopes the user ticked, echoed on a failed submit. `values` keeps one entry per field,
   * so it cannot hold several `scopes`, and React resets the checkboxes after the action.
   */
  scopes?: string[];
}

export const EXPIRY_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
] as const;

/** Raw form values; apiKeyCreateSchema does the validation. */
export function readKeyCreateForm(fd: FormData): {
  name: string;
  scopes: string[];
  expiresInDays: number | null;
} {
  const name = fd.get('name');
  const expiry = fd.get('expiresInDays');
  return {
    name: typeof name === 'string' ? name : '',
    scopes: fd.getAll('scopes').filter((scope): scope is string => typeof scope === 'string'),
    expiresInDays: typeof expiry !== 'string' || expiry === 'never' ? null : Number(expiry),
  };
}

/** A failed submit, plus the scope choice the form needs to show it again. */
export function withScopeChoice(state: ActionState, fd: FormData): KeyActionState {
  return { ...state, scopes: readKeyCreateForm(fd).scopes };
}
