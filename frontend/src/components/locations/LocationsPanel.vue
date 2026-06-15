<script setup lang="ts">
// The locations attached to one event: an overview map, the list, and the
// add/edit/remove flow. Locations are managed here only in the event's context
// — added via AddLocationDialog, removed by deleting the event-location link.
//
// This panel owns the `links` state (loads, sorts, mutates) and emits the
// current list up via @links-changed so siblings (the media panel) can use it.
// Selection is shared with the parent via v-model:selectedLocationId; the
// camera marker for a selected media item is handed in via :media-point.
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AddLocationDialog from '@/components/locations/AddLocationDialog.vue'
import EditLocationDialog from '@/components/locations/EditLocationDialog.vue'
import LocationMap, { type Coords, type MapPoint } from '@/components/locations/LocationMap.vue'
import { formatDateTime } from '@/lib/format'
import { ApiError } from '@/lib/http'
import {
  listEventLocations,
  unlinkLocation,
  type EventLocation,
} from '@/lib/diary'

const props = defineProps<{
  eventId: number
  selectedLocationId: number | null
  /** Camera marker for the media item the sibling panel has pinned, if any. */
  mediaPoint: (Coords & { title?: string }) | null
}>()

const emit = defineEmits<{
  'update:selectedLocationId': [id: number | null]
  'links-changed': [links: EventLocation[]]
}>()

const confirm = useConfirm()
const toast = useToast()

const links = ref<EventLocation[]>([])

const addVisible = ref(false)
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

function toggleSelect(id: number) {
  if (!markerNumberById.value.has(id)) return
  emit('update:selectedLocationId', props.selectedLocationId === id ? null : id)
}

onMounted(load)

async function load() {
  try {
    links.value = await listEventLocations(props.eventId)
    sortLinks()
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load locations', life: 4000 })
  }
}

// Keep the list in the server's order: arrival ascending with nulls last, then
// id. Re-applied whenever links change so adds land in the right spot. Emits the
// fresh list up after every change so the media panel stays in sync.
function sortLinks() {
  links.value.sort((a, b) => {
    if (a.arrival !== b.arrival) {
      if (a.arrival === null) return 1
      if (b.arrival === null) return -1
      return new Date(a.arrival).getTime() - new Date(b.arrival).getTime()
    }
    return a.id - b.id
  })
  emit('links-changed', links.value)
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
        if (props.selectedLocationId === link.id) emit('update:selectedLocationId', null)
        emit('links-changed', links.value)
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
  <div class="loc-panel__head">
    <h2>Locations</h2>
    <Button label="Add location" icon="pi pi-plus" size="small" @click="addVisible = true" />
  </div>

  <LocationMap
    v-if="mapPoints.length || mediaPoint"
    :points="mapPoints"
    :selected-id="selectedLocationId"
    :media-point="mediaPoint"
    readonly
    class="loc-panel__map"
    @select="emit('update:selectedLocationId', $event as number)"
  />

  <p v-if="links.length === 0" class="loc-panel__empty">
    No locations on this event yet. Add the places this event happened.
  </p>

  <ul v-else class="loc-list">
    <li
      v-for="link in links"
      :key="link.id"
      class="loc-item"
      :class="{
        'loc-item--clickable': markerNumberById.has(link.id),
        'loc-item--active': selectedLocationId === link.id,
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

  <AddLocationDialog
    v-model:visible="addVisible"
    :event-id="eventId"
    :linked-location-ids="linkedLocationIds"
    @added="onLocationAdded"
  />
  <EditLocationDialog v-model:visible="editLinkVisible" :link="editingLink" @saved="onLocationUpdated" />
</template>

<style scoped>
.loc-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.loc-panel__head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.loc-panel__map {
  height: 18rem;
  margin-bottom: 1rem;
}

.loc-panel__empty {
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
