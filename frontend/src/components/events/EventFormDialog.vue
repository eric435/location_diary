<script setup lang="ts">
// Create or edit an event. Pass an `event` to edit it; omit it to create.
import { ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { useEventsStore } from '@/stores/events'
import { ApiError } from '@/lib/http'
import type { DiaryEvent } from '@/lib/diary'

const props = defineProps<{
  visible: boolean
  event?: DiaryEvent | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [event: DiaryEvent]
}>()

const events = useEventsStore()
const toast = useToast()

const title = ref('')
const description = ref('')
const error = ref('')
const submitting = ref(false)

// Reset the form whenever the dialog opens, seeding from the event when editing.
watch(
  () => props.visible,
  (open) => {
    if (open) {
      title.value = props.event?.title ?? ''
      description.value = props.event?.description ?? ''
      error.value = ''
    }
  },
)

function close() {
  emit('update:visible', false)
}

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    const payload = { title: title.value.trim(), description: description.value.trim() }
    const saved = props.event
      ? await events.update(props.event.id, payload)
      : await events.create(payload)
    toast.add({
      severity: 'success',
      summary: props.event ? 'Event updated' : 'Event created',
      life: 2500,
    })
    emit('saved', saved)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="event ? 'Edit event' : 'New event'"
    modal
    :style="{ width: '30rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="event-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="field">
        <label for="event-title">Title</label>
        <InputText id="event-title" v-model="title" required autofocus fluid />
      </div>

      <div class="field">
        <label for="event-description">Description</label>
        <Textarea id="event-description" v-model="description" rows="4" autoResize fluid />
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button
        :label="event ? 'Save' : 'Create'"
        :loading="submitting"
        :disabled="!title.trim()"
        @click="onSubmit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.event-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
</style>
