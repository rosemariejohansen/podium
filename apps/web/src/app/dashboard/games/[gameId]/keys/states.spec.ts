import { describe, expect, it, vi } from 'vitest';
import { RouteError } from '@/components/route-error';
import { RouteLoading } from '@/components/route-loading';
import KeysError from './error';
import KeysLoading from './loading';

// PRD §10.2: every route segment has a loading.tsx and an error.tsx over the shared components.
describe('keys segment states', () => {
  it('shows the shared loading state', () => {
    expect(KeysLoading().type).toBe(RouteLoading);
  });

  it('shows the shared error state, wired to retry and without the error details', () => {
    const retry = vi.fn();
    const element = KeysError({ error: new Error('secret internals'), retry });
    expect(element.type).toBe(RouteError);
    expect(element.props.retry).toBe(retry);
    expect(JSON.stringify(element.props)).not.toContain('secret internals');
  });
});
