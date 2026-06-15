import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { useUploadQueue } from '../useUploadQueue'
import { ApiError } from '@/lib/http'

const file = (name: string) => new File(['data'], name)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useUploadQueue', () => {
  it('uploads queued files and reports success with results', async () => {
    const upload = vi.fn(async (f: File) => `url:${f.name}`)
    const onSuccess = vi.fn()
    const q = useUploadQueue({ upload, onSuccess })

    q.enqueue([file('a.jpg'), file('b.jpg')])
    await vi.runAllTimersAsync()

    expect(q.counts.value.success).toBe(2)
    expect(q.isUploading.value).toBe(false)
    expect(upload).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledWith('url:a.jpg', expect.objectContaining({ status: 'success' }))
  })

  it('respects the concurrency cap', async () => {
    let inFlight = 0
    let peak = 0
    const upload = vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 100))
      inFlight--
      return 'ok'
    })
    const q = useUploadQueue({ upload, concurrency: 2 })

    q.enqueue([file('a'), file('b'), file('c'), file('d')])
    await vi.runAllTimersAsync()

    expect(peak).toBe(2)
    expect(q.counts.value.success).toBe(4)
  })

  it('retries transient (5xx) failures with backoff, then succeeds', async () => {
    let calls = 0
    const upload = vi.fn(async () => {
      calls++
      if (calls < 3) throw new ApiError(503, null, 'Service unavailable')
      return 'ok'
    })
    const q = useUploadQueue({ upload, maxAttempts: 4, baseDelay: 10 })

    q.enqueue([file('a')])
    await vi.runAllTimersAsync()

    expect(upload).toHaveBeenCalledTimes(3)
    expect(q.counts.value.success).toBe(1)
  })

  it('fails fast on client (4xx) errors without retrying', async () => {
    const upload = vi.fn(async () => {
      throw new ApiError(400, { detail: 'Too large' }, 'Too large')
    })
    const q = useUploadQueue({ upload, maxAttempts: 4 })

    q.enqueue([file('a')])
    await vi.runAllTimersAsync()

    expect(upload).toHaveBeenCalledOnce()
    expect(q.counts.value.error).toBe(1)
    expect(q.items.value[0]!.error).toBe('Too large')
  })

  it('gives up after maxAttempts on persistent transient failures', async () => {
    const upload = vi.fn(async () => {
      throw new ApiError(500, null, 'Boom')
    })
    const q = useUploadQueue({ upload, maxAttempts: 3, baseDelay: 5 })

    q.enqueue([file('a')])
    await vi.runAllTimersAsync()

    expect(upload).toHaveBeenCalledTimes(3)
    expect(q.counts.value.error).toBe(1)
  })

  it('retry() re-queues a single failed item', async () => {
    let calls = 0
    const upload = vi.fn(async () => {
      calls++
      if (calls === 1) throw new ApiError(400, null, 'Nope')
      return 'ok'
    })
    const q = useUploadQueue({ upload, maxAttempts: 1 })

    q.enqueue([file('a')])
    await vi.runAllTimersAsync()
    expect(q.counts.value.error).toBe(1)

    q.retry(q.items.value[0]!)
    await vi.runAllTimersAsync()

    expect(q.counts.value.success).toBe(1)
    expect(q.counts.value.error).toBe(0)
  })

  it('reset() clears all items', async () => {
    const q = useUploadQueue({ upload: async () => 'ok' })
    q.enqueue([file('a')])
    await vi.runAllTimersAsync()

    q.reset()

    expect(q.hasItems.value).toBe(false)
    expect(q.items.value).toHaveLength(0)
  })
})
