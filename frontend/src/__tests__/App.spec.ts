import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('mounts and renders the router outlet', () => {
    const wrapper = mount(App, {
      global: { stubs: { RouterView: { template: '<div class="router-view-stub" />' } } },
    })
    expect(wrapper.find('.router-view-stub').exists()).toBe(true)
  })
})
