import { describe, expect, it, vi } from 'vitest'
import type { Question } from '../../src/drill/engine'
import { createEarStart, type EarStartDeps, type EarPromptArgs } from '../../src/ui/components/earStart'

const Q: Question = {
  id: 'ear:5',
  format: 'play',
  answer: 'G',
  ear: { root: 'C', tonic: 60, target: 67, degree: '5', withTonic: true },
} as unknown as Question

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function setup(o: Partial<EarStartDeps> = {}) {
  const played: EarPromptArgs[] = []
  const deps: EarStartDeps = {
    audioReady: () => true,
    load: () => Promise.resolve(true),
    play: async (a) => {
      played.push(a)
      return 1234
    },
    stop: vi.fn(),
    ...o,
  }
  return { ear: createEarStart(deps), played, deps }
}

describe('createEarStart (I1: wait for the piano, never play a superseded prompt)', () => {
  it('waits for a load in flight, then plays and resolves to the onset', async () => {
    const load = deferred<boolean>()
    const { ear, played } = setup({ load: () => load.promise })
    const p = ear.start(Q, { first: true, level: 1 })
    await Promise.resolve()
    expect(played).toHaveLength(0)
    load.resolve(true)
    await expect(p).resolves.toBe(1234)
    expect(played).toEqual([{ tonic: 60, target: 67, withTonic: true, home: false }])
  })

  it('a failed or timed-out load resolves null without playing', async () => {
    const { ear, played } = setup({ load: () => Promise.resolve(false) })
    await expect(ear.start(Q, { first: true, level: 1 })).resolves.toBeNull()
    expect(played).toHaveLength(0)
  })

  it('locked audio resolves null at once and does not start a load', async () => {
    const load = vi.fn(() => Promise.resolve(true))
    const { ear, played } = setup({ audioReady: () => false, load })
    await expect(ear.start(Q, { first: true, level: 1 })).resolves.toBeNull()
    expect(load).not.toHaveBeenCalled()
    expect(played).toHaveLength(0)
  })

  it('leaving (Next, Skip, unmount) during the load: the late prompt never plays', async () => {
    const load = deferred<boolean>()
    const { ear, played, deps } = setup({ load: () => load.promise })
    const p = ear.start(Q, { first: true, level: 1 })
    ear.leave()
    expect(deps.stop).toHaveBeenCalledTimes(1)
    load.resolve(true)
    await expect(p).resolves.toBeNull()
    expect(played).toHaveLength(0)
  })

  it('a newer start supersedes an older one still loading: only the newer plays', async () => {
    const load = deferred<boolean>()
    const { ear, played } = setup({ load: () => load.promise })
    const older = ear.start(Q, { first: true, level: 1 })
    const newer = ear.start(Q, { first: false, level: 1 })
    load.resolve(true)
    await expect(older).resolves.toBeNull()
    await expect(newer).resolves.toBe(1234)
    expect(played).toHaveLength(1)
  })

  it('level 6 first question plays home; later ones do not', async () => {
    const { ear, played } = setup()
    await ear.start(Q, { first: true, level: 6 })
    await ear.start(Q, { first: false, level: 6 })
    expect(played.map((a) => a.home)).toEqual([true, false])
  })

  it('a question without ear data, a throwing load or a throwing play resolves null', async () => {
    const plain = { ...Q, ear: undefined } as Question
    await expect(setup().ear.start(plain, { first: true, level: 1 })).resolves.toBeNull()
    const badLoad = setup({ load: () => Promise.reject(new Error('x')) })
    await expect(badLoad.ear.start(Q, { first: true, level: 1 })).resolves.toBeNull()
    const badPlay = setup({ play: () => Promise.reject(new Error('x')) })
    await expect(badPlay.ear.start(Q, { first: true, level: 1 })).resolves.toBeNull()
  })

  it('leave never throws, even if stop does', () => {
    const { ear } = setup({
      stop: () => {
        throw new Error('x')
      },
    })
    expect(() => ear.leave()).not.toThrow()
  })
})
