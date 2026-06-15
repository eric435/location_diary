import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useAuthStore } from '@/stores/auth'

// Re-import the router fresh per test so each gets clean history and binds its
// guard to the active Pinia. The lazy route components are stubbed to keep the
// test fast and free of PrimeVue/Maps imports.
vi.mock('@/views/HomeView.vue', () => ({ default: { template: '<div>home</div>' } }))
vi.mock('@/views/EventDetailView.vue', () => ({ default: { template: '<div>detail</div>' } }))
vi.mock('@/views/auth/LoginView.vue', () => ({ default: { template: '<div>login</div>' } }))
vi.mock('@/views/auth/RegisterView.vue', () => ({ default: { template: '<div>register</div>' } }))

async function freshRouter() {
  vi.resetModules()
  const mod = await import('../index')
  // Don't await isReady(): an un-installed router performs no initial
  // navigation, so isReady() never resolves. push() drives navigation (and the
  // guards) directly, which is all we're testing.
  return mod.default
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('router guards', () => {
  it('redirects an anonymous user away from a protected route to login', async () => {
    const router = await freshRouter()
    await router.push({ name: 'home' })
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('lets an authenticated user reach a protected route', async () => {
    const auth = useAuthStore()
    auth.user = { id: 1, email: 'a@b.c', is_active: true, is_staff: false, date_joined: '' }

    const router = await freshRouter()
    await router.push({ name: 'home' })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('keeps an authenticated user out of guest-only auth pages', async () => {
    const auth = useAuthStore()
    auth.user = { id: 1, email: 'a@b.c', is_active: true, is_staff: false, date_joined: '' }

    const router = await freshRouter()
    await router.push({ name: 'login' })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('allows an anonymous user onto the login page', async () => {
    const router = await freshRouter()
    await router.push({ name: 'login' })
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('redirects the root path to home (then to login when anonymous)', async () => {
    const router = await freshRouter()
    await router.push('/')
    // '/' -> home (requiresAuth) -> login for an anonymous visitor.
    expect(router.currentRoute.value.name).toBe('login')
  })
})
