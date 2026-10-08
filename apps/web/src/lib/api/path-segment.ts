/**
 * Encodes one interpolated path segment for `apiFetch`. Refuses '', '.' and '..', which encode
 * to themselves and would make URL resolution drop or climb a segment (`/games/..` → `/`).
 * Also refuses non-strings at runtime: bound Server Action arguments are client-controlled, and
 * encodeURIComponent would stringify them (`['..']` → '..').
 */
export function pathSegment(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`pathSegment: expected a string, got ${typeof value}`);
  }
  if (value === '' || value === '.' || value === '..') {
    throw new TypeError(`pathSegment: invalid path segment ${JSON.stringify(value)}`);
  }
  return encodeURIComponent(value);
}
