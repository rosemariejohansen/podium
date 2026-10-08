import type { GameDto } from '@mos/contracts';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionState } from '@/lib/action-state';
import { GameSettingsForm } from './game-settings-form';

const mock = vi.hoisted(() => ({ state: { status: 'idle' } as ActionState }));

// GameSettingsForm's only hook is useActionState; with it stubbed, calling the component
// returns its element tree for a given action state.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useActionState: () => [mock.state, () => undefined] };
});

type Props = Record<string, unknown> & { children?: ReactNode };

/** Depth-first search of an element tree for the first element whose props match. */
function find(node: ReactNode, match: (props: Props) => boolean): ReactElement<Props> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child as ReactNode, match);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<Props>(node)) return undefined;
  if (match(node.props)) return node;
  return find(node.props.children, match);
}

const game: GameDto = {
  id: 'g1',
  name: 'Asteroids',
  slug: 'asteroids',
  description: 'Shoot rocks',
  isPublic: true,
  createdAt: '2026-10-08T00:00:00.000Z',
  leaderboardCount: 0,
  activeKeyCount: 0,
};

function render(state: ActionState) {
  mock.state = state;
  return GameSettingsForm({ game, action: async () => state });
}

describe('GameSettingsForm', () => {
  it('shows a description field error under the textarea, like the name field', () => {
    const tree = render({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { description: 'Too long' },
      values: { name: 'Asteroids', description: 'x'.repeat(300) },
    });
    const textarea = find(tree, (p) => p.name === 'description');
    expect(textarea?.props).toMatchObject({
      id: 'field-description',
      'aria-invalid': true,
      'aria-describedby': 'field-description-error',
    });
    const error = find(tree, (p) => p.id === 'field-description-error');
    expect(error?.props.children).toBe('Too long');
  });

  it('renders no description error markup without a description error', () => {
    const tree = render({ status: 'error', fieldErrors: { name: 'Required' } });
    const textarea = find(tree, (p) => p.name === 'description');
    expect(textarea?.props['aria-invalid']).toBeUndefined();
    expect(textarea?.props['aria-describedby']).toBeUndefined();
    expect(find(tree, (p) => p.id === 'field-description-error')).toBeUndefined();
  });
});
