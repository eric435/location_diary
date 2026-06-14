<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
import AuthCard from '@/components/auth/AuthCard.vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/lib/http'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.register(email.value, password.value)
    router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard title="Create account" subtitle="Start your Location Diary">
    <form class="auth-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="field">
        <label for="email">Email</label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          fluid
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <Password
          input-id="password"
          v-model="password"
          toggle-mask
          autocomplete="new-password"
          required
          fluid
        />
      </div>

      <Button type="submit" label="Create account" :loading="submitting" fluid />
    </form>

    <template #footer>
      <p class="auth-switch">
        Already have an account?
        <RouterLink :to="{ name: 'login' }">Sign in</RouterLink>
      </p>
    </template>
  </AuthCard>
</template>

<style scoped>
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.auth-switch {
  margin: 0;
  text-align: center;
  font-size: 0.9rem;
}
</style>
