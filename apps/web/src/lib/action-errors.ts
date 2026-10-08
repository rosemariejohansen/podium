import 'server-only';
import { ApiError } from '@/lib/api/client';
import { type ActionState, formValues } from '@/lib/action-state';

const FIELD_FOR_CODE: Partial<Record<string, string>> = {
  SLUG_TAKEN: 'slug',
  CONFIRMATION_MISMATCH: 'confirm',
};

/** Converts an API error into form state. Anything else (including Next.js redirects) is rethrown. */
export function fromApiError(error: unknown, fd: FormData): ActionState {
  if (!(error instanceof ApiError)) throw error;
  const values = formValues(fd);
  if (error.code === 'VALIDATION_FAILED') {
    const issues =
      (error.details as { issues?: { path: string; message: string }[] } | undefined)?.issues ?? [];
    return {
      status: 'error',
      message: error.message,
      fieldErrors: Object.fromEntries(issues.map((issue) => [issue.path || 'form', issue.message])),
      values,
    };
  }
  const field = FIELD_FOR_CODE[error.code];
  return {
    status: 'error',
    message: error.message,
    fieldErrors: field ? { [field]: error.message } : undefined,
    values,
  };
}
