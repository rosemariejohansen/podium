import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

describe('formatDate', () => {
  it('formats an ISO timestamp as a medium date', () => {
    expect(formatDate('2026-10-03T12:00:00.000Z')).toBe('Oct 3, 2026');
  });
  it('shows a placeholder for null', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(null, 'never')).toBe('never');
  });
});
