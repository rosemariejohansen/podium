import { z } from 'zod';

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const slugSchema = z
  .string()
  .regex(
    SLUG_REGEX,
    '3–40 characters: lowercase letters, digits and hyphens; no hyphen at either end',
  );

export const nameSchema = (max: number) =>
  z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`);

// z.number().int() in zod 4 only accepts safe integers (±2^53−1).
export const safeIntegerSchema = z.number().int();

export const confirmSchema = z.strictObject({ confirm: z.string() });
export type ConfirmInput = z.output<typeof confirmSchema>;

export const nonEmpty = (value: object) => Object.keys(value).length > 0;
