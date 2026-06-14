<script setup lang="ts">
// Places search box. Wraps Google's `PlaceAutocompleteElement` web component
// (the modern replacement for the deprecated `Autocomplete` widget). It manages
// its own session tokens; we just append it and listen for `gmp-select`, then
// resolve the chosen prediction into a name + coordinates.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { loadPlaces } from '@/lib/googleMaps'

export interface PlaceSelection {
  title: string
  lat: number
  lng: number
  address: string
}

const props = withDefaults(defineProps<{ placeholder?: string }>(), {
  placeholder: 'Search for a place…',
})

const emit = defineEmits<{ select: [place: PlaceSelection] }>()

const host = ref<HTMLDivElement | null>(null)
const error = ref('')
let element: google.maps.places.PlaceAutocompleteElement | null = null

onMounted(async () => {
  try {
    const { PlaceAutocompleteElement } = await loadPlaces()
    if (!host.value) return

    element = new PlaceAutocompleteElement({})
    element.placeholder = props.placeholder
    element.addEventListener('gmp-select', onSelect)
    host.value.append(element)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load place search.'
  }
})

onBeforeUnmount(() => {
  element?.removeEventListener('gmp-select', onSelect)
})

async function onSelect(event: Event) {
  const { placePrediction } = event as google.maps.places.PlacePredictionSelectEvent
  const place = placePrediction.toPlace()
  await place.fetchFields({ fields: ['displayName', 'location', 'formattedAddress'] })
  if (!place.location) return
  emit('select', {
    title: place.displayName ?? '',
    lat: place.location.lat(),
    lng: place.location.lng(),
    address: place.formattedAddress ?? '',
  })
}
</script>

<template>
  <div class="places">
    <div ref="host" class="places__host" />
    <small v-if="error" class="places__error">{{ error }}</small>
  </div>
</template>

<style scoped>
.places__host {
  width: 100%;
}

/* The web component renders its own input; let it fill the field. */
.places__host :deep(gmp-place-autocomplete) {
  width: 100%;
}

.places__error {
  color: var(--p-message-error-color, #b91c1c);
}
</style>
