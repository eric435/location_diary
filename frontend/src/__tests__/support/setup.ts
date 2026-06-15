// Global test setup: polyfill the browser APIs jsdom lacks but PrimeVue uses.
// PrimeVue's Textarea (auto-resize) and several overlays construct a
// ResizeObserver on mount, which jsdom doesn't implement.
import { vi } from 'vitest'

class ResizeObserverStub {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)

// jsdom has no layout engine; PrimeVue overlays sometimes read matchMedia.
if (!window.matchMedia) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}
