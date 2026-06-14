<script setup lang="ts">
// Edit an event-location: the underlying Location's name and position (shared
// across events), plus this link's arrival / departure times. Saving PATCHes
// the location first, then the link — the link response carries the refreshed
// location_detail so the caller gets a fully up-to-date row.
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import DatePicker from 'primevue/datepicker'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import LocationFields from '@/components/locations/LocationFields.vue'
import { type Coords } from '@/components/locations/LocationMap.vue'
import {
  toWkt,
  updateEventLocation,
  updateLocation,
  type EventLocation,
} from '@/lib/diary'
import { ApiError } from '@/lib/http'

const props = defineProps<{
  visible: boolean
  /** The link being edited; null when the dialog is closed. */
  link: EventLocation | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: [link: EventLocation]
}>()

const toast = useToast()

const title = ref('')
const point = ref<Coords | null>(null)
const arrival = ref<Date | null>(null)
const departure = ref<Date | null>(null)
const error = ref('')
const submitting = ref(false)

const canSubmit = computed(() => point.value !== null)

// Locations are shared; editing name/position affects every linked event.
const sharedEventCount = computed(() => props.link?.location_detail.events.length ?? 0)

// Seed every field from the link each time the dialog opens.
watch(
  () => props.visible,
  (open) => {
    if (!open || !props.link) return
    const loc = props.link.location_detail
    title.value = loc.title || ''
    point.value = loc.lat !== null && loc.lng !== null ? { lat: loc.lat, lng: loc.lng } : null
    arrival.value = props.link.arrival ? new Date(props.link.arrival) : null
    departure.value = props.link.departure ? new Date(props.link.departure) : null
    error.value = ''
  },
)

function close() {
  emit('update:visible', false)
}

async function onSubmit() {
  if (!props.link || !canSubmit.value) return
  error.value = ''
  submitting.value = true
  try {
    await updateLocation(props.link.location, {
      title: title.value.trim(),
      point: toWkt(point.value!.lng, point.value!.lat),
    })
    const updated = await updateEventLocation(props.link.id, {
      arrival: arrival.value ? arrival.value.toISOString() : null,
      departure: departure.value ? departure.value.toISOString() : null,
    })
    toast.add({ severity: 'success', summary: 'Location updated', life: 2500 })
    emit('saved', updated)
    close()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not save changes. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="`Edit ${link?.location_detail.title || 'location'}`"
    modal
    :style="{ width: '34rem' }"
    :draggable="false"
    @update:visible="emit('update:visible', $event)"
  >
    <form class="edit-form" @submit.prevent="onSubmit">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

      <Message v-if="sharedEventCount > 1" severity="warn" :closable="false">
        This location is used by {{ sharedEventCount }} events — changes to its name and position
        affect all of them.
      </Message>

      <LocationFields v-model:title="title" v-model:point="point" />

      <div class="edit-form__times">
        <div class="field">
          <label for="edit-arrival">Arrival (optional)</label>
          <DatePicker
            input-id="edit-arrival"
            v-model="arrival"
            show-time
            hour-format="24"
            show-button-bar
            fluid
          />
        </div>
        <div class="field">
          <label for="edit-departure">Departure (optional)</label>
          <DatePicker
            input-id="edit-departure"
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
      <Button label="Save" :loading="submitting" :disabled="!canSubmit" @click="onSubmit" />
    </template>
  </Dialog>
</template>

<style scoped>
.edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.5rem;
}

.edit-form__times {
  display: flex;
  gap: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
}
</style>
