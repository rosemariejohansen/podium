/** Redis key under which Week 2's ApiKeyGuard caches a key record for 60 s (FR-KEY-4, SEC-API-4). */
export const apiKeyCacheKey = (hash: string): string => `apikey:${hash}`;
