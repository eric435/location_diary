<script setup lang="ts">
// Batch media upload. Users drag files onto the drop zone (or pick them with
// the file chooser) and each file uploads through a small queue with retry and
// backoff — see useUploadQueue. Per-file details (note, capture time, location)
// are intentionally omitted here; they're too fiddly to set while batching and
// can be edited afterwards via MediaViewerDialog.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { createMedia, type Media } from '@/lib/diary'
import { useUploadQueue, type UploadItem } from '@/composables/useUploadQueue'

const props = defineProps<{
  visible: boolean
  eventId: number
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  added: [media: Media]
}>()

const toast = useToast()

const dragging = ref(false)
// dragenter/dragleave fire for child elements too, so count depth rather than
// flipping a boolean — otherwise the highlight flickers as the cursor moves.
let dragDepth = 0
const fileInput = ref<HTMLInputElement | null>(null)

const queue = useUploadQueue<Media>({
  upload: (file) => createMedia({ event: props.eventId, file }),
  onSuccess: (media) => emit('added', media),
})

const { items, counts, isUploading, hasItems } = queue

const hasFailures = computed(() => counts.value.error > 0)

watch(
  () => props.visible,
  (open) => {
    // Start fresh on open. Skip if something is still uploading (e.g. the user
    // reopened mid-batch) so we don't drop in-flight work from view.
    if (open && !isUploading.value) queue.reset()
  },
)

// Announce the result once a batch settles, so users who close the dialog still
// learn how it went.
watch(isUploading, (uploading, was) => {
  if (was && !uploading) {
    const { success, error } = counts.value
    if (error > 0) {
      toast.add({
        severity: 'warn',
        summary: 'Some uploads failed',
        detail: `${success} uploaded, ${error} failed. Retry the failed ones below.`,
        life: 5000,
      })
    } else if (success > 0) {
      toast.add({
        severity: 'success',
        summary: success === 1 ? 'Media uploaded' : `${success} media uploaded`,
        life: 2500,
      })
    }
  }
})

function addFiles(files: FileList | null | undefined) {
  if (!files || files.length === 0) return
  queue.enqueue(Array.from(files))
}

function onDrop(e: DragEvent) {
  dragDepth = 0
  dragging.value = false
  addFiles(e.dataTransfer?.files)
}

function onDragEnter() {
  dragDepth++
  dragging.value = true
}

function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragging.value = false
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  addFiles(input.files)
  // Reset so picking the same file again still fires change.
  input.value = ''
}

function statusIcon(item: UploadItem<Media>): string {
  switch (item.status) {
    case 'success':
      return 'pi pi-check-circle'
    case 'error':
      return 'pi pi-exclamation-circle'
    case 'uploading':
      return 'pi pi-spin pi-spinner'
    default:
      return 'pi pi-clock'
  }
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Add media"
    modal
    :style="{ width: '38rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="media-upload">
      <!-- Drop zone with a click-to-browse fallback. -->
      <div
        class="dropzone"
        :class="{ 'dropzone--active': dragging }"
        role="button"
        tabindex="0"
        @click="fileInput?.click()"
        @keydown.enter.prevent="fileInput?.click()"
        @keydown.space.prevent="fileInput?.click()"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <i class="pi pi-cloud-upload dropzone__icon" />
        <p class="dropzone__title">Drag &amp; drop files here</p>
        <p class="dropzone__hint">or</p>
        <Button label="Choose files" icon="pi pi-folder-open" size="small" outlined />
        <input ref="fileInput" class="dropzone__input" type="file" multiple @change="onPick" />
      </div>

      <ul v-if="hasItems" class="queue">
        <li
          v-for="item in items"
          :key="item.id"
          class="queue-item"
          :class="`queue-item--${item.status}`"
        >
          <i :class="['queue-item__icon', statusIcon(item)]" />
          <div class="queue-item__body">
            <span class="queue-item__name">{{ item.file.name }}</span>
            <span v-if="item.status === 'error'" class="queue-item__error">{{ item.error }}</span>
            <span
              v-else-if="item.status === 'uploading' && item.attempt > 1"
              class="queue-item__sub"
            >
              Retrying (attempt {{ item.attempt }})…
            </span>
          </div>
          <Button
            v-if="item.status === 'error'"
            label="Retry"
            icon="pi pi-refresh"
            size="small"
            text
            @click="queue.retry(item)"
          />
        </li>
      </ul>

      <p v-if="hasItems" class="queue-summary">
        <span>{{ counts.success }} uploaded</span>
        <span v-if="counts.queued + counts.uploading > 0"
          >· {{ counts.queued + counts.uploading }} in progress</span
        >
        <span v-if="counts.error > 0" class="queue-summary__error"
          >· {{ counts.error }} failed</span
        >
      </p>
    </div>

    <template #footer>
      <Button
        v-if="hasFailures && !isUploading"
        label="Retry failed"
        icon="pi pi-refresh"
        severity="secondary"
        text
        @click="queue.retryFailed()"
      />
      <Button label="Done" :disabled="isUploading" @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.media-upload {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 2rem 1rem;
  border: 2px dashed var(--p-content-border-color, #cbd5e1);
  border-radius: 0.75rem;
  background: var(--p-content-background, #f8fafc);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.dropzone--active {
  border-color: var(--p-primary-color, #3b82f6);
  background: color-mix(in srgb, var(--p-primary-color, #3b82f6) 8%, transparent);
}

.dropzone__icon {
  font-size: 2rem;
  color: var(--p-primary-color, #3b82f6);
}

.dropzone__title {
  margin: 0;
  font-weight: 600;
}

.dropzone__hint {
  margin: 0;
  color: var(--p-text-muted-color, #64748b);
  font-size: 0.85rem;
}

.dropzone__input {
  display: none;
}

.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 16rem;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 0.5rem;
  background: var(--p-content-background, #f8fafc);
}

.queue-item__icon {
  flex: none;
}

.queue-item--success .queue-item__icon {
  color: var(--p-green-500, #22c55e);
}

.queue-item--error .queue-item__icon {
  color: var(--p-red-500, #ef4444);
}

.queue-item--uploading .queue-item__icon {
  color: var(--p-primary-color, #3b82f6);
}

.queue-item__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
  flex: 1;
}

.queue-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item__error {
  font-size: 0.8rem;
  color: var(--p-red-500, #ef4444);
}

.queue-item__sub {
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #64748b);
}

.queue-summary {
  margin: 0;
  display: flex;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #64748b);
}

.queue-summary__error {
  color: var(--p-red-500, #ef4444);
}
</style>
