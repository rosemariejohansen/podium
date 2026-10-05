import { signIn } from '@/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { safeRedirect } from '@/lib/auth/safe-redirect';
import { isTestModeEnabled } from '@/lib/auth/test-mode';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const redirectTo = safeRedirect(callbackUrl);

  async function signInWithGitHub() {
    'use server';
    await signIn('github', { redirectTo });
  }

  async function signInForTests(formData: FormData) {
    'use server';
    await signIn('test', { login: String(formData.get('login') ?? ''), redirectTo });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Podium</h1>
      {/* Auth.js sends its errors here (pages.error); the raw code is never shown. */}
      {error !== undefined && (
        <Alert variant="destructive" data-testid="signin-error">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>
            Something went wrong while signing you in. Please try again.
          </AlertDescription>
        </Alert>
      )}
      <form action={signInWithGitHub}>
        <Button type="submit" className="w-full">
          Sign in with GitHub
        </Button>
      </form>
      {isTestModeEnabled() && (
        <form action={signInForTests} className="flex gap-2" data-testid="test-login">
          <Input
            name="login"
            placeholder="test login"
            required
            pattern="[a-z0-9-]{1,39}"
            aria-label="Test login"
          />
          <Button type="submit" variant="secondary">
            Test login
          </Button>
        </form>
      )}
    </main>
  );
}
