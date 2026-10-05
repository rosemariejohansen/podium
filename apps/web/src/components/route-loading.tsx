import { LoaderCircleIcon } from 'lucide-react';

/** PRD §10.2: the loading.tsx state of every route segment. */
export function RouteLoading() {
  return (
    <div
      role="status"
      className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
      Loading…
    </div>
  );
}
