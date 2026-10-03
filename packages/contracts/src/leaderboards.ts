import { z } from 'zod';
import { nameSchema, nonEmpty, safeIntegerSchema, slugSchema } from './common.js';

export const SORT_ORDERS = ['ASC', 'DESC'] as const;
export const sortOrderSchema = z.enum(SORT_ORDERS);
export type SortOrder = z.output<typeof sortOrderSchema>;

const unitSchema = z.string().trim().min(1).max(10, 'At most 10 characters');
const marginSchema = z.number().int().min(1).max(1000);
const minEntriesSchema = z.number().int().min(1).max(10000);

const boundsOk = (v: { minScore?: number | null; maxScore?: number | null }) =>
  typeof v.minScore !== 'number' || typeof v.maxScore !== 'number' || v.minScore <= v.maxScore;
const boundsIssue = {
  message: 'maxScore must be greater than or equal to minScore',
  path: ['maxScore'],
};

export const leaderboardCreateSchema = z
  .strictObject({
    name: nameSchema(60),
    slug: slugSchema,
    sortOrder: sortOrderSchema,
    unit: unitSchema.optional(),
    minScore: safeIntegerSchema.optional(),
    maxScore: safeIntegerSchema.optional(),
    reviewMarginPct: marginSchema.default(25),
    reviewMinEntries: minEntriesSchema.default(10),
  })
  .refine(boundsOk, boundsIssue);
export type LeaderboardCreateInput = z.output<typeof leaderboardCreateSchema>;

export const leaderboardUpdateSchema = z
  .strictObject({
    name: nameSchema(60).optional(),
    unit: unitSchema.nullable().optional(),
    minScore: safeIntegerSchema.nullable().optional(),
    maxScore: safeIntegerSchema.nullable().optional(),
    reviewMarginPct: marginSchema.optional(),
    reviewMinEntries: minEntriesSchema.optional(),
  })
  .refine(nonEmpty, 'Nothing to update')
  .refine(boundsOk, boundsIssue);
export type LeaderboardUpdateInput = z.output<typeof leaderboardUpdateSchema>;

export interface LeaderboardDto {
  id: string;
  gameId: string;
  name: string;
  slug: string;
  sortOrder: SortOrder;
  unit: string | null;
  minScore: number | null;
  maxScore: number | null;
  reviewMarginPct: number;
  reviewMinEntries: number;
  createdAt: string;
}
