// Shared mounting helper for component tests. Installs the same plugins the
// real app uses (Pinia, PrimeVue + its Toast/Confirmation services) so PrimeVue
// components and the `useToast`/`useConfirm` composables work under test.
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import type { Component } from 'vue'

export function mountWithPlugins<C extends Component>(
  component: C,
  options: ComponentMountingOptions<C> = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [pinia, PrimeVue, ToastService, ConfirmationService, ...(options.global?.plugins ?? [])],
    },
  })
}
