// Holds the user's events so the dashboard and the detail view share one
// source of truth. Locations live with their event in the detail view (they're
// only meaningful in that context), so they aren't cached here.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createEvent,
  deleteEvent,
  listEvents,
  updateEvent,
  type DiaryEvent,
  type EventInput,
} from '@/lib/diary'

export const useEventsStore = defineStore('events', () => {
  const events = ref<DiaryEvent[]>([])
  const loaded = ref(false)
  const loading = ref(false)

  const isEmpty = computed(() => loaded.value && events.value.length === 0)

  /** Fetch once; pass `force` to refetch (e.g. after an external change). */
  async function fetchEvents(force = false): Promise<void> {
    if (loaded.value && !force) return
    loading.value = true
    try {
      events.value = await listEvents()
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  function getById(id: number): DiaryEvent | undefined {
    return events.value.find((e) => e.id === id)
  }

  async function create(input: EventInput): Promise<DiaryEvent> {
    const event = await createEvent(input)
    // Newest first, matching the API's default ordering.
    events.value.unshift(event)
    return event
  }

  async function update(id: number, input: EventInput): Promise<DiaryEvent> {
    const event = await updateEvent(id, input)
    const i = events.value.findIndex((e) => e.id === id)
    if (i !== -1) events.value[i] = event
    return event
  }

  async function remove(id: number): Promise<void> {
    await deleteEvent(id)
    events.value = events.value.filter((e) => e.id !== id)
  }

  return { events, loaded, loading, isEmpty, fetchEvents, getById, create, update, remove }
})
