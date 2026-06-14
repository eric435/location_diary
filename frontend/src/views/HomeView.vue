<script setup lang="ts">
// Placeholder landing page for authenticated users.
import { useRouter } from 'vue-router'
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
  <div class="home">
    <header class="home-header">
      <strong>Location Diary</strong>
      <div class="home-user">
        <span v-if="auth.user">{{ auth.user.email }}</span>
        <Button label="Log out" severity="secondary" size="small" @click="onLogout" />
      </div>
    </header>

    <main class="home-body">
      <h1>Welcome 👋</h1>
      <p>You're signed in. This is a placeholder home page.</p>
    </main>
  </div>
</template>

<style scoped>
.home-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--p-content-border-color, #e5e7eb);
}

.home-user {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.home-body {
  padding: 2rem 1.5rem;
}
</style>
