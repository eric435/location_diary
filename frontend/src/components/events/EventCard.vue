<script setup lang="ts">
// One event in the dashboard grid. The body navigates to the detail view; the
// edit/delete actions are surfaced as icon buttons that don't trigger it.
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import type { DiaryEvent } from '@/lib/diary'
import { formatDate } from '@/lib/format'

const props = defineProps<{ event: DiaryEvent }>()
const emit = defineEmits<{ edit: [event: DiaryEvent]; delete: [event: DiaryEvent] }>()

const router = useRouter()

const createdLabel = computed(() => formatDate(props.event.created_at, 'short'))

function open() {
  router.push({ name: 'event-detail', params: { id: props.event.id } })
}
</script>

<template>
  <article class="event-card" tabindex="0" @click="open" @keydown.enter="open">
    <div class="event-card__main">
      <h3 class="event-card__title">{{ event.title }}</h3>
      <p v-if="event.description" class="event-card__desc">{{ event.description }}</p>
      <p v-else class="event-card__desc event-card__desc--muted">No description</p>
    </div>

    <footer class="event-card__footer">
      <span class="event-card__date">{{ createdLabel }}</span>
      <div class="event-card__actions" @click.stop>
        <Button
          icon="pi pi-pencil"
          severity="secondary"
          text
          rounded
          aria-label="Edit event"
          @click="emit('edit', event)"
        />
        <Button
          icon="pi pi-trash"
          severity="danger"
          text
          rounded
          aria-label="Delete event"
          @click="emit('delete', event)"
        />
      </div>
    </footer>
  </article>
</template>

<style scoped>
.event-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1rem;
  min-height: 9rem;
  padding: 1.25rem;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
  background: var(--p-content-background, #fff);
  cursor: pointer;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.event-card:hover,
.event-card:focus-visible {
  border-color: var(--p-primary-color, #6366f1);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
  outline: none;
}

.event-card__title {
  margin: 0 0 0.4rem;
  font-size: 1.1rem;
}

.event-card__desc {
  margin: 0;
  font-size: 0.9rem;
  color: var(--p-text-muted-color, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.event-card__desc--muted {
  font-style: italic;
  opacity: 0.7;
}

.event-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.event-card__date {
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
}

.event-card__actions {
  display: flex;
  gap: 0.25rem;
}
</style>
