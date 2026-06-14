import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch, ensureCsrf } from '@/lib/http'

// Mirrors UserSerializer in server/apps/users/serializers.py.
export interface User {
  id: number
  email: string
  is_active: boolean
  is_staff: boolean
  date_joined: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  // True once the initial session check has completed, so the router doesn't
  // bounce an already-logged-in user to /login before we know who they are.
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  /** Run once on app start: plant the CSRF cookie and restore any session. */
  async function initialize(): Promise<void> {
    await ensureCsrf()
    try {
      user.value = await apiFetch<User>('/auth/me/')
    } catch {
      user.value = null // 403 = not logged in; anything else = treat as logged out
    } finally {
      ready.value = true
    }
  }

  async function login(email: string, password: string): Promise<void> {
    user.value = await apiFetch<User>('/auth/login/', {
      method: 'POST',
      body: { email, password },
    })
  }

  async function register(email: string, password: string): Promise<void> {
    // Backend auto-logs-in on register, so this also establishes the session.
    user.value = await apiFetch<User>('/auth/register/', {
      method: 'POST',
      body: { email, password },
    })
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout/', { method: 'POST' })
    } finally {
      user.value = null
    }
  }

  return { user, ready, isAuthenticated, initialize, login, register, logout }
})
