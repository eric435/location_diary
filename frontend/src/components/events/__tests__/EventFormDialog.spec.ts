import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { ApiError } from '@/lib/http'

import EventFormDialog from '../EventFormDialog.vue'
import { mountWithPlugins } from '@/__tests__/support/mount'
import { useEventsStore } from '@/stores/events'
import type { DiaryEvent } from '@/lib/diary'

const existing: DiaryEvent = {
  id: 7,
  user: 1,
  title: 'Original',
  description: 'Original description',
  created_at: '2026-06-14T00:00:00Z',
}

// The dialog only seeds its form on the visible false->true transition, and an
// invisible Dialog renders an empty root (which breaks setProps). So drive it
// through a tiny harness with a real root element and toggle visibility there.
function mountWithHarness(event: DiaryEvent | null) {
  const Harness = defineComponent({
    data: () => ({ visible: false }),
    render() {
      // A real root + open button means the harness never renders empty, so
      // toggling via a DOM click (not setProps/setData) drives the child's
      // visible false->true watch cleanly.
      return h('div', [
        h('button', { class: 'open-btn', onClick: () => (this.visible = true) }, 'open'),
        h(EventFormDialog, {
          visible: this.visible,
          event,
          'onUpdate:visible': (v: boolean) => (this.visible = v),
          onSaved: (e: DiaryEvent) => this.$emit('saved', e),
        }),
      ])
    },
  })
  return mountWithPlugins(Harness, { global: { stubs: { teleport: true } } })
}

function findButton(wrapper: ReturnType<typeof mountWithHarness>, label: RegExp) {
  const btn = wrapper.findAll('button').find((b) => label.test(b.text()))
  if (!btn) throw new Error(`button matching ${label} not found`)
  return btn
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventFormDialog', () => {
  it('creates a new event and closes on submit', async () => {
    const wrapper = mountWithHarness(null)
    const store = useEventsStore()
    const create = vi.spyOn(store, 'create').mockResolvedValue(existing)

    await wrapper.get(".open-btn").trigger("click")
    await wrapper.get('#event-title').setValue('Trip')
    await wrapper.get('#event-description').setValue('Notes')
    await findButton(wrapper, /^Create$/).trigger('click')
    await vi.waitFor(() => expect(create).toHaveBeenCalled())

    expect(create).toHaveBeenCalledWith({ title: 'Trip', description: 'Notes' })
    expect(wrapper.emitted('saved')?.[0]).toEqual([existing])
    // Closing requested -> harness flips visible back to false.
    expect((wrapper.vm as unknown as { visible: boolean }).visible).toBe(false)
  })

  it('seeds the form from the event and updates in edit mode', async () => {
    const wrapper = mountWithHarness(existing)
    const store = useEventsStore()
    const update = vi.spyOn(store, 'update').mockResolvedValue({ ...existing, title: 'Renamed' })

    await wrapper.get(".open-btn").trigger("click")
    expect((wrapper.get('#event-title').element as HTMLInputElement).value).toBe('Original')

    await wrapper.get('#event-title').setValue('Renamed')
    await findButton(wrapper, /^Save$/).trigger('click')
    await vi.waitFor(() => expect(update).toHaveBeenCalled())

    expect(update).toHaveBeenCalledWith(7, { title: 'Renamed', description: 'Original description' })
  })

  it('surfaces an API error without closing', async () => {
    const wrapper = mountWithHarness(null)
    const store = useEventsStore()
    vi.spyOn(store, 'create').mockRejectedValue(new ApiError(400, null, 'Title already used.'))

    await wrapper.get(".open-btn").trigger("click")
    await wrapper.get('#event-title').setValue('Dup')
    await findButton(wrapper, /^Create$/).trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Title already used.'))

    expect((wrapper.vm as unknown as { visible: boolean }).visible).toBe(true) // still open
  })
})
