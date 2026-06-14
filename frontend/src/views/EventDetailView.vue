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
import AddLocationDialog from '@/components/locations/AddLocationDialog.vue'
import EditLocationDialog from '@/components/locations/EditLocationDialog.vue'
import LocationMap, { type MapPoint } from '@/components/locations/LocationMap.vue'
import { useEventsStore } from '@/stores/events'
import { formatDate, formatDateTime } from '@/lib/format'
import { ApiError } from '@/lib/http'
import {
  getEvent,
  listEventLocations,
  unlinkLocation,
  type DiaryEvent,
  type EventLocation,
} from '@/lib/diary'

const route = useRoute()
const router = useRouter()
const events = useEventsStore()
const confirm = useConfirm()
const toast = useToast()

const eventId = computed(() => Number(route.params.id))

const event = ref<DiaryEvent | null>(null)
const links = ref<EventLocation[]>([])
const loading = ref(true)
const notFound = ref(false)

const editVisible = ref(false)
const addVisible = ref(false)

// The link currently open in the edit-times dialog.
const editLinkVisible = ref(false)
const editingLink = ref<EventLocation | null>(null)

const linkedLocationIds = computed(() => links.value.map((l) => l.location))

// The geocoded points for this event's locations, for the overview map. Each
// point keeps its link id so a marker and its list row stay in sync.
const mapPoints = computed<MapPoint[]>(() =>
  links.value
    .filter((l) => l.location_detail.lat !== null && l.location_detail.lng !== null)
    .map((l) => ({
      id: l.id,
      lat: l.location_detail.lat!,
      lng: l.location_detail.lng!,
      title: l.location_detail.title || 'Untitled location',
    })),
)

// Marker number (1-based) keyed by link id, matching the map's labels.
const markerNumberById = computed(() => {
  const numbers = new Map<number, number>()
  mapPoints.value.forEach((p, i) => numbers.set(p.id as number, i + 1))
  return numbers
})

// The link highlighted on the map; clicking a marker or a row toggles it.
const selectedId = ref<number | null>(null)

function toggleSelect(id: number) {
  if (!markerNumberById.value.has(id)) return
  selectedId.value = selectedId.value === id ? null : id
}

const createdLabel = computed(() => (event.value ? formatDate(event.value.created_at) : ''))

onMounted(load)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    // Prefer the cached event, but always confirm against the server so a
    // deep-link / refresh works without the dashboard having loaded.
    const [fetchedEvent, fetchedLinks] = await Promise.all([
      events.getById(eventId.value) ?? getEvent(eventId.value),
      listEventLocations(eventId.value),
    ])
    event.value = fetchedEvent
    links.value = fetchedLinks
    sortLinks()
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

// Keep the list in the server's order: arrival ascending with nulls last, then
// id. Re-applied whenever links change so adds land in the right spot.
function sortLinks() {
  links.value.sort((a, b) => {
    if (a.arrival !== b.arrival) {
      if (a.arrival === null) return 1
      if (b.arrival === null) return -1
      return new Date(a.arrival).getTime() - new Date(b.arrival).getTime()
    }
    return a.id - b.id
  })
}

function onLocationAdded(link: EventLocation) {
  links.value.push(link)
  sortLinks()
}

function openEdit(link: EventLocation) {
  editingLink.value = link
  editLinkVisible.value = true
}

// Replace the edited link in place; arrival may have changed, so re-sort.
function onLocationUpdated(updated: EventLocation) {
  const i = links.value.findIndex((l) => l.id === updated.id)
  if (i !== -1) links.value[i] = updated
  sortLinks()
}

function confirmRemoveLocation(link: EventLocation) {
  const name = link.location_detail.title || 'this location'
  confirm.require({
    header: 'Remove location',
    message: `Remove ${name} from this event? The location itself is kept for reuse.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Remove', severity: 'danger' },
    accept: async () => {
      try {
        await unlinkLocation(link.id)
        links.value = links.value.filter((l) => l.id !== link.id)
        toast.add({ severity: 'success', summary: 'Location removed', life: 2500 })
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : 'Could not remove the location.'
        toast.add({ severity: 'error', summary: 'Remove failed', detail, life: 4000 })
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

        <section class="detail-locations">
          <div class="detail-locations__head">
            <h2>Locations</h2>
            <Button
              label="Add location"
              icon="pi pi-plus"
              size="small"
              @click="addVisible = true"
            />
          </div>

          <LocationMap
            v-if="mapPoints.length"
            :points="mapPoints"
            :selected-id="selectedId"
            readonly
            class="detail-locations__map"
            @select="selectedId = $event as number"
          />

          <p v-if="links.length === 0" class="detail-locations__empty">
            No locations on this event yet. Add the places this event happened.
          </p>

          <ul v-else class="loc-list">
            <li
              v-for="link in links"
              :key="link.id"
              class="loc-item"
              :class="{
                'loc-item--clickable': markerNumberById.has(link.id),
                'loc-item--active': selectedId === link.id,
              }"
              @click="toggleSelect(link.id)"
            >
              <div class="loc-item__main">
                <span v-if="markerNumberById.has(link.id)" class="loc-item__num">
                  {{ markerNumberById.get(link.id) }}
                </span>
                <i v-else class="pi pi-map-marker loc-item__pin" />
                <div>
                  <p class="loc-item__name">
                    {{ link.location_detail.title || 'Untitled location' }}
                  </p>
                  <p class="loc-item__coords">
                    {{ link.location_detail.lat?.toFixed(5) }},
                    {{ link.location_detail.lng?.toFixed(5) }}
                  </p>
                </div>
              </div>
              <div class="loc-item__times">
                <span>Arrival: {{ formatDateTime(link.arrival) }}</span>
                <span>Departure: {{ formatDateTime(link.departure) }}</span>
              </div>
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                aria-label="Edit location times"
                @click.stop="openEdit(link)"
              />
              <Button
                icon="pi pi-times"
                severity="danger"
                text
                rounded
                aria-label="Remove location"
                @click.stop="confirmRemoveLocation(link)"
              />
            </li>
          </ul>
        </section>

        <EventFormDialog v-model:visible="editVisible" :event="event" @saved="onEventSaved" />
        <AddLocationDialog
          v-model:visible="addVisible"
          :event-id="event.id"
          :linked-location-ids="linkedLocationIds"
          @added="onLocationAdded"
        />
        <EditLocationDialog
          v-model:visible="editLinkVisible"
          :link="editingLink"
          @saved="onLocationUpdated"
        />
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

.detail-locations {
  margin-top: 2.5rem;
}

.detail-locations__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.detail-locations__head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.detail-locations__map {
  height: 18rem;
  margin-bottom: 1rem;
}

.detail-locations__empty {
  padding: 2rem 1.5rem;
  text-align: center;
  border: 1px dashed var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
  color: var(--p-text-muted-color, #6b7280);
}

.loc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.loc-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.loc-item--clickable {
  cursor: pointer;
}

.loc-item--clickable:hover {
  border-color: var(--p-primary-color, #6366f1);
}

.loc-item--active {
  border-color: var(--p-primary-color, #6366f1);
  background: var(--p-primary-50, #eef2ff);
}

.loc-item__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--p-primary-color, #6366f1);
  color: var(--p-primary-contrast-color, #fff);
  font-size: 0.8rem;
  font-weight: 600;
}

.loc-item__main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.loc-item__pin {
  color: var(--p-primary-color, #6366f1);
}

.loc-item__name {
  margin: 0;
  font-weight: 600;
}

.loc-item__coords {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
}

.loc-item__times {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
  text-align: right;
}

@media (max-width: 32rem) {
  .loc-item__times {
    display: none;
  }
}
</style>
