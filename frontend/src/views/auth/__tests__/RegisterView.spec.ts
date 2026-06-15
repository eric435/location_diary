import { describe, it, expect, beforeEach, vi } from 'vitest'

import RegisterView from '../RegisterView.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/lib/http'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  RouterLink: { template: '<a><slot /></a>' },
}))

beforeEach(() => push.mockClear())

describe('RegisterView', () => {
  it('registers and navigates home on success', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    const auth = useAuthStore()
    const register = vi.spyOn(auth, 'register').mockResolvedValue()

    await wrapper.get('#email').setValue('new@example.com')
    await wrapper.get('#password').setValue('sup3rSecret!')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith({ name: 'home' }))

    expect(register).toHaveBeenCalledWith('new@example.com', 'sup3rSecret!')
  })

  it('maps API field errors onto their fields', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    const auth = useAuthStore()
    vi.spyOn(auth, 'register').mockRejectedValue(
      new ApiError(400, { email: ['Already registered.'], password: ['Too common.'] }, 'bad'),
    )

    await wrapper.get('#email').setValue('dup@example.com')
    await wrapper.get('#password').setValue('password')
    await wrapper.get('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('Already registered.')
      expect(wrapper.text()).toContain('Too common.')
    })
    expect(push).not.toHaveBeenCalled()
  })

  it('shows soft-validation errors on email blur', async () => {
    const wrapper = mountWithPlugins(RegisterView)
    const auth = useAuthStore()
    const validate = vi
      .spyOn(auth, 'validate')
      .mockResolvedValue({ valid: false, email: ['That email is taken.'] })

    await wrapper.get('#email').setValue('taken@example.com')
    await wrapper.get('#email').trigger('blur')

    await vi.waitFor(() => expect(wrapper.text()).toContain('That email is taken.'))
    expect(validate).toHaveBeenCalled()
  })
})
