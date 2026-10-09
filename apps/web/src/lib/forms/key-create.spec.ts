import { describe, expect, it } from 'vitest';
import { readKeyCreateForm } from './key-create';

const form = (scopes: string[], expiry: string | null, name = 'prod') => {
  const fd = new FormData();
  fd.set('name', name);
  for (const scope of scopes) fd.append('scopes', scope);
  if (expiry !== null) fd.set('expiresInDays', expiry);
  return fd;
};

describe('readKeyCreateForm', () => {
  it('collects every checked scope', () => {
    expect(readKeyCreateForm(form(['scores:read', 'scores:write'], 'never'))).toEqual({
      name: 'prod',
      scopes: ['scores:read', 'scores:write'],
      expiresInDays: null,
    });
  });
  it('returns an empty scope list when nothing is checked', () => {
    expect(readKeyCreateForm(form([], 'never')).scopes).toEqual([]);
  });
  it('turns the expiry select into days, and a missing value into "never"', () => {
    expect(readKeyCreateForm(form(['scores:read'], '90')).expiresInDays).toBe(90);
    expect(readKeyCreateForm(form(['scores:read'], null)).expiresInDays).toBeNull();
  });
  it('passes tampered values through for the schema to reject', () => {
    expect(readKeyCreateForm(form(['scores:read'], '7')).expiresInDays).toBe(7);
  });
});
