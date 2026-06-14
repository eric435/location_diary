// Loads the Google Maps JavaScript SDK on demand — no Vue wrapper library, just
// Google's own dynamic-import machinery.
//
// We inject the bootstrap `js` script exactly once (guarded by a module-level
// promise) and then lean on `google.maps.importLibrary(...)` to pull in only the
// pieces a component actually needs ('maps', 'marker', 'places'). The key comes
// from VITE_GOOGLE_MAPS_API_KEY; restrict it by HTTP referrer in the Google
// Cloud console since it ships to the browser.

// Cloud Map ID, required by AdvancedMarkerElement. Not a secret — it ships to
// the browser like the API key. Create one in the Google Cloud console under
// Maps Platform → Map Management (JavaScript map type).
export const MAP_ID: string | undefined = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || undefined

let bootstrap: Promise<void> | null = null

/** Inject the Maps `js` bootstrap script once; resolves when `google.maps` is ready. */
function loadSdk(): Promise<void> {
  if (bootstrap) return bootstrap

  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) {
    return Promise.reject(
      new Error('VITE_GOOGLE_MAPS_API_KEY is not set — cannot load Google Maps.'),
    )
  }

  bootstrap = new Promise<void>((resolve, reject) => {
    // The SDK calls this global once the core library has parsed; from that
    // point `google.maps.importLibrary` is available for lazy sub-libraries.
    const callback = '__gmapsReady'
    ;(window as unknown as Record<string, () => void>)[callback] = () => resolve()

    const params = new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      callback: `${callback}`,
    })
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      bootstrap = null // allow a later retry
      reject(new Error('Google Maps JS SDK failed to load.'))
    }
    document.head.append(script)
  })

  return bootstrap
}

// Typed thin wrappers over importLibrary for the libraries we use. Each ensures
// the SDK is loaded first, so callers don't have to sequence the bootstrap.

export async function loadMaps(): Promise<google.maps.MapsLibrary> {
  await loadSdk()
  return google.maps.importLibrary('maps') as Promise<google.maps.MapsLibrary>
}

export async function loadMarker(): Promise<google.maps.MarkerLibrary> {
  await loadSdk()
  return google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>
}

export async function loadPlaces(): Promise<google.maps.PlacesLibrary> {
  await loadSdk()
  return google.maps.importLibrary('places') as Promise<google.maps.PlacesLibrary>
}
