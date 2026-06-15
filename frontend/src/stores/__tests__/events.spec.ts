import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { listEvents, createEvent, updateEvent, deleteEvent } from '@/lib/diary'
import { useEventsStore } from '../events'

vi.mock('@/lib/diary', () => ({
  listEvents: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

const mockList = vi.mocked(listEvents)
const mockCreate = vi.mocked(createEvent)
const mockUpdate = vi.mocked(updateEvent)
const mockDelete = vi.mocked(deleteEvent)

const event = (id: number, title = `E${id}`) => ({
  id,
  user: 1,
  title,
  description: '',
  created_at: '2026-06-14T00:00:00Z',
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('useEventsStore', () => {
  describe('fetchEvents', () => {
    it('loads once and caches; a second call does not refetch', async () => {
      mockList.mockResolvedValue([event(1)])
      const store = useEventsStore()

      await store.fetchEvents()
      await store.fetchEvents()

      expect(mockList).toHaveBeenCalledOnce()
      expect(store.events).toEqual([event(1)])
      expect(store.loaded).toBe(true)
    })

    it('refetches when forced', async () => {
      mockList.mockResolvedValue([event(1)])
      const store = useEventsStore()

      await store.fetchEvents()
      await store.fetchEvents(true)

      expect(mockList).toHaveBeenCalledTimes(2)
    })
  })

  it('isEmpty is true only after loading an empty list', async () => {
    mockList.mockResolvedValue([])
    const store = useEventsStore()
    expect(store.isEmpty).toBe(false) // not loaded yet
    await store.fetchEvents()
    expect(store.isEmpty).toBe(true)
  })

  it('create prepends the new event (newest first)', async () => {
    mockList.mockResolvedValue([event(1)])
    mockCreate.mockResolvedValue(event(2, 'New'))
    const store = useEventsStore()
    await store.fetchEvents()

    const created = await store.create({ title: 'New', description: '' })

    expect(created).toEqual(event(2, 'New'))
    expect(store.events.map((e) => e.id)).toEqual([2, 1])
  })

  it('update replaces the matching event in place', async () => {
    mockList.mockResolvedValue([event(1), event(2)])
    mockUpdate.mockResolvedValue(event(2, 'Renamed'))
    const store = useEventsStore()
    await store.fetchEvents()

    await store.update(2, { title: 'Renamed', description: '' })

    expect(store.getById(2)?.title).toBe('Renamed')
    expect(store.events).toHaveLength(2)
  })

  it('remove deletes and drops the event from the list', async () => {
    mockList.mockResolvedValue([event(1), event(2)])
    mockDelete.mockResolvedValue(undefined)
    const store = useEventsStore()
    await store.fetchEvents()

    await store.remove(1)

    expect(mockDelete).toHaveBeenCalledWith(1)
    expect(store.events.map((e) => e.id)).toEqual([2])
  })
})
