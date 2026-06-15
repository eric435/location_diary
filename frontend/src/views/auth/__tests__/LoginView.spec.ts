import { describe, it, expect, beforeEach, vi } from 'vitest'

import LoginView from '../LoginView.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/lib/http'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  RouterLink: { template: '<a><slot /></a>' },
}))

beforeEach(() => push.mockClear())

async function fillCredentials(wrapper: ReturnType<typeof mountWithPlugins>) {
  await wrapper.get('#email').setValue('owner@example.com')
  await wrapper.get('#password').setValue('sup3rSecret!')
}

describe('LoginView', () => {
  it('logs in and navigates home on success', async () => {
    const wrapper = mountWithPlugins(LoginView)
    const auth = useAuthStore()
    const login = vi.spyOn(auth, 'login').mockResolvedValue()

    await fillCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(push).toHaveBeenCalled())

    expect(login).toHaveBeenCalledWith('owner@example.com', 'sup3rSecret!')
    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })

  it('shows the API error message and stays on the page on failure', async () => {
    const wrapper = mountWithPlugins(LoginView)
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockRejectedValue(new ApiError(401, null, 'Invalid credentials.'))

    await fillCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Invalid credentials.'))

    expect(push).not.toHaveBeenCalled()
  })

  it('shows a generic message for non-API errors', async () => {
    const wrapper = mountWithPlugins(LoginView)
    const auth = useAuthStore()
    vi.spyOn(auth, 'login').mockRejectedValue(new Error('boom'))

    await fillCredentials(wrapper)
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/something went wrong/i))
  })
})
