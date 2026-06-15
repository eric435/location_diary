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

/**
 * A piece of media attached to an event (and optionally one of its locations).
 * The raw upload is write-only: the API derives `mime_type`/`media_type` from
 * it and hands back `file_url`, a short-lived signed URL, for display/download.
 */
export interface Media {
  id: number
  event: number
  location: number | null
  note: string
  file_url: string | null
  mime_type: string
  /** 'img' for images, 'txt' for everything else (derived server-side). */
  media_type: 'img' | 'txt'
  /** When the media itself was created, e.g. a photo's capture time. */
  timestamp: string | null
  created_at: string
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

/** Update a location's name/position. Note: locations are shared, so this
 * affects every event the location is linked to. */
export function updateLocation(
  id: number,
  input: Partial<LocationInput>,
): Promise<DiaryLocation> {
  return apiFetch<DiaryLocation>(`/locations/${id}/`, { method: 'PATCH', body: input })
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

// --- Media ----------------------------------------------------------------

/** Fields a client may set when creating media. `file` is the raw upload. */
export interface MediaInput {
  event: number
  file: File
  location?: number | null
  note?: string
  /** ISO string, or null when unknown. */
  timestamp?: string | null
}

/** Fields editable after upload — the file itself is immutable here. */
export interface MediaUpdate {
  note?: string
  location?: number | null
  timestamp?: string | null
}

/** All media on a single event, newest first (the API's default ordering). */
export function listEventMedia(eventId: number): Promise<Media[]> {
  return fetchAll<Media>(`/media/?event=${eventId}`)
}

/** One page of an event's media, newest first. The panel paginates rather than
 * loading every item, so a media-heavy event stays manageable. */
export function listEventMediaPage(
  eventId: number,
  page: number,
  pageSize: number,
): Promise<Paginated<Media>> {
  return apiFetch<Paginated<Media>>(
    `/media/?event=${eventId}&page=${page}&page_size=${pageSize}`,
  )
}

export function createMedia(input: MediaInput): Promise<Media> {
  // Multipart: the file rides alongside the scalar fields. apiFetch leaves the
  // Content-Type unset for FormData so the browser sets the boundary.
  const form = new FormData()
  form.append('event', String(input.event))
  form.append('file', input.file)
  if (input.location != null) form.append('location', String(input.location))
  if (input.note) form.append('note', input.note)
  if (input.timestamp) form.append('timestamp', input.timestamp)
  return apiFetch<Media>('/media/', { method: 'POST', body: form })
}

/** Patch the editable fields of an existing media row (note/location/timestamp). */
export function updateMedia(id: number, input: MediaUpdate): Promise<Media> {
  return apiFetch<Media>(`/media/${id}/`, { method: 'PATCH', body: input })
}

export function deleteMedia(id: number): Promise<void> {
  return apiFetch<void>(`/media/${id}/`, { method: 'DELETE' })
}
