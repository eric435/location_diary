import { describe, it, expect, beforeEach, vi } from 'vitest'

import AppHeader from '../AppHeader.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import { useAuthStore } from '@/stores/auth'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  // RouterLink isn't under test here; a passthrough stub keeps it rendering.
  RouterLink: { template: '<a><slot /></a>' },
}))

beforeEach(() => push.mockClear())

describe('AppHeader', () => {
  it('shows the signed-in user’s email', () => {
    const wrapper = mountWithPlugins(AppHeader)
    const auth = useAuthStore()
    auth.user = {
      id: 1,
      email: 'owner@example.com',
      is_active: true,
      is_staff: false,
      date_joined: '2026-06-14T00:00:00Z',
    }
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.text()).toContain('owner@example.com')
    })
  })

  it('logs out and redirects to the login page', async () => {
    const wrapper = mountWithPlugins(AppHeader)
    const auth = useAuthStore()
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue()

    await wrapper.get('button').trigger('click')
    await wrapper.vm.$nextTick()

    expect(logout).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith({ name: 'login' })
  })
})
