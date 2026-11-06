import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A fake Tone.Sampler: each construction is recorded, and the test fires its onload / onerror (ruling R-C13).
interface FakeOpts {
  onload: () => void
  onerror: (e: unknown) => void
}
const made: FakeOpts[] = []
class FakeSampler {
  loaded = false
  constructor(opts: FakeOpts) {
    made.push(opts)
  }
  toDestination() {
    return this
  }
}

vi.mock('tone', async (importOriginal) => ({ ...(await importOriginal<object>()), Sampler: FakeSampler }))

async function fresh() {
  vi.resetModules()
  return import('../../src/audio/piano')
}

beforeEach(() => {
  made.length = 0
})
afterEach(() => {
  vi.useRealTimers()
})

describe('loadPiano caching (R-C13)', () => {
  it('a load that errors is not cached: the next call (Retry) tries again', async () => {
    const { loadPiano } = await fresh()
    const first = loadPiano()
    expect(made).toHaveLength(1)
    made[0]!.onerror(new Error('offline'))
    await expect(first).resolves.toBe(false)
    const second = loadPiano()
    expect(second).not.toBe(first)
    expect(made).toHaveLength(2)
    made[1]!.onload()
    await expect(second).resolves.toBe(true)
  })

  it('a load that succeeded is cached: no second sampler', async () => {
    const { loadPiano } = await fresh()
    const first = loadPiano()
    made[0]!.onload()
    await expect(first).resolves.toBe(true)
    expect(loadPiano()).toBe(first)
    expect(made).toHaveLength(1)
  })

  it('a load still in flight is shared', async () => {
    const { loadPiano } = await fresh()
    const first = loadPiano()
    expect(loadPiano()).toBe(first)
    expect(made).toHaveLength(1)
  })

  it('the 10 s timeout resolves false but keeps the load in flight (no second download); an error after it clears the cache', async () => {
    vi.useFakeTimers()
    const { loadPiano } = await fresh()
    const first = loadPiano()
    vi.advanceTimersByTime(10_000)
    await expect(first).resolves.toBe(false)
    expect(loadPiano()).toBe(first)
    expect(made).toHaveLength(1)
    made[0]!.onerror(new Error('gave up'))
    expect(loadPiano()).not.toBe(first)
    expect(made).toHaveLength(2)
  })
})
