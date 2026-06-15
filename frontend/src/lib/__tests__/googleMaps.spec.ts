import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// googleMaps.ts holds module-level bootstrap state and reads import.meta.env at
// load time, so each test resets the module registry and re-imports it fresh.

interface GoogleWindow {
  google?: { maps: { importLibrary: ReturnType<typeof vi.fn> } }
  __gmapsReady?: () => void
}
const win = window as unknown as GoogleWindow

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete win.google
  delete win.__gmapsReady
  document.querySelectorAll('script[src*="maps.googleapis.com"]').forEach((s) => s.remove())
})

/** Stand up a fake `google.maps.importLibrary` the loader can call. */
function stubSdk() {
  const importLibrary = vi.fn().mockResolvedValue({ marker: true })
  win.google = { maps: { importLibrary } }
  return importLibrary
}

describe('loadSdk (via loadMaps)', () => {
  it('rejects when the API key is not configured', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    const { loadMaps } = await import('../googleMaps')
    await expect(loadMaps()).rejects.toThrow(/VITE_GOOGLE_MAPS_API_KEY/)
  })

  it('injects the bootstrap script and resolves once the SDK signals ready', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const importLibrary = stubSdk()
    const { loadMaps } = await import('../googleMaps')

    const promise = loadMaps()
    // The loader appends the script and defines the ready callback synchronously;
    // simulate Google's SDK invoking it.
    expect(typeof win.__gmapsReady).toBe('function')
    win.__gmapsReady!()
    await promise

    expect(importLibrary).toHaveBeenCalledWith('maps')
    const scripts = document.querySelectorAll('script[src*="maps.googleapis.com"]')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]!.getAttribute('src')).toContain('key=test-key')
  })

  it('injects the bootstrap script only once across multiple library loads', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const importLibrary = stubSdk()
    const { loadMaps, loadMarker, loadPlaces } = await import('../googleMaps')

    const promises = [loadMaps(), loadMarker(), loadPlaces()]
    win.__gmapsReady!()
    await Promise.all(promises)

    expect(document.querySelectorAll('script[src*="maps.googleapis.com"]')).toHaveLength(1)
    expect(importLibrary).toHaveBeenCalledWith('maps')
    expect(importLibrary).toHaveBeenCalledWith('marker')
    expect(importLibrary).toHaveBeenCalledWith('places')
  })
})

describe('MAP_ID', () => {
  it('reflects the configured map id, or is undefined when unset', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'map-123')
    const mod = await import('../googleMaps')
    expect(mod.MAP_ID).toBe('map-123')

    vi.resetModules()
    vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', '')
    const mod2 = await import('../googleMaps')
    expect(mod2.MAP_ID).toBeUndefined()
  })
})
