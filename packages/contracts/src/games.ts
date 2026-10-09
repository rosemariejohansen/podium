import { z } from 'zod';
import { nameSchema, nonEmpty, slugSchema } from './common.js';

export const RESERVED_GAME_SLUGS = [
  'demo',
  'api',
  'admin',
  'dashboard',
  'docs',
  'g',
  'new',
  'settings',
] as const;

// A blank description (empty after trimming) is stored as "no description", i.e. null.
const descriptionSchema = z
  .string()
  .trim()
  .max(280, 'At most 280 characters')
  .transform((value) => (value === '' ? null : value));

export const gameCreateSchema = z.strictObject({
  name: nameSchema(60),
  slug: slugSchema.refine(
    (slug) => !(RESERVED_GAME_SLUGS as readonly string[]).includes(slug),
    'This slug is reserved',
  ),
  // nullable: the web parses a form with this schema and the API parses the result again.
  description: descriptionSchema.nullable().optional(),
});
export type GameCreateInput = z.output<typeof gameCreateSchema>;

export const gameUpdateSchema = z
  .strictObject({
    name: nameSchema(60).optional(),
    description: descriptionSchema.nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine(nonEmpty, 'Nothing to update');
export type GameUpdateInput = z.output<typeof gameUpdateSchema>;

export interface GameDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  leaderboardCount: number;
  activeKeyCount: number;
}
