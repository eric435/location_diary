<script setup lang="ts">
// App-wide top bar: brand (links home), current user, and logout.
import { useRouter, RouterLink } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

async function onLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="app-header">
    <RouterLink :to="{ name: 'home' }" class="app-header__brand">Location Diary</RouterLink>
    <div class="app-header__user">
      <span v-if="auth.user">{{ auth.user.email }}</span>
      <Button label="Log out" severity="secondary" size="small" @click="onLogout" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--p-content-border-color, #e5e7eb);
}

.app-header__brand {
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}

.app-header__user {
  display: flex;
  align-items: center;
  gap: 1rem;
}
</style>
