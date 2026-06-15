<script setup lang="ts">
// A single event: its details (with edit/delete) and the locations attached to
// it. Locations are managed here only in the event's context — added via
// AddLocationDialog, removed by deleting the event-location link.
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppHeader from '@/components/AppHeader.vue'
import EventFormDialog from '@/components/events/EventFormDialog.vue'
import LocationsPanel from '@/components/locations/LocationsPanel.vue'
import MediaPanel from '@/components/media/MediaPanel.vue'
import { useEventsStore } from '@/stores/events'
import { formatDate } from '@/lib/format'
import { ApiError } from '@/lib/http'
import { getEvent, type DiaryEvent, type EventLocation, type Media } from '@/lib/diary'

const route = useRoute()
const router = useRouter()
const events = useEventsStore()
const confirm = useConfirm()
const toast = useToast()

const eventId = computed(() => Number(route.params.id))

const event = ref<DiaryEvent | null>(null)
const loading = ref(true)
const notFound = ref(false)

// --- Shared state between the media and locations panels -------------------
const selectedLocationId = ref<number | null>(null)
const locationLinks = ref<EventLocation[]>([])
const selectedMedia = ref<Media | null>(null)

const editVisible = ref(false)

// The point handed to the locations map for the camera marker (only when the
// selected media actually carries an embedded location).
const mediaMapPoint = computed(() => {
  const m = selectedMedia.value
  if (!m || m.lat === null || m.lng === null) return null
  return { lat: m.lat, lng: m.lng, title: m.note || 'Selected media' }
})

function onMediaSelected(m: Media | null) {
  selectedMedia.value = m
}

const createdLabel = computed(() => (event.value ? formatDate(event.value.created_at) : ''))

onMounted(load)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    // Prefer the cached event, but always confirm against the server so a
    // deep-link / refresh works without the dashboard having loaded.
    event.value = events.getById(eventId.value) ?? (await getEvent(eventId.value))
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound.value = true
    else toast.add({ severity: 'error', summary: 'Could not load event', life: 4000 })
  } finally {
    loading.value = false
  }
}

function onEventSaved(updated: DiaryEvent) {
  event.value = updated
}

function confirmDeleteEvent() {
  if (!event.value) return
  const target = event.value
  confirm.require({
    header: 'Delete event',
    message: `Delete "${target.title}"? This also removes its location links and can't be undone.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await events.remove(target.id)
        toast.add({ severity: 'success', summary: 'Event deleted', life: 2500 })
        router.push({ name: 'home' })
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : 'Could not delete the event.'
        toast.add({ severity: 'error', summary: 'Delete failed', detail, life: 4000 })
      }
    },
  })
}
</script>

<template>
  <div class="detail">
    <AppHeader />

    <main class="detail-body">
      <RouterLink :to="{ name: 'home' }" class="detail-back">
        <i class="pi pi-arrow-left" /> Back to events
      </RouterLink>

      <div v-if="loading" class="detail-state">
        <ProgressSpinner />
      </div>

      <div v-else-if="notFound" class="detail-state detail-state--text">
        <h2>Event not found</h2>
        <p>It may have been deleted.</p>
        <RouterLink :to="{ name: 'home' }">Back to events</RouterLink>
      </div>

      <template v-else-if="event">
        <section class="detail-head">
          <div>
            <h1 class="detail-title">{{ event.title }}</h1>
            <p class="detail-meta">Created {{ createdLabel }}</p>
          </div>
          <div class="detail-actions">
            <Button
              label="Edit"
              icon="pi pi-pencil"
              severity="secondary"
              @click="editVisible = true"
            />
            <Button
              label="Delete"
              icon="pi pi-trash"
              severity="danger"
              outlined
              @click="confirmDeleteEvent"
            />
          </div>
        </section>

        <p v-if="event.description" class="detail-desc">{{ event.description }}</p>

        <div class="detail-columns">
          <section class="detail-media">
            <MediaPanel
              :event-id="eventId"
              :links="locationLinks"
              v-model:selected-location-id="selectedLocationId"
              @media-selected="onMediaSelected"
            />
          </section>

          <section class="detail-locations">
            <LocationsPanel
              :event-id="eventId"
              :media-point="mediaMapPoint"
              v-model:selected-location-id="selectedLocationId"
              @links-changed="locationLinks = $event"
            />
          </section>
        </div>

        <EventFormDialog v-model:visible="editVisible" :event="event" @saved="onEventSaved" />
      </template>
    </main>
  </div>
</template>

<style scoped>
.detail-body {
  max-width: 52rem;
  margin: 0 auto;
  padding: 1.5rem 1.5rem 3rem;
}

.detail-back {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--p-text-muted-color, #6b7280);
  text-decoration: none;
  margin-bottom: 1.5rem;
}

.detail-back:hover {
  color: var(--p-primary-color, #6366f1);
}

.detail-state {
  display: flex;
  justify-content: center;
  padding: 4rem 0;
}

.detail-state--text {
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.detail-title {
  margin: 0;
  font-size: 1.75rem;
}

.detail-meta {
  margin: 0.35rem 0 0;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #6b7280);
}

.detail-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.detail-desc {
  margin: 1.25rem 0 0;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Single column by default: media stacks above locations. On wide viewports
   (see breakpoint below) this becomes a two-column grid. */
.detail-columns {
  display: block;
}

/* Layout wrappers only — each panel owns the styling of its own contents. */
.detail-locations,
.detail-media {
  margin-top: 2.5rem;
}

/* Wide screens: give the page room and lay media (left) beside locations
   (right) instead of stacking them. align-items: start keeps each column at
   the top so they don't stretch to match the taller one. */
@media (min-width: 75rem) {
  .detail-body {
    max-width: 80rem;
  }

  .detail-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2.5rem;
    align-items: start;
  }
}
</style>
