import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { SelectField } from './fields';

type SelectElement = ReactElement<{
  id?: string;
  name?: string;
  defaultValue?: string;
  children?: ReactNode;
}>;

/** Depth-first search of a rendered element tree for the native <select>. */
function findSelect(node: ReactNode): SelectElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSelect(child as ReactNode);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'select') return node as SelectElement;
  return findSelect(node.props.children);
}

const options = [
  createElement('option', { key: 'DESC', value: 'DESC' }, 'Higher is better'),
  createElement('option', { key: 'ASC', value: 'ASC' }, 'Lower is better'),
];

function renderSelect(defaultValue: string) {
  // SelectField has no hooks, so calling it returns its element tree.
  const select = findSelect(
    SelectField({ label: 'Ranking', name: 'sortOrder', defaultValue, children: options }),
  );
  expect(select, 'SelectField renders a native <select>').toBeDefined();
  return select!;
}

describe('SelectField', () => {
  it('renders a named native select whose id matches its label', () => {
    const select = renderSelect('DESC');
    expect(select.props).toMatchObject({
      id: 'field-sortOrder',
      name: 'sortOrder',
      defaultValue: 'DESC',
    });
    expect(select.props.children).toBe(options);
  });

  // React writes <option>.defaultSelected only when a select mounts, and React 19 runs a
  // native form.reset() after every form action, so a select that is only re-rendered with a
  // new defaultValue snaps back to its mount-time choice after a failed submit (review F1).
  // Keying on the value makes a changed echoed value remount the select.
  it('keys the select on its default value so an echoed value remounts it', () => {
    expect(renderSelect('ASC').key).toBe('ASC');
    expect(renderSelect('DESC').key).toBe('DESC');
  });
});
