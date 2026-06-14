<script setup lang="ts">
// Reusable editor for a location's place data: search, map pin, lat/lng, and
// name. Bound via two models so callers can read/write each independently:
//   v-model:title  — the location's name
//   v-model:point  — its coordinates (Coords | null)
// Used both when creating a location (AddLocationDialog) and editing an existing
// one (EditLocationDialog).
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import LocationMap, { type Coords } from '@/components/locations/LocationMap.vue'
import PlacesAutocomplete, {
  type PlaceSelection,
} from '@/components/locations/PlacesAutocomplete.vue'

const title = defineModel<string>('title', { required: true })
const point = defineModel<Coords | null>('point', { required: true })

// Two-way bridge between the typed coordinate fields and `point`. Editing one
// field keeps the other (defaulting a missing half to 0); the map watches
// `point` and moves the pin to match.
const lat = computed<number | null>({
  get: () => point.value?.lat ?? null,
  set: (v) => {
    if (v != null) point.value = { lat: v, lng: point.value?.lng ?? 0 }
  },
})
const lng = computed<number | null>({
  get: () => point.value?.lng ?? null,
  set: (v) => {
    if (v != null) point.value = { lat: point.value?.lat ?? 0, lng: v }
  },
})

// Picking a place from search fills both the point and a default name (still
// editable). Clicking/dragging on the map only moves the point.
function onPlaceSelected(place: PlaceSelection) {
  point.value = { lat: place.lat, lng: place.lng }
  title.value = place.title
}
</script>

<template>
  <div class="loc-fields">
    <div class="field">
      <label>Search</label>
      <PlacesAutocomplete placeholder="e.g. Café Toulouse, Paris" @select="onPlaceSelected" />
    </div>

    <!-- Reuses `point` as the pin; click or drag to fine-tune the spot. -->
    <LocationMap v-model="point" class="loc-fields__map" />
    <p class="loc-fields__hint">
      Search above, click the map to drop a pin, or type coordinates below.
    </p>

    <div class="loc-fields__coords">
      <div class="field">
        <label for="loc-lat">Latitude</label>
        <InputNumber
          input-id="loc-lat"
          v-model="lat"
          :min-fraction-digits="0"
          :max-fraction-digits="7"
          :min="-90"
          :max="90"
          placeholder="e.g. 48.8584"
          fluid
        />
      </div>
      <div class="field">
        <label for="loc-lng">Longitude</label>
        <InputNumber
          input-id="loc-lng"
          v-model="lng"
          :min-fraction-digits="0"
          :max-fraction-digits="7"
          :min="-180"
          :max="180"
          placeholder="e.g. 2.2945"
          fluid
        />
      </div>
    </div>

    <div class="field">
      <label for="loc-title">Name (optional)</label>
      <InputText id="loc-title" v-model="title" placeholder="e.g. Eiffel Tower (optional)" fluid />
    </div>
  </div>
</template>

<style scoped>
.loc-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.loc-fields__map {
  height: 18rem;
}

.loc-fields__hint {
  margin: -0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
}

.loc-fields__coords {
  display: flex;
  gap: 1rem;
}
</style>
