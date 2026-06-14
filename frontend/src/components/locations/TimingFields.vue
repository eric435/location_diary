<script setup lang="ts">
// The optional arrival / departure time pair recorded on an event-location
// link. Bound via two models so callers manage each independently:
//   v-model:arrival    — Date | null
//   v-model:departure  — Date | null
// Shared by AddLocationDialog and EditLocationDialog.
import DatePicker from 'primevue/datepicker'

const arrival = defineModel<Date | null>('arrival', { required: true })
const departure = defineModel<Date | null>('departure', { required: true })
</script>

<template>
  <div class="timing-fields">
    <div class="field">
      <label for="timing-arrival">Arrival (optional)</label>
      <DatePicker
        input-id="timing-arrival"
        v-model="arrival"
        show-time
        hour-format="24"
        show-button-bar
        fluid
      />
    </div>
    <div class="field">
      <label for="timing-departure">Departure (optional)</label>
      <DatePicker
        input-id="timing-departure"
        v-model="departure"
        show-time
        hour-format="24"
        show-button-bar
        fluid
      />
    </div>
  </div>
</template>

<style scoped>
.timing-fields {
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
