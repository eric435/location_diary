// API layer for the diary domain: events, locations, and the event<->location
// links. Thin wrappers over `apiFetch` that mirror the Django REST contract
// (see server/apps/events and server/apps/location).
//
// Locations are never managed on their own here — they exist in the context of
// an event, linked through the `event-locations` endpoint (the M2M through
// table, which also carries arrival/departure times).

import { apiFetch, type Paginated } from '@/lib/http'

/** An event owned by the current user. `user` is server-assigned. */
export interface DiaryEvent {
  id: number
  user: number
  title: string
  description: string
  created_at: string
}

/**
 * A geographic point. The API stores `point` as WKT (`POINT(lng lat)`) and
 * echoes back `lat`/`lng` as read-only conveniences. `events` is the read-only
 * side of the M2M — links are created via the event-locations endpoint.
 */
export interface DiaryLocation {
  id: number
  user: number
  events: number[]
  title: string
  point: string
  lat: number | null
  lng: number | null
  created_at: string
}

/**
 * A link between an event and a location (the through row). `location_detail`
 * is the nested, read-only location so a single list call renders everything.
 */
export interface EventLocation {
  id: number
  event: number
  location: number
  location_detail: DiaryLocation
  arrival: string | null
  departure: string | null
}

export interface EventInput {
  title: string
  description: string
}

export interface LocationInput {
  title: string
  /** WKT, e.g. `POINT(-123.1 49.2)`. Build it with `toWkt`. */
  point: string
}

export interface EventLocationInput {
  event: number
  location: number
  arrival?: string | null
  departure?: string | null
}

/** Build the WKT string the API expects from plain lng/lat numbers. */
export function toWkt(lng: number, lat: number): string {
  return `POINT(${lng} ${lat})`
}

// List endpoints are paginated (20/page). A personal diary can outgrow one
// page, so walk `next` and gather every row before handing it back.
async function fetchAll<T>(path: string): Promise<T[]> {
  const out: T[] = []
  let page = 1
  for (;;) {
    const sep = path.includes('?') ? '&' : '?'
    const data = await apiFetch<Paginated<T>>(`${path}${sep}page=${page}`)
    out.push(...data.results)
    if (!data.next) break
    page += 1
  }
  return out
}

// --- Events ---------------------------------------------------------------

export function listEvents(): Promise<DiaryEvent[]> {
  return fetchAll<DiaryEvent>('/events/')
}

export function getEvent(id: number): Promise<DiaryEvent> {
  return apiFetch<DiaryEvent>(`/events/${id}/`)
}

export function createEvent(input: EventInput): Promise<DiaryEvent> {
  return apiFetch<DiaryEvent>('/events/', { method: 'POST', body: input })
}

export function updateEvent(id: number, input: EventInput): Promise<DiaryEvent> {
  return apiFetch<DiaryEvent>(`/events/${id}/`, { method: 'PATCH', body: input })
}

export function deleteEvent(id: number): Promise<void> {
  return apiFetch<void>(`/events/${id}/`, { method: 'DELETE' })
}

// --- Locations ------------------------------------------------------------

/** Every location the user owns — used to attach existing ones to an event. */
export function listLocations(): Promise<DiaryLocation[]> {
  return fetchAll<DiaryLocation>('/locations/')
}

export function createLocation(input: LocationInput): Promise<DiaryLocation> {
  return apiFetch<DiaryLocation>('/locations/', { method: 'POST', body: input })
}

// --- Event <-> location links --------------------------------------------

/** The locations attached to a single event, with arrival/departure times. */
export function listEventLocations(eventId: number): Promise<EventLocation[]> {
  return fetchAll<EventLocation>(`/event-locations/?event=${eventId}`)
}

export function linkLocation(input: EventLocationInput): Promise<EventLocation> {
  return apiFetch<EventLocation>('/event-locations/', { method: 'POST', body: input })
}

export function updateEventLocation(
  id: number,
  input: Partial<EventLocationInput>,
): Promise<EventLocation> {
  return apiFetch<EventLocation>(`/event-locations/${id}/`, { method: 'PATCH', body: input })
}

/** Remove a location from an event (deletes the through row, not the location). */
export function unlinkLocation(id: number): Promise<void> {
  return apiFetch<void>(`/event-locations/${id}/`, { method: 'DELETE' })
}
