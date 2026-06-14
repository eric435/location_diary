<script setup lang="ts">
// A Google map with marker(s). Two modes, chosen by the `readonly` prop:
//   - interactive (default): one draggable pin bound to `v-model`. Click the
//     map or drag the pin to set the point. Used when creating a location.
//   - readonly: drops static markers for every `points` entry and fits them in
//     view. Used to *see* an event's locations.
//
// Uses Google's classic Marker — it needs no cloud Map ID (so just the API key
// is enough). It's deprecated in favour of AdvancedMarkerElement; switch when a
// Map ID is configured.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadMaps, loadMarker } from '@/lib/googleMaps'

export interface Coords {
  lat: number
  lng: number
}

export interface MapPoint extends Coords {
  title?: string
}

const props = withDefaults(
  defineProps<{
    /** The editable point (interactive mode). */
    modelValue?: Coords | null
    /** Static markers to display (readonly mode). */
    points?: MapPoint[]
    readonly?: boolean
    /** Zoom used when focusing a single point. */
    focusZoom?: number
  }>(),
  { modelValue: null, points: () => [], readonly: false, focusZoom: 10 },
)

const emit = defineEmits<{ 'update:modelValue': [value: Coords] }>()

const host = ref<HTMLDivElement | null>(null)
const error = ref('')

let map: google.maps.Map | null = null
let pin: google.maps.Marker | null = null
const staticPins: google.maps.Marker[] = []

// North america center
const DEFAULT_CENTER: Coords = { lat: 40, lng: -100 }
const DEFAULT_ZOOM = 2

onMounted(async () => {
  try {
    const { Map } = await loadMaps()
    await loadMarker()
    if (!host.value) return

    map = new Map(host.value, {
      center: props.modelValue ?? DEFAULT_CENTER,
      zoom: props.modelValue ? props.focusZoom : DEFAULT_ZOOM,
      disableDefaultUI: props.readonly,
      clickableIcons: !props.readonly,
      mapTypeControl: false,
      streetViewControl: false,
    })

    if (props.readonly) {
      renderStaticPins()
    } else {
      if (props.modelValue) placePin(props.modelValue)
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) setPoint({ lat: e.latLng.lat(), lng: e.latLng.lng() })
      })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load the map.'
  }
})

onBeforeUnmount(() => {
  pin?.setMap(null)
  staticPins.forEach((m) => m.setMap(null))
})

/** Drop / move the single editable pin and emit the new coordinates. */
function setPoint(coords: Coords) {
  placePin(coords)
  emit('update:modelValue', coords)
}

function placePin(coords: Coords) {
  if (!map) return
  if (!pin) {
    pin = new google.maps.Marker({ map, position: coords, draggable: true })
    pin.addListener('dragend', () => {
      const p = pin?.getPosition()
      if (p) emit('update:modelValue', { lat: p.lat(), lng: p.lng() })
    })
  } else {
    pin.setPosition(coords)
  }
}

function renderStaticPins() {
  if (!map) return
  staticPins.forEach((m) => m.setMap(null))
  staticPins.length = 0
  if (!props.points.length) return

  const bounds = new google.maps.LatLngBounds()
  for (const point of props.points) {
    staticPins.push(new google.maps.Marker({ map, position: point, title: point.title }))
    bounds.extend(point)
  }
  if (props.points.length === 1) {
    map.setCenter(props.points[0]!)
    map.setZoom(props.focusZoom)
  } else {
    map.fitBounds(bounds, 48)
  }
}

// External changes (e.g. autocomplete picks a place) move the pin and recenter.
watch(
  () => props.modelValue,
  (coords) => {
    if (props.readonly || !map || !coords) return
    placePin(coords)
    map.panTo(coords)
    if ((map.getZoom() ?? 0) < props.focusZoom) map.setZoom(props.focusZoom)
  },
)

watch(() => props.points, renderStaticPins, { deep: true })
</script>

<template>
  <div class="loc-map">
    <div v-if="error" class="loc-map__error">{{ error }}</div>
    <div ref="host" class="loc-map__canvas" />
  </div>
</template>

<style scoped>
.loc-map {
  position: relative;
  width: 100%;
}

.loc-map__canvas {
  width: 100%;
  height: 100%;
  min-height: 16rem;
  border-radius: 0.75rem;
  overflow: hidden;
}

.loc-map__error {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--p-text-muted-color, #6b7280);
  background: var(--p-content-background, #f9fafb);
  border: 1px dashed var(--p-content-border-color, #e5e7eb);
  border-radius: 0.75rem;
}
</style>
