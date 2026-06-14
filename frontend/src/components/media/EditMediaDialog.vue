<script setup lang="ts">
// Edit the mutable fields of an existing media row: its note, capture
// timestamp, and the location it's tied to. The uploaded file is immutable —
// to replace it, delete and re-upload.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import DatePicker from 'primevue/datepicker'
import Select from 'primevue/select'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import { updateMedia, type EventLocation, type Media } from '@/lib/diary'
import { toIsoOrNull } from '@/lib/format'
import { ApiError } from '@/lib/http'

const props = defineProps<{
  visible: boolean
  media: Media | null
  links: EventLocation[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [media: Media]
}>()

const toast = useToast()

const note = ref('')
const timestamp = ref<Date | null>(null)
const locationId = ref<number | null>(null)

const error = ref('')
const submitting = ref(false)

const locationOptions = computed(() =>
  props.links.map((l) => ({
    value: l.location,
    label: l.location_detail.title || 'Untitled location',
  })),
)

// Hydrate the form from the media each time the dialog opens.
watch(
  () => props.visible,
  (open) => {
    if (!open || !props.media) return
    note.value = props.media.note
    timestamp.value = props.media.timestamp ? new Date(props.media.timestamp) : null
    locationId.value = props.media.location
    error.value = ''
  },
)

function close() {
  emit('update:visible', false)
}

async function onSubmit() {
  if (!props.media) return
  error.value = ''
  submitting.value = true
  try {
    const media = await updateMedia(props.media.id, {
      note: note.value.trim(),
      timestamp: toIsoOrNull(timestamp.value),
      location: locationId.value,
    })
    toast.add({ severity: 'success', summary: 'Media updated', life: 2500 })
    emit('saved', media)
    close()
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Could not update the media. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Edit media"
    modal
    :style="{ width: '34rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="media-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <div class="field">
        <label for="edit-media-note">Note</label>
        <Textarea id="edit-media-note" v-model="note" rows="3" auto-resize fluid />
      </div>

      <div class="field">
        <label for="edit-media-timestamp">Captured at</label>
        <DatePicker
          input-id="edit-media-timestamp"
          v-model="timestamp"
          show-time
          hour-format="24"
          show-button-bar
          fluid
        />
      </div>

      <div v-if="locationOptions.length" class="field">
        <label for="edit-media-location">Location</label>
        <Select
          input-id="edit-media-location"
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
      <Button label="Save" :loading="submitting" @click="onSubmit" />
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
