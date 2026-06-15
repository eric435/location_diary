import { describe, it, expect, beforeEach, vi } from 'vitest'

import { apiFetch } from '../http'
import {
  toWkt,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  listLocations,
  createLocation,
  updateLocation,
  linkLocation,
  updateEventLocation,
  unlinkLocation,
  listEventLocations,
  listEventMedia,
  listEventMediaPage,
  listMediaByLocation,
  createMedia,
  updateMedia,
  deleteMedia,
  listMediaNear,
} from '../diary'

// Everything in diary.ts is a thin wrapper over apiFetch, so mock that and
// assert the path/method/body each helper produces.
vi.mock('../http', () => ({ apiFetch: vi.fn() }))

const mockApi = vi.mocked(apiFetch)

beforeEach(() => {
  mockApi.mockReset()
})

describe('toWkt', () => {
  it('builds POINT(lng lat) in the order the API expects', () => {
    expect(toWkt(-123.1, 49.2)).toBe('POINT(-123.1 49.2)')
  })
})

describe('createEvent', () => {
  it('POSTs to /events/ with the input body', async () => {
    mockApi.mockResolvedValueOnce({ id: 1 })
    await createEvent({ title: 'Trip', description: 'd' })
    expect(mockApi).toHaveBeenCalledWith('/events/', {
      method: 'POST',
      body: { title: 'Trip', description: 'd' },
    })
  })
})

describe('listEvents — pagination', () => {
  it('walks every page via `next` and concatenates the results', async () => {
    mockApi
      .mockResolvedValueOnce({ results: [{ id: 1 }], next: '/events/?page=2', previous: null, count: 2 })
      .mockResolvedValueOnce({ results: [{ id: 2 }], next: null, previous: null, count: 2 })

    const events = await listEvents()

    expect(events).toEqual([{ id: 1 }, { id: 2 }])
    expect(mockApi).toHaveBeenNthCalledWith(1, '/events/?page=1')
    expect(mockApi).toHaveBeenNthCalledWith(2, '/events/?page=2')
  })

  it('stops after one page when there is no `next`', async () => {
    mockApi.mockResolvedValueOnce({ results: [{ id: 1 }], next: null, previous: null, count: 1 })
    await listEvents()
    expect(mockApi).toHaveBeenCalledTimes(1)
  })
})

describe('listEventLocations — query string', () => {
  it('appends page with `&` when the path already has a query', async () => {
    mockApi.mockResolvedValueOnce({ results: [], next: null, previous: null, count: 0 })
    await listEventLocations(7)
    expect(mockApi).toHaveBeenCalledWith('/event-locations/?event=7&page=1')
  })
})

describe('createMedia', () => {
  it('builds multipart FormData with the scalar fields alongside the file', async () => {
    mockApi.mockResolvedValueOnce({ id: 5 })
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })

    await createMedia({ event: 3, file, location: 8, note: 'hi', timestamp: '2026-06-14T00:00:00Z' })

    const [path, opts] = mockApi.mock.calls[0]!
    expect(path).toBe('/media/')
    expect(opts!.method).toBe('POST')
    const body = opts!.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('event')).toBe('3')
    expect(body.get('location')).toBe('8')
    expect(body.get('note')).toBe('hi')
    expect(body.get('timestamp')).toBe('2026-06-14T00:00:00Z')
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('omits optional fields that are null/empty', async () => {
    mockApi.mockResolvedValueOnce({ id: 6 })
    await createMedia({ event: 3, file: new File(['x'], 'a.jpg'), location: null, note: '' })

    const body = mockApi.mock.calls[0]![1]!.body as FormData
    expect(body.has('location')).toBe(false)
    expect(body.has('note')).toBe(false)
    expect(body.has('timestamp')).toBe(false)
  })
})

describe('listMediaNear', () => {
  it('encodes the near=lng,lat,km spatial filter', async () => {
    mockApi.mockResolvedValueOnce({ results: [], next: null, previous: null, count: 0 })
    await listMediaNear(3, -123.1, 49.2, 5, 20)
    expect(mockApi).toHaveBeenCalledWith(
      '/media/?event=3&near=-123.1,49.2,5&page=1&page_size=20',
    )
  })
})

// The remaining helpers are one-line wrappers; a table keeps the path/method
// contract honest without a paragraph of boilerplate per endpoint. Each entry
// invokes the helper, then asserts the single apiFetch call it produced.
describe('endpoint contracts', () => {
  const page = { results: [], next: null, previous: null, count: 0 }

  const cases: Array<{
    name: string
    run: () => Promise<unknown>
    path: string
    method?: string
    body?: unknown
    /** This helper paginates, so the path carries a page query. */
    paged?: boolean
  }> = [
    { name: 'getEvent', run: () => getEvent(5), path: '/events/5/' },
    {
      name: 'updateEvent',
      run: () => updateEvent(5, { title: 't', description: 'd' }),
      path: '/events/5/',
      method: 'PATCH',
      body: { title: 't', description: 'd' },
    },
    { name: 'deleteEvent', run: () => deleteEvent(5), path: '/events/5/', method: 'DELETE' },
    { name: 'listLocations', run: () => listLocations(), path: '/locations/?page=1', paged: true },
    {
      name: 'createLocation',
      run: () => createLocation({ title: 'YVR', point: 'POINT(0 0)' }),
      path: '/locations/',
      method: 'POST',
      body: { title: 'YVR', point: 'POINT(0 0)' },
    },
    {
      name: 'updateLocation',
      run: () => updateLocation(2, { title: 'New' }),
      path: '/locations/2/',
      method: 'PATCH',
      body: { title: 'New' },
    },
    {
      name: 'linkLocation',
      run: () => linkLocation({ event: 1, location: 2 }),
      path: '/event-locations/',
      method: 'POST',
      body: { event: 1, location: 2 },
    },
    {
      name: 'updateEventLocation',
      run: () => updateEventLocation(3, { arrival: null }),
      path: '/event-locations/3/',
      method: 'PATCH',
      body: { arrival: null },
    },
    {
      name: 'unlinkLocation',
      run: () => unlinkLocation(3),
      path: '/event-locations/3/',
      method: 'DELETE',
    },
    {
      name: 'listEventMedia',
      run: () => listEventMedia(4),
      path: '/media/?event=4&page=1',
      paged: true,
    },
    {
      name: 'listEventMediaPage',
      run: () => listEventMediaPage(4, 2, 12),
      path: '/media/?event=4&page=2&page_size=12',
    },
    {
      name: 'listMediaByLocation',
      run: () => listMediaByLocation(4, 9, 12),
      path: '/media/?event=4&location=9&page=1&page_size=12',
    },
    {
      name: 'updateMedia',
      run: () => updateMedia(7, { note: 'hi' }),
      path: '/media/7/',
      method: 'PATCH',
      body: { note: 'hi' },
    },
    { name: 'deleteMedia', run: () => deleteMedia(7), path: '/media/7/', method: 'DELETE' },
  ]

  for (const c of cases) {
    it(`${c.name} -> ${c.method ?? 'GET'} ${c.path}`, async () => {
      mockApi.mockResolvedValueOnce(c.paged ? page : {})
      await c.run()

      const expectedArgs = c.method ? [c.path, { method: c.method, body: c.body }] : [c.path]
      expect(mockApi).toHaveBeenCalledWith(...expectedArgs)
    })
  }
})
