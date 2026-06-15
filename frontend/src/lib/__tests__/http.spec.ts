import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { apiFetch, ensureCsrf, ApiError } from '../http'

// A minimal stand-in for a fetch Response. `apiFetch` only touches status, ok
// and json(), so that's all we model.
function mockResponse(
  body: unknown,
  { status = 200, ok }: { status?: number; ok?: boolean } = {},
) {
  ok ??= status >= 200 && status < 300
  return {
    status,
    ok,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  } as unknown as Response
}

function clearCookies() {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  clearCookies()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearCookies()
})

describe('apiFetch — requests', () => {
  it('GETs with credentials and no CSRF header, returning parsed JSON', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 1 }))

    const data = await apiFetch<{ id: number }>('/events/1/')

    expect(data).toEqual({ id: 1 })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/events/1/')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('include')
    expect(init.headers['X-CSRFToken']).toBeUndefined()
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('sends JSON body and the CSRF header on unsafe methods', async () => {
    document.cookie = 'csrftoken=tok123'
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }))

    await apiFetch('/events/', { method: 'POST', body: { title: 'Trip' } })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-CSRFToken']).toBe('tok123')
    expect(init.body).toBe(JSON.stringify({ title: 'Trip' }))
  })

  it('leaves Content-Type unset and passes FormData through unchanged', async () => {
    document.cookie = 'csrftoken=tok123'
    fetchMock.mockResolvedValueOnce(mockResponse({ id: 9 }))
    const form = new FormData()
    form.append('file', new File(['x'], 'a.txt'))

    await apiFetch('/media/', { method: 'POST', body: form })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBe(form)
  })

  it('bootstraps the CSRF cookie when missing before an unsafe request', async () => {
    // First call: the csrf bootstrap (sets the cookie). Second: the real POST.
    fetchMock.mockImplementationOnce(async (url: string) => {
      expect(url).toBe('/api/auth/csrf/')
      document.cookie = 'csrftoken=fresh'
      return mockResponse(undefined, { status: 204 })
    })
    fetchMock.mockResolvedValueOnce(mockResponse({ ok: true }))

    await apiFetch('/auth/login/', { method: 'POST', body: { email: 'a@b.c' } })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, loginInit] = fetchMock.mock.calls[1]!
    expect(loginInit.headers['X-CSRFToken']).toBe('fresh')
  })

  it('returns undefined for a 204 without reading a body', async () => {
    document.cookie = 'csrftoken=tok' // skip the bootstrap for this unsafe call
    fetchMock.mockResolvedValueOnce(mockResponse(undefined, { status: 204 }))
    await expect(apiFetch('/events/1/', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('apiFetch — errors', () => {
  // A cookie is present so the unsafe-method CSRF bootstrap is skipped and our
  // single fetch mock models the real request, not the bootstrap.
  beforeEach(() => {
    document.cookie = 'csrftoken=tok'
  })

  it('throws ApiError carrying status and the DRF "detail" message', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ detail: 'Invalid credentials.' }, { status: 401 }),
    )

    await expect(apiFetch('/auth/login/', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid credentials.',
    })
  })

  it('flattens DRF field errors into one message', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ email: ['Already taken.'], password: ['Too short.'] }, { status: 400 }),
    )

    const err = (await apiFetch('/auth/register/', { method: 'POST', body: {} }).catch(
      (e) => e,
    )) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('Already taken. Too short.')
    expect(err.data).toEqual({ email: ['Already taken.'], password: ['Too short.'] })
  })

  it('falls back to a generic message when the body is not parseable', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(undefined, { status: 500 }))
    await expect(apiFetch('/events/')).rejects.toThrow('Request failed (500)')
  })
})

describe('ensureCsrf', () => {
  it('fetches the csrf endpoint only when no cookie exists', async () => {
    fetchMock.mockResolvedValue(mockResponse(undefined, { status: 204 }))

    await ensureCsrf()
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/csrf/', { credentials: 'include' })

    fetchMock.mockClear()
    document.cookie = 'csrftoken=already'
    await ensureCsrf()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
