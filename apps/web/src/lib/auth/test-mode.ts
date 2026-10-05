/**
 * PRD SEC-WEB-9 (as adjusted): the test sign-in provider exists only when AUTH_TEST_MODE=1
 * and the app is not a Vercel deployment. VERCEL_ENV is set on every Vercel build/runtime.
 */
export function isTestModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AUTH_TEST_MODE !== '1') return false;
  if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') {
    throw new Error('AUTH_TEST_MODE=1 is not allowed on Vercel deployments (SEC-WEB-9)');
  }
  return true;
}
