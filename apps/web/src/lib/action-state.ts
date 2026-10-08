import type { ZodError } from 'zod';

/** Returned by every Server Action; safe to import from client components. */
export interface ActionState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, so inputs keep what the user typed after React resets the form. */
  values?: Record<string, string>;
}

export const IDLE: ActionState = { status: 'idle' };

export function str(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/** Blank → undefined ("not provided"). */
export function text(fd: FormData, key: string): string | undefined {
  const value = str(fd, key);
  return value.trim() === '' ? undefined : value;
}

/** Blank → null ("clear this field"). */
export function nullableText(fd: FormData, key: string): string | null {
  return text(fd, key) ?? null;
}

/** Blank → undefined; otherwise Number(value). NaN is left for the zod schema to reject. */
export function num(fd: FormData, key: string): number | undefined {
  const value = text(fd, key);
  return value === undefined ? undefined : Number(value);
}

export function nullableNum(fd: FormData, key: string): number | null {
  return num(fd, key) ?? null;
}

export function formValues(fd: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of fd.entries()) {
    if (typeof value === 'string' && !key.startsWith('$ACTION')) values[key] = value;
  }
  return values;
}

export function fromZodError(error: ZodError, fd: FormData): ActionState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    fieldErrors[key] ??= issue.message;
  }
  return {
    status: 'error',
    message: 'Please fix the highlighted fields.',
    fieldErrors,
    values: formValues(fd),
  };
}
