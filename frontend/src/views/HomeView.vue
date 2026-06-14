<script setup lang="ts">
// Dashboard: the user's events as a grid, or an inviting placeholder when they
// have none. Create/edit go through EventFormDialog; delete is confirmed.
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppHeader from '@/components/AppHeader.vue'
import EventCard from '@/components/events/EventCard.vue'
import EventFormDialog from '@/components/events/EventFormDialog.vue'
import { useEventsStore } from '@/stores/events'
import { ApiError } from '@/lib/http'
import type { DiaryEvent } from '@/lib/diary'

const events = useEventsStore()
const confirm = useConfirm()
const toast = useToast()

const dialogVisible = ref(false)
const editing = ref<DiaryEvent | null>(null)

onMounted(() => {
  events.fetchEvents()
})

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(event: DiaryEvent) {
  editing.value = event
  dialogVisible.value = true
}

function confirmDelete(event: DiaryEvent) {
  confirm.require({
    header: 'Delete event',
    message: `Delete "${event.title}"? This also removes its location links and can't be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await events.remove(event.id)
        toast.add({ severity: 'success', summary: 'Event deleted', life: 2500 })
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : 'Could not delete the event.'
        toast.add({ severity: 'error', summary: 'Delete failed', detail, life: 4000 })
      }
    },
  })
}
</script>

<template>
  <div class="home">
    <AppHeader />

    <main class="home-body">
      <div class="home-titlebar">
        <h1>Your events</h1>
        <Button v-if="!events.isEmpty" label="New event" icon="pi pi-plus" @click="openCreate" />
      </div>

      <div v-if="events.loading && !events.loaded" class="home-state">
        <ProgressSpinner />
      </div>

      <div v-else-if="events.isEmpty" class="home-empty">
        <i class="pi pi-map-marker home-empty__icon" />
        <h2>No events yet</h2>
        <p>Events are the moments you want to remember. Start your diary by creating one.</p>
        <Button label="Create your first event" icon="pi pi-plus" @click="openCreate" />
      </div>

      <div v-else class="home-grid">
        <EventCard
          v-for="event in events.events"
          :key="event.id"
          :event="event"
          @edit="openEdit"
          @delete="confirmDelete"
        />
      </div>
    </main>

    <EventFormDialog v-model:visible="dialogVisible" :event="editing" />
  </div>
</template>

<style scoped>
.home-body {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

.home-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}

.home-titlebar h1 {
  margin: 0;
  font-size: 1.5rem;
}

.home-state {
  display: flex;
  justify-content: center;
  padding: 4rem 0;
}

.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  text-align: center;
  padding: 4rem 1.5rem;
  border: 1px dashed var(--p-content-border-color, #e5e7eb);
  border-radius: 1rem;
  color: var(--p-text-muted-color, #6b7280);
}

.home-empty__icon {
  font-size: 2.5rem;
  color: var(--p-primary-color, #6366f1);
}

.home-empty h2 {
  margin: 0;
  color: var(--p-text-color, #111827);
}

.home-empty p {
  margin: 0 0 0.5rem;
  max-width: 28rem;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: 1rem;
}
</style>
