import { describe, it, expect } from 'vitest'

import { formatDate, formatDateTime, toIsoOrNull } from '../format'

// These wrap `Intl`/`toLocale*`, whose exact output depends on the host locale
// and timezone. We assert the contract (which pieces appear, the null/dash
// branches, ISO round-tripping) rather than a brittle exact string. Dates use a
// noon-UTC instant so no reasonable timezone shifts them to a different day.
const NOON_UTC = '2026-06-14T12:00:00Z'

describe('formatDate', () => {
  it('renders a long month by default', () => {
    const out = formatDate(NOON_UTC)
    expect(out).toContain('2026')
    expect(out).toMatch(/June/)
  })

  it('renders a short month when asked', () => {
    const out = formatDate(NOON_UTC, 'short')
    expect(out).toContain('2026')
    expect(out).toMatch(/Jun\b/)
    expect(out).not.toMatch(/June/)
  })
})

describe('formatDateTime', () => {
  it('returns an em dash for a null value', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('includes a time component for a real value', () => {
    const out = formatDateTime(NOON_UTC)
    // A "HH:MM" pattern is present regardless of locale (12h or 24h).
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('toIsoOrNull', () => {
  it('returns null for a null date', () => {
    expect(toIsoOrNull(null)).toBeNull()
  })

  it('serialises a Date to an ISO 8601 string', () => {
    expect(toIsoOrNull(new Date(NOON_UTC))).toBe('2026-06-14T12:00:00.000Z')
  })
})
