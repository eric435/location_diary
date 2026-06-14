<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
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
const emailErrors = ref<string[]>([])
const passwordErrors = ref<string[]>([])
const errors = ref<string[]>([])
const submitting = ref(false)

async function onSubmit() {
  errors.value = []
  submitting.value = true
  try {
    await auth.register(email.value, password.value)
    router.push({ name: 'home' })
  } catch (e) {
    if (e instanceof ApiError) {
      // Surface field errors under their fields; keep any top-level detail in
      // the banner.
      emailErrors.value = e.data?.email ?? []
      passwordErrors.value = e.data?.password ?? []
      errors.value = e.data?.detail ? [e.data.detail] : []
    } else {
      errors.value = ['Something went wrong. Please try again.']
    }
  } finally {
    submitting.value = false
  }
}

async function validate() {
  try {
    const validationErrors = await auth.validate(email.value, password.value)
    emailErrors.value = validationErrors.email ?? []
    passwordErrors.value = validationErrors.password ?? []
  } catch (e) {
    console.error(e)
    errors.value = ['Something went wrong. Please try again.']
  }
}

function clearEmailErrors() {
  emailErrors.value = []
}

let passwordDebounce: ReturnType<typeof setTimeout> | undefined

function onPasswordInput() {
  passwordErrors.value = []
  clearTimeout(passwordDebounce)
  passwordDebounce = setTimeout(validate, 1050)
}

onBeforeUnmount(() => clearTimeout(passwordDebounce))
</script>

<template>
  <AuthCard title="Create account" subtitle="Start your Location Diary">
    <form class="auth-form" @submit.prevent="onSubmit">
      <Message v-if="errors.length" severity="error" :closable="false">
        <ul>
          <li v-for="message in errors" :key="message">
            {{ message }}
          </li>
        </ul>
      </Message>

      <div class="field">
        <label for="email">Email</label>
        <InputText
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          fluid
          @focus="clearEmailErrors"
          @blur="validate"
        />
        <small v-for="message in emailErrors" :key="message" class="field-error">
          {{ message }}
        </small>
      </div>

      <div class="field">
        <label for="password">Password</label>
        <Password
          input-id="password"
          v-model="password"
          toggle-mask
          :feedback="false"
          autocomplete="new-password"
          required
          fluid
          @input="onPasswordInput"
        />
        <small v-for="message in passwordErrors" :key="message" class="field-error">
          {{ message }}
        </small>
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

.field-error {
  color: var(--p-red-500, #ef4444);
  font-size: 0.8rem;
}

.auth-switch {
  margin: 0;
  text-align: center;
  font-size: 0.9rem;
}
</style>
