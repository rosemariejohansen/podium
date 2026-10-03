import { z } from 'zod';
import { nameSchema } from './common.js';

export const KEY_SCOPES = ['scores:read', 'scores:write'] as const;
export const keyScopeSchema = z.enum(KEY_SCOPES);
export type KeyScope = z.output<typeof keyScopeSchema>;

export const KEY_EXPIRY_DAYS = [30, 90, 365] as const;

export const apiKeyCreateSchema = z.strictObject({
  name: nameSchema(40),
  scopes: z
    .array(keyScopeSchema)
    .min(1, 'Choose at least one scope')
    .refine((s) => new Set(s).size === s.length, 'Duplicate scope'),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
});
export type ApiKeyCreateInput = z.output<typeof apiKeyCreateSchema>;

export type ApiKeyStatus = 'active' | 'expired' | 'revoked';

export interface ApiKeyDto {
  id: string;
  gameId: string;
  name: string;
  prefix: string;
  scopes: KeyScope[];
  status: ApiKeyStatus;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface ApiKeyCreatedDto extends ApiKeyDto {
  /** The full key. Returned exactly once, by the create call (FR-KEY-2). */
  key: string;
}
