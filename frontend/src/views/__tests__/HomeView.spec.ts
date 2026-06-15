import { describe, it, expect, beforeEach, vi } from 'vitest'

import HomeView from '../HomeView.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import { useEventsStore } from '@/stores/events'
import { listEvents, deleteEvent } from '@/lib/diary'
import type { DiaryEvent } from '@/lib/diary'

// HomeView fetches on mount via the store -> diary API. Mock the API so the real
// store actions run without hitting the network, and stub the router-dependent
// AppHeader.
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))
vi.mock('@/lib/diary', () => ({
  listEvents: vi.fn().mockResolvedValue([]),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
}))
// The ConfirmDialog UI lives in App.vue, not HomeView. Auto-accept so we test
// HomeView's own delete handler rather than PrimeVue's dialog rendering.
vi.mock('primevue/useconfirm', () => ({
  useConfirm: () => ({ require: (opts: { accept?: () => void }) => opts.accept?.() }),
}))

const mockList = vi.mocked(listEvents)
const mockDelete = vi.mocked(deleteEvent)

const event = (id: number, title = `Event ${id}`): DiaryEvent => ({
  id,
  user: 1,
  title,
  description: '',
  created_at: '2026-06-14T00:00:00Z',
})

const mountHome = () =>
  mountWithPlugins(HomeView, { global: { stubs: { teleport: true, AppHeader: true } } })

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockResolvedValue([])
})

describe('HomeView', () => {
  it('fetches events on mount and shows the empty state when there are none', async () => {
    const wrapper = mountHome()
    await vi.waitFor(() => expect(wrapper.text()).toContain('No events yet'))
    expect(mockList).toHaveBeenCalled()
  })

  it('renders a card per event', async () => {
    const wrapper = mountHome()
    const store = useEventsStore()
    store.loaded = true
    store.events = [event(1, 'Trip'), event(2, 'Picnic')]
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.event-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Trip')
    expect(wrapper.text()).toContain('Picnic')
  })

  it('removes an event after the delete confirmation is accepted', async () => {
    const wrapper = mountHome()
    const store = useEventsStore()
    store.loaded = true
    store.events = [event(1, 'Doomed')]
    await wrapper.vm.$nextTick()

    await wrapper.get('[aria-label="Delete event"]').trigger('click')

    await vi.waitFor(() => expect(mockDelete).toHaveBeenCalledWith(1))
    expect(store.events).toHaveLength(0)
  })
})
