'use client';

import { Button } from '@/components/ui/button';

/** Props Next.js passes to every error.tsx. */
export interface RouteErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/** PRD §10.2: the error.tsx state of every route segment. Never shows error details. */
export function RouteError({ retry }: Pick<RouteErrorProps, 'retry'>) {
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[50vh] max-w-sm flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        This page could not be loaded. Please try again.
      </p>
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
