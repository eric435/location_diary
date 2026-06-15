// A small client-side upload queue. Files are uploaded a few at a time so a
// batch drop doesn't fire dozens of simultaneous requests at the server, and
// each file retries with exponential backoff on transient failures (network
// blips, 429s, 5xx). Client errors (4xx) fail fast — retrying won't help.
//
// It's generic over the upload result so it isn't tied to media; callers pass
// the uploader and an onSuccess hook.
import { computed, ref, type Ref } from 'vue'
import { ApiError } from '@/lib/http'

export type UploadStatus = 'queued' | 'uploading' | 'success' | 'error'

export interface UploadItem<R> {
  /** Stable local id, unrelated to any server id. */
  id: number
  file: File
  status: UploadStatus
  /** Attempt number currently in flight (1-based); 0 before the first try. */
  attempt: number
  error: string
  result: R | null
}

interface Options<R> {
  /** Performs a single upload attempt for one file. */
  upload: (file: File) => Promise<R>
  /** Called once per file that ultimately succeeds. */
  onSuccess?: (result: R, item: UploadItem<R>) => void
  /** Max files in flight at once. */
  concurrency?: number
  /** Total attempts per file, including the first. */
  maxAttempts?: number
  /** Base backoff in ms; doubles each retry, plus jitter. */
  baseDelay?: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Only transient failures are worth retrying. A network error (no ApiError)
// could be a blip; among HTTP statuses, 429 and 5xx may clear on their own,
// while 4xx (validation, too large, auth) will fail the same way every time.
function isRetryable(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500
  return true
}

export function useUploadQueue<R>(options: Options<R>) {
  const { upload, onSuccess, concurrency = 3, maxAttempts = 4, baseDelay = 600 } = options

  const items = ref<UploadItem<R>[]>([]) as Ref<UploadItem<R>[]>
  let nextId = 0
  let active = 0

  const counts = computed(() => {
    const c = { queued: 0, uploading: 0, success: 0, error: 0 }
    for (const item of items.value) c[item.status]++
    return c
  })
  const isUploading = computed(() => counts.value.queued + counts.value.uploading > 0)
  const hasItems = computed(() => items.value.length > 0)

  // Fill open slots with queued items until we hit the concurrency cap.
  function pump() {
    while (active < concurrency) {
      const next = items.value.find((i) => i.status === 'queued')
      if (!next) break
      active++
      void run(next)
    }
  }

  async function run(item: UploadItem<R>) {
    item.status = 'uploading'
    try {
      item.result = await attempt(item)
      item.status = 'success'
      if (item.result !== null) onSuccess?.(item.result, item)
    } catch (e) {
      item.status = 'error'
      item.error =
        e instanceof ApiError ? e.message : 'Upload failed — check your connection and retry.'
    } finally {
      active--
      pump()
    }
  }

  // One file, up to maxAttempts tries, backing off between retryable failures.
  async function attempt(item: UploadItem<R>): Promise<R> {
    for (let n = 1; ; n++) {
      item.attempt = n
      try {
        return await upload(item.file)
      } catch (e) {
        if (n >= maxAttempts || !isRetryable(e)) throw e
        const backoff = baseDelay * 2 ** (n - 1) + Math.random() * baseDelay
        await sleep(backoff)
      }
    }
  }

  function enqueue(files: File[]) {
    for (const file of files) {
      items.value.push({
        id: nextId++,
        file,
        status: 'queued',
        attempt: 0,
        error: '',
        result: null,
      })
    }
    pump()
  }

  /** Re-queue a single failed item. */
  function retry(item: UploadItem<R>) {
    if (item.status !== 'error') return
    item.attempt = 0
    item.error = ''
    item.status = 'queued'
    pump()
  }

  /** Re-queue every failed item. */
  function retryFailed() {
    for (const item of items.value) if (item.status === 'error') retry(item)
  }

  /** Forget everything. Callers should only do this when nothing is in flight. */
  function reset() {
    items.value = []
  }

  return {
    items,
    counts,
    isUploading,
    hasItems,
    enqueue,
    retry,
    retryFailed,
    reset,
  }
}
