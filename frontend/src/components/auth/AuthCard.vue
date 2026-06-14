<script setup lang="ts">
// Shared presentational shell for the login & register pages: a centered card
// with a title and a slot for the form. Keeps the two auth pages consistent.
import Card from 'primevue/card'

defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <main class="auth-screen">
    <Card class="auth-card">
      <template #title>
        <h1 class="auth-title">{{ title }}</h1>
      </template>
      <template #subtitle v-if="subtitle">
        <span>{{ subtitle }}</span>
      </template>
      <template #content>
        <slot />
      </template>
      <template #footer>
        <slot name="footer" />
      </template>
    </Card>
  </main>
</template>

<style scoped>
.auth-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.auth-card {
  width: 100%;
  max-width: 24rem;
}

.auth-title {
  margin: 0;
  font-size: 1.5rem;
}
</style>
