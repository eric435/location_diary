<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Paginator, { type PageState } from 'primevue/paginator'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import AddMediaDialog from '@/components/media/AddMediaDialog.vue'
import MediaViewerDialog from '@/components/media/MediaViewerDialog.vue'
import { ApiError } from '@/lib/http'
import {
  listEventMediaPage,
  listMediaByLocation,
  listMediaNear,
  deleteMedia,
  type EventLocation,
  type Media,
} from '@/lib/diary'

const props = defineProps<{
  eventId: number
  links: EventLocation[]
  selectedLocationId: number | null
}>()

const emit = defineEmits<{
  'update:selectedLocationId': [id: null]
  mediaSelected: [media: Media | null]
}>()

const confirm = useConfirm()
const toast = useToast()

const MEDIA_PAGE_SIZE = 12
const media = ref<Media[]>([])
const mediaTotal = ref(0)
const mediaFirst = ref(0)
const mediaLoading = ref(false)

const locationMedia = ref<Media[] | null>(null)
const NEAR_RADIUS_KM = 25000

const selectedMedia = ref<Media | null>(null)

const addMediaVisible = ref(false)
const viewMediaVisible = ref(false)
const viewingMedia = ref<Media | null>(null)

const selectedLink = computed(() =>
  props.links.find((l) => l.id === props.selectedLocationId) ?? null,
)

const inLocationMode = computed(() => locationMedia.value !== null)
const displayedMedia = computed(() => locationMedia.value ?? media.value)

const mediaPanelEmpty = computed(() =>
  inLocationMode.value ? displayedMedia.value.length === 0 : mediaTotal.value === 0,
)

const locationFilterName = computed(() =>
  inLocationMode.value && selectedLink.value
    ? selectedLink.value.location_detail.title || 'Untitled location'
    : '',
)

async function loadLocationMedia(link: EventLocation) {
  mediaLoading.value = true
  try {
    const linkedPage = await listMediaByLocation(props.eventId, link.location, MEDIA_PAGE_SIZE)
    const linked = linkedPage.results
    let combined = linked
    const remaining = MEDIA_PAGE_SIZE - linked.length
    const { lat, lng } = link.location_detail
    if (remaining > 0 && lat !== null && lng !== null) {
      const nearPage = await listMediaNear(
        props.eventId,
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

watch(
  () => props.selectedLocationId,
  (id) => {
    if (id === null) {
      locationMedia.value = null
      return
    }
    const link = props.links.find((l) => l.id === id)
    if (link) loadLocationMedia(link)
  },
)

function showOnMap(m: Media) {
  const next = selectedMedia.value?.id === m.id ? null : m
  selectedMedia.value = next
  emit('mediaSelected', next)
}

function mediaLocationName(m: Media): string {
  if (m.location === null) return ''
  const link = props.links.find((l) => l.location === m.location)
  return link?.location_detail.title || 'Untitled location'
}

async function loadMedia(page: number) {
  mediaLoading.value = true
  try {
    const data = await listEventMediaPage(props.eventId, page, MEDIA_PAGE_SIZE)
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
  if (selectedMedia.value?.id === updated.id) {
    selectedMedia.value = updated
    emit('mediaSelected', updated)
  }
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
        if (selectedMedia.value?.id === m.id) {
          selectedMedia.value = null
          emit('mediaSelected', null)
        }
        if (inLocationMode.value && selectedLink.value) {
          await loadLocationMedia(selectedLink.value)
        } else {
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

onMounted(() => loadMedia(1))
</script>

<template>
  <div class="detail-media__head">
    <h2>Media</h2>
    <Button label="Add media" icon="pi pi-plus" size="small" @click="addMediaVisible = true" />
  </div>
  <p v-if="locationFilterName" class="detail-media__banner">
    <i class="pi pi-map-marker" />
    <span>
      Showing media at and near <strong>{{ locationFilterName }}</strong
      >. <a class="detail-media__clear" @click="emit('update:selectedLocationId', null)">Clear filter.</a>
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
  <AddMediaDialog v-model:visible="addMediaVisible" :event-id="eventId" @added="onMediaAdded" />
  <MediaViewerDialog
    v-model:visible="viewMediaVisible"
    :media="viewingMedia"
    :links="links"
    @saved="onMediaUpdated"
    @delete="confirmDeleteMedia"
  />
</template>

<style scoped>
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
</style>
