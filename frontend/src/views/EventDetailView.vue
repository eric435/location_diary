<script setup lang="ts">
// A single event: its details (with edit/delete) and the locations attached to
// it. Locations are managed here only in the event's context — added via
// AddLocationDialog, removed by deleting the event-location link.
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import Button from 'primevue/button'
import Paginator, { type PageState } from 'primevue/paginator'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AppHeader from '@/components/AppHeader.vue'
import EventFormDialog from '@/components/events/EventFormDialog.vue'
import AddLocationDialog from '@/components/locations/AddLocationDialog.vue'
import EditLocationDialog from '@/components/locations/EditLocationDialog.vue'
import LocationMap, { type MapPoint } from '@/components/locations/LocationMap.vue'
import AddMediaDialog from '@/components/media/AddMediaDialog.vue'
import MediaViewerDialog from '@/components/media/MediaViewerDialog.vue'
import { useEventsStore } from '@/stores/events'
import { formatDate, formatDateTime } from '@/lib/format'
import { ApiError } from '@/lib/http'
import {
  getEvent,
  listEventLocations,
  listEventMediaPage,
  listMediaByLocation,
  listMediaNear,
  unlinkLocation,
  deleteMedia,
  type DiaryEvent,
  type EventLocation,
  type Media,
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

// Media is paginated rather than loaded all at once, so an event with lots of
// uploads doesn't take over the page. We hold one page at a time and let the
// server tell us the total via the paginated response's `count`.
const MEDIA_PAGE_SIZE = 12
const media = ref<Media[]>([])
const mediaTotal = ref(0)
const mediaFirst = ref(0) // zero-based offset of the current page, for Paginator
const mediaLoading = ref(false)

// When a location is selected the media panel switches from the full paginated
// list to a fixed set: the location's own media first, then the nearest media
// in the event to fill up to MEDIA_PAGE_SIZE. Null means "show the full list".
const locationMedia = ref<Media[] | null>(null)
// Radius (km) larger than any distance on Earth (~20,004 km half-circumference),
// so the "nearest" query ranks all geotagged event media by distance rather
// than capping it to a small area.
const NEAR_RADIUS_KM = 25000

// The media whose location is currently pinned on the map (the camera marker).
const selectedMedia = ref<Media | null>(null)

const editVisible = ref(false)
const addVisible = ref(false)

// Media dialogs: add, and the viewer (the thumbnail currently open).
const addMediaVisible = ref(false)
const viewMediaVisible = ref(false)
const viewingMedia = ref<Media | null>(null)

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

function clearSelection() {
  selectedId.value = null
}

// The link backing the current selection, if any.
const selectedLink = computed(() => links.value.find((l) => l.id === selectedId.value) ?? null)

// True while the media panel is showing a location's media rather than the
// full paginated list.
const inLocationMode = computed(() => locationMedia.value !== null)

// What the media grid renders: the location set when filtering, else the page.
const displayedMedia = computed(() => locationMedia.value ?? media.value)

// Whether the panel has nothing to show, accounting for both modes.
const mediaPanelEmpty = computed(() =>
  inLocationMode.value ? displayedMedia.value.length === 0 : mediaTotal.value === 0,
)

// Name shown in the "media near …" banner while filtering by a location.
const locationFilterName = computed(() =>
  inLocationMode.value && selectedLink.value
    ? selectedLink.value.location_detail.title || 'Untitled location'
    : '',
)

// The point handed to the map for the camera marker (only when the selected
// media actually carries an embedded location).
const mediaMapPoint = computed(() => {
  const m = selectedMedia.value
  if (!m || m.lat === null || m.lng === null) return null
  return { lat: m.lat, lng: m.lng, title: m.note || 'Selected media' }
})

// Load a location's media into the panel: its own (FK) media first, then the
// nearest event media to top up to MEDIA_PAGE_SIZE. Selecting a location drives
// this; deselecting (selectedId -> null) restores the paginated list.
async function loadLocationMedia(link: EventLocation) {
  mediaLoading.value = true
  try {
    const linkedPage = await listMediaByLocation(eventId.value, link.location, MEDIA_PAGE_SIZE)
    const linked = linkedPage.results
    let combined = linked
    const remaining = MEDIA_PAGE_SIZE - linked.length
    const { lat, lng } = link.location_detail
    if (remaining > 0 && lat !== null && lng !== null) {
      // Over-fetch then drop any already-linked rows the distance query returns,
      // so we still end up with `remaining` distinct nearby items.
      const nearPage = await listMediaNear(
        eventId.value,
        lng,
        lat,
        NEAR_RADIUS_KM,
        remaining + linked.length,
      )
      const linkedIds = new Set(linked.map((m) => m.id))
      const near = nearPage.results.filter((m) => !linkedIds.has(m.id)).slice(0, remaining)
      combined = [...linked, ...near]
    }
    locationMedia.value = combined
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load media for this location', life: 4000 })
    locationMedia.value = []
  } finally {
    mediaLoading.value = false
  }
}

// Selecting a location filters the media panel; clearing it restores the list.
watch(selectedId, (id) => {
  if (id === null) {
    locationMedia.value = null
    return
  }
  const link = links.value.find((l) => l.id === id)
  if (link) loadLocationMedia(link)
})

// Toggle the camera marker for a media item. Clicking the same one clears it.
function showOnMap(m: Media) {
  selectedMedia.value = selectedMedia.value?.id === m.id ? null : m
}

const createdLabel = computed(() => (event.value ? formatDate(event.value.created_at) : ''))

onMounted(load)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    // Prefer the cached event, but always confirm against the server so a
    // deep-link / refresh works without the dashboard having loaded.
    const [fetchedEvent, fetchedLinks, fetchedMedia] = await Promise.all([
      events.getById(eventId.value) ?? getEvent(eventId.value),
      listEventLocations(eventId.value),
      listEventMediaPage(eventId.value, 1, MEDIA_PAGE_SIZE),
    ])
    event.value = fetchedEvent
    links.value = fetchedLinks
    media.value = fetchedMedia.results
    mediaTotal.value = fetchedMedia.count
    mediaFirst.value = 0
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

// --- Media ----------------------------------------------------------------

// The location name a media row is tied to, or '' when it isn't.
function mediaLocationName(m: Media): string {
  if (m.location === null) return ''
  const link = links.value.find((l) => l.location === m.location)
  return link?.location_detail.title || 'Untitled location'
}

// Load a 1-based page of media into the panel. Failures leave the current page
// in place and surface a toast rather than blanking the section.
async function loadMedia(page: number) {
  mediaLoading.value = true
  try {
    const data = await listEventMediaPage(eventId.value, page, MEDIA_PAGE_SIZE)
    media.value = data.results
    mediaTotal.value = data.count
    mediaFirst.value = (page - 1) * MEDIA_PAGE_SIZE
  } catch {
    toast.add({ severity: 'error', summary: 'Could not load media', life: 4000 })
  } finally {
    mediaLoading.value = false
  }
}

function onMediaPage(e: PageState) {
  loadMedia(e.page + 1)
}

function onMediaAdded() {
  // New media is newest-first, so it lands on page 1 — jump there to show it.
  loadMedia(1)
}

function openMedia(m: Media) {
  viewingMedia.value = m
  viewMediaVisible.value = true
}

function onMediaUpdated(updated: Media) {
  const replace = (arr: Media[]) => {
    const i = arr.findIndex((m) => m.id === updated.id)
    if (i !== -1) arr[i] = updated
  }
  replace(media.value)
  if (locationMedia.value) replace(locationMedia.value)
  if (selectedMedia.value?.id === updated.id) selectedMedia.value = updated
}

function confirmDeleteMedia(m: Media) {
  confirm.require({
    header: 'Delete media',
    message: "Delete this media? This can't be undone.",
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await deleteMedia(m.id)
        viewMediaVisible.value = false
        if (selectedMedia.value?.id === m.id) selectedMedia.value = null
        if (inLocationMode.value && selectedLink.value) {
          // Filtered view: rebuild it so a freed slot can pull in another nearby.
          await loadLocationMedia(selectedLink.value)
        } else {
          // Reload the page we're on; if that was the last item on the last page,
          // step back so we don't land on an empty page.
          const currentPage = Math.floor(mediaFirst.value / MEDIA_PAGE_SIZE) + 1
          const lastPage = Math.max(1, Math.ceil((mediaTotal.value - 1) / MEDIA_PAGE_SIZE))
          await loadMedia(Math.min(currentPage, lastPage))
        }
        toast.add({ severity: 'success', summary: 'Media deleted', life: 2500 })
      } catch (e) {
        const detail = e instanceof ApiError ? e.message : 'Could not delete the media.'
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
            <div class="detail-media__head">
              <h2>Media</h2>
              <Button
                label="Add media"
                icon="pi pi-plus"
                size="small"
                @click="addMediaVisible = true"
              />
            </div>

            <p v-if="locationFilterName" class="detail-media__banner">
              <i class="pi pi-map-marker" />
              <span>
                Showing media at and near <strong>{{ locationFilterName }}</strong
                >. <a class="detail-media__clear" @click="clearSelection">Clear filter.</a>
              </span>
            </p>

            <p v-if="mediaPanelEmpty" class="detail-media__empty">
              {{
                inLocationMode
                  ? 'No media at or near this location.'
                  : 'No media on this event yet. Upload photos or notes.'
              }}
            </p>

            <template v-else>
              <ul class="media-grid" :class="{ 'media-grid--loading': mediaLoading }">
                <li v-for="m in displayedMedia" :key="m.id" class="media-cell">
                  <button
                    type="button"
                    class="media-tile"
                    :title="m.note || mediaLocationName(m) || 'Media'"
                    @click="openMedia(m)"
                  >
                    <img
                      v-if="m.media_type === 'img' && m.file_url"
                      :src="m.file_url"
                      :alt="m.note || 'Media image'"
                    />
                    <i v-else class="pi pi-file media-tile__file" />
                    <span v-if="m.note" class="media-tile__note">{{ m.note }}</span>
                  </button>
                  <button
                    v-if="m.lat !== null && m.lng !== null"
                    type="button"
                    class="media-map-btn"
                    :class="{ 'media-map-btn--active': selectedMedia?.id === m.id }"
                    :aria-label="selectedMedia?.id === m.id ? 'Hide on map' : 'Show on map'"
                    :title="selectedMedia?.id === m.id ? 'Hide on map' : 'Show on map'"
                    @click.stop="showOnMap(m)"
                  >
                    <i class="pi pi-map-marker" />
                  </button>
                </li>
              </ul>

              <Paginator
                v-if="!inLocationMode && mediaTotal > MEDIA_PAGE_SIZE"
                :first="mediaFirst"
                :rows="MEDIA_PAGE_SIZE"
                :total-records="mediaTotal"
                class="detail-media__paginator"
                @page="onMediaPage"
              />
            </template>
          </section>

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
              v-if="mapPoints.length || mediaMapPoint"
              :points="mapPoints"
              :selected-id="selectedId"
              :media-point="mediaMapPoint"
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
        </div>

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
        <AddMediaDialog
          v-model:visible="addMediaVisible"
          :event-id="event.id"
          @added="onMediaAdded"
        />
        <MediaViewerDialog
          v-model:visible="viewMediaVisible"
          :media="viewingMedia"
          :links="links"
          @saved="onMediaUpdated"
          @delete="confirmDeleteMedia"
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

/* Single column by default: media stacks above locations. On wide viewports
   (see breakpoint below) this becomes a two-column grid. */
.detail-columns {
  display: block;
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

.detail-media {
  margin-top: 2.5rem;
}

.detail-media__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.detail-media__head h2 {
  margin: 0;
  font-size: 1.25rem;
}

.detail-media__empty {
  padding: 2rem 1.5rem;
  text-align: center;
  border: 1px dashed var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
  color: var(--p-text-muted-color, #6b7280);
}

.detail-media__banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 1rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--p-primary-200, #c7d2fe);
  background: var(--p-primary-50, #eef2ff);
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: var(--p-text-color, #374151);
}

.detail-media__banner i {
  color: var(--p-primary-color, #6366f1);
}

.detail-media__clear {
  color: var(--p-primary-color, #6366f1);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.media-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 0.75rem;
}

/* Dim the grid while a new page is loading so the swap reads as intentional. */
.media-grid--loading {
  opacity: 0.5;
  pointer-events: none;
}

.detail-media__paginator {
  margin-top: 1rem;
}

.media-cell {
  position: relative;
}

/* Per-tile "show on map" control: only present for geotagged media. */
.media-map-btn {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.15s;
}

.media-cell:hover .media-map-btn,
.media-map-btn:focus-visible,
.media-map-btn--active {
  opacity: 1;
}

.media-map-btn:hover {
  background: rgba(0, 0, 0, 0.75);
}

.media-map-btn--active {
  background: #f59e0b;
}

.media-tile {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1;
  padding: 0;
  border: 1px solid var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--p-content-border-color, #f3f4f6);
  cursor: pointer;
  transition:
    border-color 0.15s,
    transform 0.15s;
}

.media-tile:hover {
  border-color: var(--p-primary-color, #6366f1);
  transform: translateY(-2px);
}

.media-tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-tile__file {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 2rem;
  color: var(--p-text-muted-color, #6b7280);
}

.media-tile__note {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 0.3rem 0.5rem;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  color: #fff;
  font-size: 0.75rem;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
