<script setup lang="ts">
// Attach a location to an event. Two paths, both ending in an event-location
// link (the M2M through row):
//   - "New": pick a point — search with Places autocomplete, click/drag on the
//     map, or both — then create a Location and link it.
//   - "Existing": reuse a Location the user already owns (the point of the M2M).
// Optionally records arrival/departure times on the link.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import LocationMap, { type Coords } from '@/components/locations/LocationMap.vue'
import PlacesAutocomplete, {
  type PlaceSelection,
} from '@/components/locations/PlacesAutocomplete.vue'
import {
  createLocation,
  linkLocation,
  listLocations,
  toWkt,
  type DiaryLocation,
  type EventLocation,
} from '@/lib/diary'
import { ApiError } from '@/lib/http'

const props = defineProps<{
  visible: boolean
  eventId: number
  /** Location ids already linked to this event, hidden from the reuse picker. */
  linkedLocationIds: number[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  added: [link: EventLocation]
}>()

const toast = useToast()

type Mode = 'new' | 'existing'
const mode = ref<Mode>('new')
const modeOptions = [
  { label: 'New location', value: 'new' as Mode },
  { label: 'Existing location', value: 'existing' as Mode },
]

// New-location fields. `point` is set by the autocomplete or by the map.
const title = ref('')
const point = ref<Coords | null>(null)

// Existing-location field.
const selectedLocation = ref<DiaryLocation | null>(null)
const allLocations = ref<DiaryLocation[]>([])

// Shared optional timing on the link.
const arrival = ref<Date | null>(null)
const departure = ref<Date | null>(null)

const error = ref('')
const submitting = ref(false)

const availableLocations = computed(() =>
  allLocations.value.filter((loc) => !props.linkedLocationIds.includes(loc.id)),
)

const canSubmit = computed(() => {
  if (mode.value === 'new') return title.value.trim() !== '' && point.value !== null
  return selectedLocation.value !== null
})

function reset() {
  mode.value = 'new'
  title.value = ''
  point.value = null
  selectedLocation.value = null
  arrival.value = null
  departure.value = null
  error.value = ''
}

// On open, reset and load the user's locations for the reuse picker.
watch(
  () => props.visible,
  async (open) => {
    if (!open) return
    reset()
    try {
      allLocations.value = await listLocations()
    } catch {
      allLocations.value = []
    }
  },
)

// Picking a place from search fills both the point and a default name (still
// editable). Clicking/dragging on the map only moves the point.
function onPlaceSelected(place: PlaceSelection) {
  point.value = { lat: place.lat, lng: place.lng }
  title.value = place.title
}

function close() {
  emit('update:visible', false)
}

function locationLabel(loc: DiaryLocation): string {
  const name = loc.title || 'Untitled'
  if (loc.lat !== null && loc.lng !== null) {
    return `${name} (${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)})`
  }
  return name
}

async function onSubmit() {
  if (!canSubmit.value) return
  error.value = ''
  submitting.value = true
  try {
    let locationId: number
    if (mode.value === 'new') {
      const location = await createLocation({
        title: title.value.trim(),
        point: toWkt(point.value!.lng, point.value!.lat),
      })
      locationId = location.id
    } else {
      locationId = selectedLocation.value!.id
    }

    const link = await linkLocation({
      event: props.eventId,
      location: locationId,
      arrival: arrival.value ? arrival.value.toISOString() : null,
      departure: departure.value ? departure.value.toISOString() : null,
    })
    toast.add({ severity: 'success', summary: 'Location added', life: 2500 })
    emit('added', link)
    close()
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Could not add the location. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    header="Add location"
    modal
    :style="{ width: '34rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="loc-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <SelectButton
        v-model="mode"
        :options="modeOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
      />

      <template v-if="mode === 'new'">
        <div class="field">
          <label>Search</label>
          <PlacesAutocomplete
            placeholder="e.g. Café Toulouse, Paris"
            @select="onPlaceSelected"
          />
        </div>

        <!-- Reuses `point` as the pin; click or drag to fine-tune the spot. -->
        <LocationMap v-model="point" class="loc-form__map" />
        <p class="loc-form__hint">
          <template v-if="point">
            {{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}
          </template>
          <template v-else>Search above, or click the map to drop a pin.</template>
        </p>

        <div class="field">
          <label for="loc-title">Name</label>
          <InputText
            id="loc-title"
            v-model="title"
            placeholder="e.g. Eiffel Tower"
            required
            fluid
          />
        </div>
      </template>

      <template v-else>
        <div class="field">
          <label for="loc-existing">Location</label>
          <Select
            input-id="loc-existing"
            v-model="selectedLocation"
            :options="availableLocations"
            :option-label="locationLabel"
            placeholder="Choose a saved location"
            :empty-message="
              allLocations.length
                ? 'All your locations are already on this event'
                : 'You have no saved locations yet'
            "
            filter
            fluid
          />
        </div>
      </template>

      <div class="loc-coords">
        <div class="field">
          <label for="loc-arrival">Arrival (optional)</label>
          <DatePicker
            input-id="loc-arrival"
            v-model="arrival"
            show-time
            hour-format="24"
            show-button-bar
            fluid
          />
        </div>
        <div class="field">
          <label for="loc-departure">Departure (optional)</label>
          <DatePicker
            input-id="loc-departure"
            v-model="departure"
            show-time
            hour-format="24"
            show-button-bar
            fluid
          />
        </div>
      </div>
    </form>

    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="close" />
      <Button label="Add" :loading="submitting" :disabled="!canSubmit" @click="onSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.loc-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}

.loc-form__map {
  height: 18rem;
}

.loc-form__hint {
  margin: -0.5rem 0 0;
  font-size: 0.8rem;
  color: var(--p-text-muted-color, #6b7280);
}

.loc-coords {
  display: flex;
  gap: 1rem;
}
</style>
