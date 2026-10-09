import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { KeyRevealDialog } from './key-reveal-dialog';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));

// useState keeps its slots between renders, so a test can click and render again.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
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

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map((child) => text(child as ReactNode)).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<Props>(node) ? text(node.props.children) : '';
}

const KEY = 'mos_SHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCESHOWN0NCE_a1b2c3';
const created = { name: 'prod', key: KEY };

function render(props: { created: { name: string; key: string } | null; onClose?: () => void }) {
  hooks.cursor = 0;
  return KeyRevealDialog({ created: props.created, onClose: props.onClose ?? (() => undefined) });
}
const button = (tree: ReactNode, label: string) =>
  findAll(tree, (el) => el.props.children === label)[0];
/** The text of every alert in the dialog (a failure message, not the key or the headline). */
const alerts = (tree: ReactNode) =>
  findAll(tree, (el) => el.props.role === 'alert').map((el) => text(el.props.children));
const keyElements = (tree: ReactNode) =>
  findAll(tree, (el) => el.props['data-testid'] === 'new-api-key');

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('KeyRevealDialog', () => {
  it('is open while there is a key, and shows it in the new-api-key element', () => {
    const tree = render({ created });
    expect(tree.type).toBe(Dialog);
    expect(tree.props.open).toBe(true);
    const shown = keyElements(tree);
    expect(shown).toHaveLength(1);
    expect(text(shown[0]!.props.children)).toBe(KEY);
  });

  it('names the key and warns that it cannot be seen again', () => {
    const copy = text(render({ created }));
    expect(copy).toContain('prod');
    expect(copy).toMatch(/see this key again/i);
  });

  it('is closed, and holds no key, when there is nothing to reveal', () => {
    const tree = render({ created: null });
    expect(tree.props.open).toBe(false);
    expect(text(tree)).not.toContain(KEY);
    expect(keyElements(tree).every((el) => text(el.props.children) === '')).toBe(true);
  });

  // F4: the dialog is the only place the key is ever shown, so a stray click or key press must not
  // close it. Only the Done button does.
  describe('dismissal', () => {
    type OnOpenChange = (open: boolean, details: { reason: string; cancel: () => void }) => void;
    const REASONS = [
      'outside-press',
      'escape-key',
      'focus-out',
      'close-press',
      'imperative-action',
    ];

    it('turns off dismissal by clicking outside', () => {
      expect(render({ created }).props.disablePointerDismissal).toBe(true);
    });

    it.each(REASONS)('refuses to close for %s', (reason) => {
      const onClose = vi.fn();
      const cancel = vi.fn();
      (render({ created, onClose }).props.onOpenChange as OnOpenChange)(false, { reason, cancel });
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ignores an open request', () => {
      const onClose = vi.fn();
      const cancel = vi.fn();
      (render({ created, onClose }).props.onOpenChange as OnOpenChange)(true, {
        reason: 'trigger-press',
        cancel,
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    });

    it('has no X button, so Done is the one way out', () => {
      const [content] = findAll(render({ created }), (el) => el.type === DialogContent);
      expect(content!.props.showCloseButton).toBe(false);
    });
  });

  it('closes from the Done button', () => {
    const onClose = vi.fn();
    (button(render({ created, onClose }), 'Done')!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('copies the key to the clipboard and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onClick = button(render({ created }), 'Copy')!.props.onClick as () => Promise<void>;
    await onClick();
    expect(writeText).toHaveBeenCalledWith(KEY);
    const tree = render({ created });
    expect(button(tree, 'Copied')).toBeDefined();
    expect(alerts(tree)).toEqual([]);
  });

  // F5: a copy can fail (no permission, no focus, or no navigator.clipboard at all on plain
  // http). The user has to be told, or they close the dialog believing the key is on the clipboard.
  describe('when the copy fails', () => {
    const MANUAL = /select the key and copy it manually/i;
    const refused = () =>
      vi.fn(async () => {
        throw new DOMException('Write permission denied.', 'NotAllowedError');
      });
    const clickCopy = () =>
      (button(render({ created }), 'Copy')!.props.onClick as () => Promise<void>)();

    it('says to select the key and copy it manually, and does not claim it copied', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: refused() } });
      await clickCopy();
      const tree = render({ created });
      expect(alerts(tree).join(' ')).toMatch(MANUAL);
      expect(button(tree, 'Copied')).toBeUndefined();
      expect(button(tree, 'Copy')).toBeDefined();
    });

    it('handles the rejection instead of leaving it unhandled', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: refused() } });
      await expect(clickCopy()).resolves.toBeUndefined();
    });

    it('also says so when there is no clipboard API', async () => {
      vi.stubGlobal('navigator', {});
      await expect(clickCopy()).resolves.toBeUndefined();
      expect(alerts(render({ created })).join(' ')).toMatch(MANUAL);
    });

    it('keeps the key selectable', () => {
      const [shown] = keyElements(render({ created }));
      expect(String(shown!.props.className)).toMatch(/(^|\s)select-all(\s|$)/);
    });

    it('drops the message after a copy that works', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: refused() } });
      await clickCopy();
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
      await clickCopy();
      const tree = render({ created });
      expect(alerts(tree)).toEqual([]);
      expect(button(tree, 'Copied')).toBeDefined();
    });

    it('forgets the failure once the dialog is closed', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: refused() } });
      await clickCopy();
      (button(render({ created }), 'Done')!.props.onClick as () => void)();
      expect(alerts(render({ created: { name: 'staging', key: 'mos_NEXT' } }))).toEqual([]);
    });
  });

  it('forgets that it copied once it is closed', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => undefined) } });
    await (button(render({ created }), 'Copy')!.props.onClick as () => Promise<void>)();
    (button(render({ created }), 'Done')!.props.onClick as () => void)();
    const next = render({ created: { name: 'staging', key: 'mos_NEXT' } });
    expect(button(next, 'Copy')).toBeDefined();
    expect(button(next, 'Copied')).toBeUndefined();
  });
});
