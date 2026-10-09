import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormMessage } from '@/components/forms/fields';
import { type ActionState, IDLE } from '@/lib/action-state';
import { RevokeKeyButton } from './revoke-key-button';

const hooks = vi.hoisted(() => ({
  state: undefined as unknown,
  formAction: (() => undefined) as (fd: FormData) => void,
  reducer: undefined as ((prev: unknown, fd: FormData) => Promise<unknown>) | undefined,
}));

// The button's only hook is useActionState. The stub returns the state a test sets, and keeps the
// function it was given so a test can run it like React does on a submit.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: (
      reducer: (prev: unknown, fd: FormData) => Promise<unknown>,
      initial: unknown,
    ) => {
      hooks.reducer = reducer;
      return [hooks.state ?? initial, hooks.formAction];
    },
  };
});

type Props = Record<string, unknown> & { children?: ReactNode };

function findAll(
  node: ReactNode,
  match: (el: ReactElement<Props>) => boolean,
): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child as ReactNode, match));
  if (!isValidElement<Props>(node)) return [];
  return [...(match(node) ? [node] : []), ...findAll(node.props.children, match)];
}

/** What a user reads: FormMessage receives the whole state but renders only its message. */
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map((child) => text(child as ReactNode)).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!isValidElement<Props>(node)) return '';
  if (node.type === FormMessage) {
    return text(FormMessage(node.props as unknown as Parameters<typeof FormMessage>[0]));
  }
  return text(node.props.children);
}

beforeEach(() => {
  hooks.state = undefined;
  hooks.formAction = vi.fn();
  hooks.reducer = undefined;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const action = vi.fn(async (): Promise<ActionState> => ({ status: 'success' }));

function render() {
  return RevokeKeyButton({ name: 'prod', action });
}

function submit(confirmed: boolean) {
  const confirm = vi.fn(() => confirmed);
  vi.stubGlobal('window', { confirm });
  const form = render();
  const preventDefault = vi.fn();
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault });
  return { form, confirm, preventDefault };
}

describe('RevokeKeyButton', () => {
  it('is a form that submits through its action state, with one Revoke button', () => {
    const form = render();
    expect(form.type).toBe('form');
    expect(form.props.action).toBe(hooks.formAction);
    expect(findAll(form, (el) => el.props.children === 'Revoke')).toHaveLength(1);
  });

  it('asks for confirmation, naming the key, and lets the submit through when confirmed', () => {
    const { confirm, preventDefault } = submit(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('"prod"'));
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('cancels the submit when the user declines', () => {
    const { preventDefault } = submit(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  // F6: a failed revoke is a message next to the button, not a crash of the whole page.
  describe('revoking', () => {
    it('runs the bound action with nothing from the form or from an earlier result', async () => {
      render();
      const failed: ActionState = { status: 'error', message: 'Too many requests' };
      await hooks.reducer!(failed, new FormData());
      expect(action).toHaveBeenCalledTimes(1);
      expect(action).toHaveBeenCalledWith();
    });

    it("turns the action's result into the button's state", async () => {
      render();
      const failed: ActionState = { status: 'error', message: 'Too many requests' };
      action.mockResolvedValueOnce(failed);
      await expect(hooks.reducer!(IDLE, new FormData())).resolves.toEqual(failed);
    });

    it('shows nothing before anything went wrong', () => {
      expect(text(render())).not.toMatch(/too many|unreachable/i);
      expect(findAll(render(), (el) => el.props.role === 'alert')).toHaveLength(0);
    });

    it('shows the error next to the button', () => {
      hooks.state = { status: 'error', message: 'Too many requests' } satisfies ActionState;
      const form = render();
      expect(text(form)).toContain('Too many requests');
      // Inside the same form, after the button, so it stays beside this key's row.
      const parts = form.props.children as ReactNode[];
      expect(findAll(parts[0], (el) => el.props.children === 'Revoke')).toHaveLength(1);
      expect(text(parts[1])).toContain('Too many requests');
    });
  });
});
