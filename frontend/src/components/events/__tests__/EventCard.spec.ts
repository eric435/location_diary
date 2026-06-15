import { describe, it, expect, beforeEach, vi } from 'vitest'

import EventCard from '../EventCard.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import type { DiaryEvent } from '@/lib/diary'

// Navigation is the one side effect; mock the router and assert push().
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const event: DiaryEvent = {
  id: 42,
  user: 1,
  title: 'Trip to Vancouver',
  description: 'A weekend by the water.',
  created_at: '2026-06-14T12:00:00Z',
}

beforeEach(() => push.mockClear())

describe('EventCard', () => {
  it('renders the title, description and a short date', () => {
    const wrapper = mountWithPlugins(EventCard, { props: { event } })
    expect(wrapper.text()).toContain('Trip to Vancouver')
    expect(wrapper.text()).toContain('A weekend by the water.')
    expect(wrapper.text()).toMatch(/Jun 14, 2026/)
  })

  it('shows a muted fallback when there is no description', () => {
    const wrapper = mountWithPlugins(EventCard, {
      props: { event: { ...event, description: '' } },
    })
    expect(wrapper.text()).toContain('No description')
  })

  it('navigates to the event detail view when the card is clicked', async () => {
    const wrapper = mountWithPlugins(EventCard, { props: { event } })
    await wrapper.find('.event-card').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'event-detail', params: { id: 42 } })
  })

  it('emits edit without navigating when the edit action is clicked', async () => {
    const wrapper = mountWithPlugins(EventCard, { props: { event } })
    await wrapper.get('[aria-label="Edit event"]').trigger('click')

    expect(wrapper.emitted('edit')?.[0]).toEqual([event])
    expect(push).not.toHaveBeenCalled()
  })

  it('emits delete when the delete action is clicked', async () => {
    const wrapper = mountWithPlugins(EventCard, { props: { event } })
    await wrapper.get('[aria-label="Delete event"]').trigger('click')

    expect(wrapper.emitted('delete')?.[0]).toEqual([event])
    expect(push).not.toHaveBeenCalled()
  })
})
