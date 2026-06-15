<script setup lang="ts">
// View a single media item at full size and edit its mutable fields in place:
// note, capture timestamp, and the location it's tied to. The uploaded file is
// immutable — to replace it, delete and re-upload. Deleting is offered here too,
// since this is where a user lands after clicking a thumbnail.
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
  delete: [media: Media]
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

function onDelete() {
  if (props.media) emit('delete', props.media)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Media"
    modal
    :style="{ width: '46rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <div v-if="media" class="viewer">
      <!-- The preview just displays the image; it is NOT a link. The dialog
      opens centered over the thumbnail the user clicked, so a link here would
      sit under the pointer and a stray second click would open the raw URL in a
      new tab. Viewing the original is an explicit, labelled action below. -->
      <template v-if="media.media_type === 'img' && media.file_url">
        <div class="viewer__preview">
          <img :src="media.file_url" :alt="media.note || 'Media image'" />
        </div>
        <a
          :href="media.file_url"
          target="_blank"
          rel="noopener"
          class="viewer__original"
        >
          <i class="pi pi-external-link" />
          <span>Open original</span>
        </a>
      </template>
      <a
        v-else-if="media.file_url"
        :href="media.file_url"
        target="_blank"
        rel="noopener"
        class="viewer__file"
      >
        <i class="pi pi-file" />
        <span>Open file</span>
      </a>

      <form class="media-form" @submit.prevent="onSubmit">
        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

        <div class="field">
          <label for="view-media-note">Note</label>
          <Textarea id="view-media-note" v-model="note" rows="3" auto-resize fluid />
        </div>

        <div class="field">
          <label for="view-media-timestamp">Captured at</label>
          <DatePicker
            input-id="view-media-timestamp"
            v-model="timestamp"
            show-time
            hour-format="24"
            show-button-bar
            fluid
          />
        </div>

        <div v-if="locationOptions.length" class="field">
          <label for="view-media-location">Location</label>
          <Select
            input-id="view-media-location"
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
    </div>

    <template #footer>
      <Button
        label="Delete"
        icon="pi pi-trash"
        severity="danger"
        text
        class="viewer__delete"
        @click="onDelete"
      />
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button label="Save" :loading="submitting" @click="onSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.viewer__preview {
  display: block;
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--p-dialog-background, var(--p-content-background, #fff));
}

.viewer__preview img {
  display: block;
  width: 100%;
  max-height: 28rem;
  object-fit: contain;
  /* Match the modal so letterboxing on non-filling images blends in. */
  background: var(--p-dialog-background, var(--p-content-background, #fff));
}

.viewer__original {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 0.4rem;
  margin-top: -0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #6b7280);
  text-decoration: none;
}

.viewer__original:hover {
  color: var(--p-primary-color, #6366f1);
  text-decoration: underline;
}

.viewer__file {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem;
  border-radius: 0.5rem;
  background: var(--p-content-border-color, #f3f4f6);
  color: var(--p-text-color, #111827);
  text-decoration: none;
}

.viewer__file i {
  font-size: 1.5rem;
}

.media-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.viewer__delete {
  margin-right: auto;
}
</style>
