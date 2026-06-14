// Tiny fetch wrapper for the session-based Django API.
//
// The backend uses cookie sessions + CSRF (see server/apps/users). For unsafe
// methods we must echo the `csrftoken` cookie back in the `X-CSRFToken` header,
// and every request must send cookies (`credentials: 'include'`).
//
// All paths are relative to `/api`, which the Vite dev server proxies to the
// Django backend (see vite.config.ts). In production, serve the SPA behind a
// reverse proxy that routes `/api` to Django.

const API_BASE = '/api'

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)'))
  return match ? decodeURIComponent(match[2]!) : null
}

/** Bootstrap the CSRF cookie if we don't already have one. */
export async function ensureCsrf(): Promise<void> {
  if (!getCookie('csrftoken')) {
    await fetch(`${API_BASE}/auth/csrf/`, { credentials: 'include' })
  }
}

/** Thrown for any non-2xx response. `message` is a user-presentable string. */
export class ApiError extends Error {
  status: number
  data: unknown

  constructor(status: number, data: unknown, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

// DRF returns either {"detail": "..."} or field errors like
// {"email": ["..."], "password": ["..."]}. Flatten to one readable string.
function extractMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const parts: string[] = []
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) parts.push(...value.map(String))
      else if (typeof value === 'string') parts.push(value)
    }
    if (parts.length) return parts.join(' ')
  }
  return `Request failed (${status})`
}

interface RequestOptions {
  method?: string
  body?: unknown
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers: Record<string, string> = {}

  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrf()
    const token = getCookie('csrftoken')
    if (token) headers['X-CSRFToken'] = token
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data, extractMessage(data, response.status))
  }
  return data as T
}
