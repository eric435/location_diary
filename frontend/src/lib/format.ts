// Shared date/time formatting for the diary UI. Centralised so every view shows
// dates the same way (and so `null` timestamps render one consistent dash).

/** A calendar date, e.g. "June 14, 2026" (long) or "Jun 14, 2026" (short). */
export function formatDate(value: string, month: 'short' | 'long' = 'long'): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month, day: 'numeric' })
}

/** A date + time for arrival/departure stamps; "—" when unset. */
export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** A `Date` from a picker as an ISO string the API accepts, or `null` if unset. */
export function toIsoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null
}
