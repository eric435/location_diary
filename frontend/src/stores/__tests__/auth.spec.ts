import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { apiFetch, ensureCsrf } from '@/lib/http'
import { useAuthStore } from '../auth'

vi.mock('@/lib/http', () => ({
  apiFetch: vi.fn(),
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
}))

const mockApi = vi.mocked(apiFetch)
const mockEnsureCsrf = vi.mocked(ensureCsrf)

const USER = { id: 1, email: 'owner@example.com', is_active: true, is_staff: false, date_joined: '2026-06-14T00:00:00Z' }

beforeEach(() => {
  setActivePinia(createPinia())
  mockApi.mockReset()
  mockEnsureCsrf.mockClear()
})

describe('useAuthStore', () => {
  it('starts unauthenticated', () => {
    const auth = useAuthStore()
    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
    expect(auth.ready).toBe(false)
  })

  it('login stores the user and flips isAuthenticated', async () => {
    mockApi.mockResolvedValueOnce(USER)
    const auth = useAuthStore()

    await auth.login('owner@example.com', 'pw12345!')

    expect(mockApi).toHaveBeenCalledWith('/auth/login/', {
      method: 'POST',
      body: { email: 'owner@example.com', password: 'pw12345!' },
    })
    expect(auth.user).toEqual(USER)
    expect(auth.isAuthenticated).toBe(true)
  })

  describe('initialize', () => {
    it('plants CSRF and restores an existing session', async () => {
      mockApi.mockResolvedValueOnce(USER)
      const auth = useAuthStore()

      await auth.initialize()

      expect(mockEnsureCsrf).toHaveBeenCalledOnce()
      expect(mockApi).toHaveBeenCalledWith('/auth/me/')
      expect(auth.user).toEqual(USER)
      expect(auth.ready).toBe(true)
    })

    it('treats a failed /me as logged out but still marks ready', async () => {
      mockApi.mockRejectedValueOnce(new Error('403'))
      const auth = useAuthStore()

      await auth.initialize()

      expect(auth.user).toBeNull()
      expect(auth.ready).toBe(true)
    })
  })

  it('register establishes the session (backend auto-logs-in)', async () => {
    mockApi.mockResolvedValueOnce(USER)
    const auth = useAuthStore()

    await auth.register('owner@example.com', 'pw12345!')

    expect(mockApi).toHaveBeenCalledWith('/auth/register/', {
      method: 'POST',
      body: { email: 'owner@example.com', password: 'pw12345!' },
    })
    expect(auth.isAuthenticated).toBe(true)
  })

  describe('validate', () => {
    it('only surfaces errors for fields the user actually supplied', async () => {
      mockApi.mockResolvedValueOnce({ valid: false, email: ['Taken.'], password: ['Weak.'] })
      const auth = useAuthStore()

      // Email supplied, password omitted → password errors are suppressed.
      const result = await auth.validate('owner@example.com')

      expect(result.email).toEqual(['Taken.'])
      expect(result.password).toBeUndefined()
    })
  })

  it('logout clears the user even if the request fails', async () => {
    mockApi.mockResolvedValueOnce(USER)
    const auth = useAuthStore()
    await auth.login('owner@example.com', 'pw12345!')

    // logout uses try/finally with no catch: it re-throws but still clears the
    // user in `finally`, so the session is gone regardless.
    mockApi.mockRejectedValueOnce(new Error('network'))
    await expect(auth.logout()).rejects.toThrow('network')

    expect(auth.user).toBeNull()
    expect(auth.isAuthenticated).toBe(false)
  })
})
