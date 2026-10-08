import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  formValues,
  fromZodError,
  nullableNum,
  nullableText,
  num,
  str,
  text,
} from './action-state';

const fd = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(entries)) data.set(k, v);
  return data;
};

describe('form readers', () => {
  const data = fd({ name: ' Neo ', empty: '   ', n: '42', bad: 'abc' });
  it('str returns the raw string, or "" when missing', () => {
    expect(str(data, 'name')).toBe(' Neo ');
    expect(str(data, 'missing')).toBe('');
  });
  it('text and nullableText treat blank as absent', () => {
    expect(text(data, 'empty')).toBeUndefined();
    expect(nullableText(data, 'empty')).toBeNull();
    expect(text(data, 'name')).toBe(' Neo ');
  });
  it('num parses, keeps NaN for the schema to reject, and treats blank as absent', () => {
    expect(num(data, 'n')).toBe(42);
    expect(num(data, 'bad')).toBeNaN();
    expect(num(data, 'empty')).toBeUndefined();
    expect(nullableNum(data, 'empty')).toBeNull();
  });
  it('formValues echoes submitted strings for re-rendering', () => {
    expect(formValues(fd({ a: '1', b: 'x' }))).toEqual({ a: '1', b: 'x' });
  });
});

describe('fromZodError', () => {
  it('maps the first issue per field and echoes values', () => {
    const schema = z.object({
      name: z.string().min(1, 'Required'),
      slug: z.string().min(3, 'Too short'),
    });
    const result = schema.safeParse({ name: '', slug: 'a' });
    const state = fromZodError(result.error!, fd({ name: '', slug: 'a' }));
    expect(state).toEqual({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { name: 'Required', slug: 'Too short' },
      values: { name: '', slug: 'a' },
    });
  });
});
