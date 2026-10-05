import 'server-only';
import type { ApiErrorBody, ErrorCode } from '@mos/contracts';
import { signServiceToken, type ServiceTokenClaims } from '@mos/service-token';
import { serverEnv } from '@/lib/env.server';

export type ApiAuth = { userId: string; ip: string | null } | 'system' | 'none';

/** Server-to-server calls give up after this long; a stalled API maps to 503. */
const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth: ApiAuth;
}

/**
 * Server-side only: calls the NestJS API with a freshly signed service token (PRD AD-3, SEC-WEB-1).
 * `path` must start with a single '/'; callers encode every interpolated segment.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const env = serverEnv();
  // Programmer and config errors throw as they are, before a token is signed.
  const url = apiUrl(path, env.API_URL);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.auth !== 'none') {
    const claims: ServiceTokenClaims =
      options.auth === 'system'
        ? { sub: 'mos-web', scope: 'system' }
        : { sub: options.auth.userId, scope: 'user', ip: options.auth.ip };
    headers.Authorization = `Bearer ${await signServiceToken(env.SERVICE_TOKEN_PRIVATE_KEY, claims)}`;
  }

  let response: Response;
  let text: string;
  try {
    // The signal also bounds reading the body.
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 204) return undefined as T;
    text = await response.text();
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
    throw new ApiError(
      503,
      'SERVICE_UNAVAILABLE',
      timedOut ? 'The API did not respond in time' : 'The API is unreachable',
      undefined,
      undefined,
      { cause },
    );
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch (cause) {
    throw new ApiError(
      response.status,
      'INTERNAL_ERROR',
      `Unexpected response from the API (${response.status})`,
      undefined,
      undefined,
      { cause },
    );
  }
  if (!response.ok) {
    const error = (data as Partial<ApiErrorBody> | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `API request failed (${response.status})`,
      error?.details,
      error?.requestId,
    );
  }
  return data as T;
}

/** Resolves `path` against the API origin and refuses anything that would leave it. */
function apiUrl(path: string, base: string): URL {
  const url = /^\/(?![/\\])/.test(path) ? new URL(path, base) : undefined;
  if (!url || url.origin !== new URL(base).origin) {
    throw new TypeError(
      `apiFetch: path must be an API path starting with one '/': ${JSON.stringify(path)}`,
    );
  }
  return url;
}
