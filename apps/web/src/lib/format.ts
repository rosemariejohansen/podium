const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export function formatDate(iso: string | null, empty = '—'): string {
  return iso ? dateFormat.format(new Date(iso)) : empty;
}
