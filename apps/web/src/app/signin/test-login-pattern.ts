// Browsers compile the <input pattern> as `^(?:pattern)$` with the 'v' flag, where a literal '-'
// inside a class must be escaped; an invalid pattern is silently ignored. Mirrors the server-side
// check in src/auth.ts (/^[a-z0-9-]{1,39}$/).
export const TEST_LOGIN_PATTERN = '[a-z0-9\\-]{1,39}';
