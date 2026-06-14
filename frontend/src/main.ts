import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'

import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(PrimeVue, {
  theme: {
    preset: Aura,
  },
})

// Restore any existing session (and plant the CSRF cookie) before the router
// runs its guards, so we don't flash the login page for already-authenticated
// users. Then install the router and mount.
const auth = useAuthStore(pinia)
auth.initialize().finally(() => {
  app.use(router)
  app.mount('#app')
})
