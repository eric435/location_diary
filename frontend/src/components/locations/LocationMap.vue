<script setup lang="ts">
// A Google map with marker(s). Two modes, chosen by the `readonly` prop:
//   - interactive (default): one draggable pin bound to `v-model`. Click the
//     map or drag the pin to set the point. Used when creating a location.
//   - readonly: drops static markers for every `points` entry and fits them in
//     view. Used to *see* an event's locations.
//
// Uses AdvancedMarkerElement, which needs a cloud Map ID
// (VITE_GOOGLE_MAPS_MAP_ID). Readonly markers carry custom DOM so we can render
// the numbered pin and its selected/bounce state as styled HTML.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadMaps, loadMarker, MAP_ID } from '@/lib/googleMaps'

export interface Coords {
  lat: number
  lng: number
}

export interface MapPoint extends Coords {
  title?: string
  /** Stable id used to link a marker back to a list row (readonly mode). */
  id?: number | string
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
    /** Id of the highlighted marker (readonly mode); bounces and pans to it. */
    selectedId?: number | string | null
  }>(),
  { modelValue: null, points: () => [], readonly: false, focusZoom: 10, selectedId: null },
)

const emit = defineEmits<{
  'update:modelValue': [value: Coords]
  /** A static marker was clicked; carries its point's id. */
  select: [id: number | string]
}>()

const host = ref<HTMLDivElement | null>(null)
const error = ref('')

let map: google.maps.Map | null = null
let pin: google.maps.marker.AdvancedMarkerElement | null = null
const staticPins: {
  marker: google.maps.marker.AdvancedMarkerElement
  el: HTMLElement
  id?: number | string
}[] = []

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
      // AdvancedMarkerElement requires a Map ID; without it markers won't render.
      mapId: MAP_ID,
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
  if (pin) pin.map = null
  staticPins.forEach((s) => (s.marker.map = null))
})

/** Drop / move the single editable pin and emit the new coordinates. */
function setPoint(coords: Coords) {
  placePin(coords)
  emit('update:modelValue', coords)
}

function placePin(coords: Coords) {
  if (!map) return
  if (!pin) {
    pin = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: coords,
      gmpDraggable: true,
    })
    pin.addListener('dragend', () => {
      // After a drag `position` is a LatLng; normalise both it and literals.
      const p = pin?.position
      if (p) {
        const ll = new google.maps.LatLng(p)
        emit('update:modelValue', { lat: ll.lat(), lng: ll.lng() })
      }
    })
  } else {
    pin.position = coords
  }
}

/** Build the numbered pin element for a readonly marker. */
function makePinEl(label: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'loc-map-pin'
  el.textContent = label
  return el
}

function renderStaticPins() {
  if (!map) return
  staticPins.forEach((s) => (s.marker.map = null))
  staticPins.length = 0
  if (!props.points.length) return

  const bounds = new google.maps.LatLngBounds()
  props.points.forEach((point, i) => {
    // Number each pin so it maps 1:1 onto the list row beside it.
    const el = makePinEl(String(i + 1))
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: map!,
      position: point,
      title: point.title,
      content: el,
      gmpClickable: point.id !== undefined,
    })
    if (point.id !== undefined) {
      const id = point.id
      marker.addListener('click', () => emit('select', id))
    }
    staticPins.push({ marker, el, id: point.id })
    bounds.extend(point)
  })
  if (props.points.length === 1) {
    map.setCenter(props.points[0]!)
    map.setZoom(props.focusZoom)
  } else {
    map.fitBounds(bounds, 48)
  }
  applySelection()
}

// Highlight the selected marker (bounce + raise + recolour, via CSS) and pan to
// it so the chosen row stands out.
function applySelection() {
  if (!map) return
  for (const s of staticPins) {
    const selected = props.selectedId != null && s.id === props.selectedId
    s.el.classList.toggle('loc-map-pin--active', selected)
    s.marker.zIndex = selected ? 1000 : undefined
    if (selected && s.marker.position) map.panTo(s.marker.position)
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

watch(() => props.selectedId, applySelection)
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

<!-- Marker DOM is created imperatively (document.createElement), so it can't
     carry scoped data-v attributes — these rules must be global. -->
<style>
.loc-map-pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: var(--p-primary-color, #6366f1);
  color: var(--p-primary-contrast-color, #fff);
  border: 2px solid #fff;
  font: 600 0.8rem/1 system-ui, sans-serif;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.15s;
}

.loc-map-pin--active {
  background: #ef4444;
  animation: loc-map-pin-bounce 0.6s ease-in-out infinite alternate;
}

@keyframes loc-map-pin-bounce {
  from {
    transform: translateY(0) scale(1.15);
  }
  to {
    transform: translateY(-7px) scale(1.15);
  }
}
</style>
