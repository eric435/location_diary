<script setup lang="ts">
// Upload a piece of media to an event. The file is required; note, capture
// timestamp, and an optional link to one of the event's locations are extras.
// The server derives the media/mime type from the upload itself.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { createMedia, type EventLocation, type Media } from '@/lib/diary'
import { toIsoOrNull } from '@/lib/format'
import { ApiError } from '@/lib/http'

const props = defineProps<{
  visible: boolean
  eventId: number
  /** The event's location links, offered as optional attachment targets. */
  links: EventLocation[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  added: [media: Media]
}>()

const toast = useToast()

const file = ref<File | null>(null)
const note = ref('')
const timestamp = ref<Date | null>(null)
const locationId = ref<number | null>(null)

const error = ref('')
const submitting = ref(false)

// Each option is a location id with a readable label.
const locationOptions = computed(() =>
  props.links.map((l) => ({
    value: l.location,
    label: l.location_detail.title || 'Untitled location',
  })),
)

const canSubmit = computed(() => file.value !== null)

function reset() {
  file.value = null
  note.value = ''
  timestamp.value = null
  locationId.value = null
  error.value = ''
}

watch(
  () => props.visible,
  (open) => {
    if (open) reset()
  },
)

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

function close() {
  emit('update:visible', false)
}

async function onSubmit() {
  if (!canSubmit.value) return
  error.value = ''
  submitting.value = true
  try {
    const media = await createMedia({
      event: props.eventId,
      file: file.value!,
      note: note.value.trim(),
      timestamp: toIsoOrNull(timestamp.value),
      location: locationId.value,
    })
    toast.add({ severity: 'success', summary: 'Media uploaded', life: 2500 })
    emit('added', media)
    close()
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Could not upload the media. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Add media"
    modal
    :style="{ width: '34rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="media-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="field">
        <label for="media-file">File</label>
        <input id="media-file" type="file" @change="onFileChange" />
      </div>

      <div class="field">
        <label for="media-note">Note (optional)</label>
        <Textarea id="media-note" v-model="note" rows="3" auto-resize fluid />
      </div>

      <div class="field">
        <label for="media-timestamp">Captured at (optional)</label>
        <DatePicker
          input-id="media-timestamp"
          v-model="timestamp"
          show-time
          hour-format="24"
          show-button-bar
          fluid
        />
      </div>

      <div v-if="locationOptions.length" class="field">
        <label for="media-location">Location (optional)</label>
        <Select
          input-id="media-location"
          v-model="locationId"
          :options="locationOptions"
          option-label="label"
          option-value="value"
          placeholder="Not tied to a location"
          show-clear
          fluid
        />
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button label="Upload" :loading="submitting" :disabled="!canSubmit" @click="onSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.media-form {
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
