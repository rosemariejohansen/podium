import { KEY_SCOPES } from '@mos/contracts';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyAction } from '@/app/dashboard/games/[gameId]/keys/actions';
import { FormMessage } from '@/components/forms/fields';
import { IDLE } from '@/lib/action-state';
import { ApiError } from '@/lib/api/client';
import { createKey } from '@/lib/api/keys';
import { requireUser } from '@/lib/session';
import type { KeyActionState } from '@/lib/forms/key-create';
import { KeyCreateForm } from './key-create-form';
import { KeyRevealDialog } from './key-reveal-dialog';

const hooks = vi.hoisted(() => ({
  actionState: undefined as unknown,
  reducer: undefined as ((prev: unknown, fd: FormData) => Promise<unknown>) | undefined,
  slots: [] as unknown[],
  cursor: 0,
}));

// The form's hooks are useActionState and useState. useActionState keeps the state its function
// returned and remembers that function, so a test can submit like React does (run it with the
// current state and a form, keep the result). useState keeps its slots between renders so a test
// can click and render again. With that, calling the component returns its element tree.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: (
      reducer: (prev: unknown, fd: FormData) => Promise<unknown>,
      initial: unknown,
    ) => {
      hooks.reducer = reducer;
      if (hooks.actionState === undefined) hooks.actionState = initial;
      return [hooks.actionState, () => undefined];
    },
    useState: (initial: unknown) => {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) {
        hooks.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      }
      const set = (next: unknown) => {
        hooks.slots[index] =
          typeof next === 'function'
            ? (next as (prev: unknown) => unknown)(hooks.slots[index])
            : next;
      };
      return [hooks.slots[index], set];
    },
  };
});

// The real Server Action produces the failed and successful states, so these tests cover the
// whole path from a submitted form to the re-rendered one. Only its collaborators are stubbed.
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/api/keys', () => ({ createKey: vi.fn(), revokeKey: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

type Props = Record<string, unknown> & { children?: ReactNode };
type El = ReactElement<Props>;

function findAll(node: ReactNode, match: (el: El) => boolean, found: El[] = []): El[] {
  if (Array.isArray(node)) {
    for (const child of node) findAll(child as ReactNode, match, found);
    return found;
  }
  if (!isValidElement<Props>(node)) return found;
  if (match(node)) found.push(node);
  return findAll(node.props.children, match, found);
}

const json = (value: unknown) => {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
};

/** Every string a user could read, or a script could read off the element. */
function leaves(node: ReactNode, skip?: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) leaves(child as ReactNode, skip, out);
  } else if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
  } else if (isValidElement<Props>(node) && node.type !== skip) {
    if (node.type === FormMessage) {
      // FormMessage receives the whole state but renders only its message.
      leaves(FormMessage(node.props as unknown as Parameters<typeof FormMessage>[0]), skip, out);
      return out;
    }
    for (const [name, value] of Object.entries(node.props)) {
      if (name !== 'children') out.push(json(value));
    }
    leaves(node.props.children, skip, out);
  }
  return out;
}

const scopeBoxes = (tree: ReactNode) =>
  Object.fromEntries(
    findAll(tree, (el) => el.props.name === 'scopes' && el.props.type === 'checkbox').map((el) => [
      el.props.value,
      Boolean(el.props.checked ?? el.props.defaultChecked),
    ]),
  );

const nameField = (tree: ReactNode) => findAll(tree, (el) => el.props.name === 'name')[0];
const dialogOf = (tree: ReactNode) => findAll(tree, (el) => el.type === KeyRevealDialog)[0]!;

/** The native <select> behind the expiry field, whether it is a SelectField or a bare select. */
function expirySelect(tree: ReactNode): El {
  const [field] = findAll(tree, (el) => el.props.name === 'expiresInDays');
  expect(field, 'the form has an expiresInDays field').toBeDefined();
  if (field!.type === 'select') return field!;
  expect(typeof field!.type, 'expiresInDays is a select or SelectField').toBe('function');
  // SelectField has no hooks, so calling it returns its element tree.
  const [select] = findAll(
    (field!.type as (props: Props) => ReactNode)(field!.props),
    (el) => el.type === 'select',
  );
  expect(select, 'the expiry field renders a native <select>').toBeDefined();
  return select!;
}

const ctx = { userId: 'user_1', ip: null, login: 'octo' };
const KEY = 'mos_SHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCE_a1b2c3';
const createdDto = (id: string, key: string) => ({
  id,
  gameId: 'g1',
  name: 'prod',
  prefix: key.slice(0, 12),
  scopes: ['scores:read' as const],
  status: 'active' as const,
  createdAt: '2026-10-09T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  key,
});

function formData(scopes: string[], expiry: string, name: string) {
  const fd = new FormData();
  fd.set('name', name);
  for (const scope of scopes) fd.append('scopes', scope);
  fd.set('expiresInDays', expiry);
  return fd;
}

// The prop the page passes: the real Server Action bound to a game. Every call is recorded, so a
// test can see what React would have serialised into the request.
const action = vi.fn((prev: KeyActionState, fd: FormData) => createKeyAction('g1', prev, fd));

function render() {
  hooks.cursor = 0;
  return KeyCreateForm({ action });
}

/** The state React holds for the form (what useActionState returned last). */
const actionState = () => hooks.actionState as KeyActionState;

/** A form submit as React runs it: the action gets the current state, its result replaces it. */
async function submit(fd: FormData) {
  render();
  hooks.actionState = await hooks.reducer!(hooks.actionState, fd);
  return render();
}

/** What the user sees after submitting: no scope fails validation, anything else fails at the API. */
async function failedSubmit(scopes: string[], expiry = '90', name = 'staging') {
  vi.mocked(createKey).mockRejectedValue(
    new ApiError(403, 'QUOTA_EXCEEDED', 'This game has reached its key limit'),
  );
  const tree = await submit(formData(scopes, expiry, name));
  expect(actionState().status).toBe('error');
  return tree;
}

async function successfulSubmit(id = 'key_1', key = KEY) {
  vi.mocked(createKey).mockResolvedValue(createdDto(id, key));
  const tree = await submit(formData(['scores:read'], 'never', 'prod'));
  expect(actionState().status).toBe('success');
  return tree;
}

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.actionState = undefined;
  hooks.reducer = undefined;
  action.mockClear();
  vi.mocked(requireUser).mockReset().mockResolvedValue(ctx);
  vi.mocked(createKey).mockReset();
});

const ALL_CHECKED = Object.fromEntries(KEY_SCOPES.map((scope) => [scope, true]));
const SCOPE_CHOICES: [string, string[]][] = [
  ['neither scope', []],
  ['only scores:read', ['scores:read']],
  ['only scores:write', ['scores:write']],
  ['both scopes', ['scores:read', 'scores:write']],
];

describe('KeyCreateForm', () => {
  it('starts with both scopes checked, no expiry and no dialog', () => {
    const tree = render();
    expect(scopeBoxes(tree)).toEqual(ALL_CHECKED);
    const select = expirySelect(tree);
    expect(select.props.value ?? select.props.defaultValue).toBe('never');
    expect(nameField(tree)?.props.defaultValue ?? '').toBe('');
    expect(dialogOf(tree).props.created).toBeNull();
  });

  // React 19 resets the form after every action, and the reset puts a checkbox back on its
  // defaultChecked and a select back on the option it mounted with. State arrives only as the
  // action's returned values, so the form has to rebuild the user's choice from them (the same
  // trap as the leaderboard ranking select, Task 12 review F1).
  describe('after a failed submit', () => {
    it.each(SCOPE_CHOICES)('keeps the scope choice: %s', async (_label, scopes) => {
      const tree = await failedSubmit(scopes);
      expect(scopeBoxes(tree)).toEqual({
        'scores:read': scopes.includes('scores:read'),
        'scores:write': scopes.includes('scores:write'),
      });
    });

    it.each(['never', '30', '90', '365'])('keeps the expiry choice: %s', async (expiry) => {
      const select = expirySelect(await failedSubmit(['scores:read', 'scores:write'], expiry));
      expect(select.props.value ?? select.props.defaultValue).toBe(expiry);
      // A select takes its defaultValue only when it mounts, so an uncontrolled one has to be
      // keyed on the choice to remount when the echoed value changes.
      if (select.props.value === undefined) expect(select.key).toBe(expiry);
    });

    it('remounts the expiry select when the echoed choice differs from the default', async () => {
      const before = expirySelect(render());
      const after = expirySelect(await failedSubmit(['scores:read'], '365'));
      if (after.props.value === undefined) expect(after.key).not.toBe(before.key);
    });

    it('keeps the scope and expiry choice together, whatever the failure', async () => {
      const tree = await failedSubmit(['scores:write'], '30', 'staging');
      expect(scopeBoxes(tree)).toEqual({ 'scores:read': false, 'scores:write': true });
      const select = expirySelect(tree);
      expect(select.props.value ?? select.props.defaultValue).toBe('30');
    });

    it('keeps the name and shows the message', async () => {
      const tree = await failedSubmit(['scores:read']);
      expect(nameField(tree)?.props.defaultValue).toBe('staging');
      expect(leaves(tree).join('\n')).toContain('This game has reached its key limit');
    });

    it('shows the scope error when no scope is checked, with nothing checked', async () => {
      const tree = await failedSubmit([]);
      expect(actionState().fieldErrors?.scopes).toBe('Choose at least one scope');
      expect(scopeBoxes(tree)).toEqual({ 'scores:read': false, 'scores:write': false });
      expect(leaves(tree).join('\n')).toContain('Choose at least one scope');
    });
  });

  it('goes back to its defaults after a successful create', async () => {
    const tree = await successfulSubmit();
    expect(scopeBoxes(tree)).toEqual(ALL_CHECKED);
    const select = expirySelect(tree);
    expect(select.props.value ?? select.props.defaultValue).toBe('never');
    expect(nameField(tree)?.props.defaultValue ?? '').toBe('');
  });

  it('still says that the key was created, once the key is gone', async () => {
    const tree = await successfulSubmit();
    expect(actionState()).toMatchObject({ status: 'success', message: 'Key "prod" created.' });
    expect(leaves(tree, KeyRevealDialog).join('\n')).toContain('Key "prod" created.');
  });
});

// FR-KEY-2 and SEC-WEB-10: the plaintext key is shown once, in the dialog, and is gone when the
// user closes it.
describe('KeyCreateForm reveal', () => {
  const closeDialog = (tree: ReactNode) => (dialogOf(tree).props.onClose as () => void)();

  it('keeps the dialog closed until a key has been created', async () => {
    expect(dialogOf(render()).props.created).toBeNull();
    expect(dialogOf(await failedSubmit(['scores:read'])).props.created).toBeNull();
  });

  it('opens the dialog with the new key after a successful create', async () => {
    const dialog = dialogOf(await successfulSubmit());
    expect(dialog.props.created).toMatchObject({ name: 'prod', key: KEY });
  });

  it('renders the key nowhere but the dialog', async () => {
    const tree = await successfulSubmit();
    expect(dialogOf(tree).props.created).toMatchObject({ key: KEY });
    expect(leaves(tree, KeyRevealDialog).join('\n')).not.toContain(KEY);
  });

  it('drops the key from the page once the user is done with the dialog', async () => {
    closeDialog(await successfulSubmit());
    const tree = render();
    expect(dialogOf(tree).props.created).toBeNull();
    expect(leaves(tree).join('\n')).not.toContain(KEY);
  });

  it('opens again for the next key', async () => {
    closeDialog(await successfulSubmit('key_1', KEY));
    expect(dialogOf(render()).props.created).toBeNull();

    const nextKey = 'mos_ANOTHER0NEANOTHER0NEANOTHER0NEANOTHER0NEANOTHER0_d4e5f6';
    const second = await successfulSubmit('key_2', nextKey);
    expect(dialogOf(second).props.created).toMatchObject({ key: nextKey });
  });

  // F1: a second close must not undo the first.
  it('stays closed when it is closed a second time', async () => {
    const first = await successfulSubmit();
    closeDialog(first);
    const afterFirst = render();
    expect(dialogOf(afterFirst).props.created).toBeNull();

    closeDialog(afterFirst); // the handler of the re-rendered, already closed dialog
    const afterSecond = render();
    expect(dialogOf(afterSecond).props.created).toBeNull();

    closeDialog(first); // and the stale one, as a double click on Done would deliver it
    const tree = render();
    expect(dialogOf(tree).props.created).toBeNull();
    expect(leaves(tree).join('\n')).not.toContain(KEY);
    expect(JSON.stringify([hooks.slots, hooks.actionState])).not.toContain(KEY);
  });

  // F3: closing the dialog does not just hide the key. Nothing in the component keeps it.
  it('holds the key only while the dialog is open', async () => {
    const open = await successfulSubmit();
    // Open: the dialog's own state has it, and the action state does not.
    expect(JSON.stringify(hooks.slots)).toContain(KEY);
    expect(JSON.stringify(hooks.actionState)).not.toContain(KEY);
    expect(actionState().createdKey).toBeUndefined();

    closeDialog(open);
    render();
    expect(JSON.stringify(hooks.slots)).not.toContain(KEY);
    expect(JSON.stringify(hooks.actionState)).not.toContain(KEY);
  });

  // F2: React passes the form's current state to the action as its first argument, and a Server
  // Action's arguments travel in the request body (and `next dev` logs them).
  it('never hands the server action a state that has a key in it', async () => {
    const tree = await successfulSubmit('key_1', KEY);
    await successfulSubmit('key_2', 'mos_SECOND0NESECOND0NESECOND0NESECOND0NESECOND0_g7h8i9'); // key_1 still open
    closeDialog(tree);
    await failedSubmit(['scores:read']); // and after it was closed
    await successfulSubmit('key_3', 'mos_THIRD0NETHIRD0NETHIRD0NETHIRD0NETHIRD0NETH_j1k2l3');

    expect(action).toHaveBeenCalledTimes(4);
    for (const [prev] of action.mock.calls) {
      expect(prev).toEqual(IDLE);
      expect(JSON.stringify(prev)).not.toContain('mos_');
    }
  });
});
