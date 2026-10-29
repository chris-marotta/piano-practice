import { describe, expect, it } from 'vitest'
import { classifyHand, createRunDetector } from '../../src/play/runDetect'
import type { FinishedRun } from '../../src/play/runDetect'
import type { PlayedNote } from '../../src/play/analyse'
import { PAIR_WINDOW_MS, RUN_END_SILENCE_MS, RUN_START_SILENCE_MS } from '../../src/play/thresholds'

const G = 7
// One-octave G major up and down, 15 notes, tonic to tonic.
const G_UP_DOWN = [55, 57, 59, 60, 62, 64, 66, 67, 66, 64, 62, 60, 59, 57, 55]
const STEP = 400

const run = (midis: number[], start = 0, step = STEP): PlayedNote[] => midis.map((midi, i) => ({ midi, t: start + i * step }))
const lower = (midis: number[]) => midis.map((m) => m - 12)

/** Push every note; return what the detector returned for each push. */
function feed(d: ReturnType<typeof createRunDetector>, notes: PlayedNote[]): (FinishedRun | null)[] {
  return notes.map((n) => d.push(n))
}
const detector = () => createRunDetector({ tonicPc: G, expectedLength: 15 })

describe('createRunDetector', () => {
  it('a clean 15-note run finishes on the final G and reads as right hand', () => {
    const d = detector()
    const notes = run(G_UP_DOWN)
    const out = feed(d, notes)
    expect(out.slice(0, 14).every((r) => r === null)).toBe(true)
    const finished = out[14] as FinishedRun
    expect(finished.hand).toBe('rh')
    expect(finished.notes).toEqual(notes)
  })

  it('the same run with no final G finishes on tick after 2000 ms of silence', () => {
    const d = detector()
    const notes = run(G_UP_DOWN.slice(0, 14))
    feed(d, notes)
    const last = (notes[13] as PlayedNote).t
    expect(d.tick(last + RUN_END_SILENCE_MS - 1)).toBeNull()
    const finished = d.tick(last + RUN_END_SILENCE_MS) as FinishedRun
    expect(finished.notes).toEqual(notes)
    expect(finished.hand).toBe('rh')
    expect(d.tick(last + 10_000)).toBeNull()
  })

  it('a 3-note noodle followed by silence is discarded', () => {
    const d = detector()
    const notes = run([55, 57, 59])
    feed(d, notes)
    expect(d.tick((notes[2] as PlayedNote).t + RUN_END_SILENCE_MS)).toBeNull()
  })

  it('a discarded short run resets the detector, so the next run is detected', () => {
    const d = detector()
    feed(d, run([55, 57, 59]))
    expect(d.tick(10_000)).toBeNull()
    const out = feed(d, run(G_UP_DOWN, 11_000))
    expect((out[14] as FinishedRun).notes).toHaveLength(15)
  })

  it('notes before the first tonic are ignored', () => {
    const d = detector()
    const stray = run([57, 59, 62], 0)
    const real = run(G_UP_DOWN, 1000)
    feed(d, stray)
    const out = feed(d, real)
    const finished = out[14] as FinishedRun
    expect(finished.notes).toEqual(real)
    expect((finished.notes[0] as PlayedNote).midi % 12).toBe(G)
  })

  it('a second run after 1600 ms of silence is detected separately', () => {
    const d = detector()
    const first = run(G_UP_DOWN.slice(0, 14))
    feed(d, first)
    const gap = RUN_START_SILENCE_MS + 100
    const secondStart = (first[13] as PlayedNote).t + gap
    const second = run(G_UP_DOWN, secondStart)
    // The first G of the second run closes the first run (14 notes, no final G) and starts the next.
    const closed = d.push(second[0] as PlayedNote) as FinishedRun
    expect(closed.notes).toEqual(first)
    const out = feed(d, second.slice(1))
    const finished = out[13] as FinishedRun
    expect(finished.notes).toEqual(second)
  })

  it('a stray tonic within the start-silence gap stays part of the run', () => {
    const d = detector()
    const first = run(G_UP_DOWN.slice(0, 7))
    feed(d, first)
    const stray = d.push({ midi: 55, t: (first[6] as PlayedNote).t + RUN_START_SILENCE_MS - 1 })
    expect(stray).toBeNull()
  })

  it('a note arriving after 2000 ms of silence closes the old run even if tick never ran', () => {
    const d = detector()
    const first = run(G_UP_DOWN.slice(0, 10))
    feed(d, first)
    const closed = d.push({ midi: 57, t: (first[9] as PlayedNote).t + RUN_END_SILENCE_MS }) as FinishedRun
    expect(closed.notes).toEqual(first)
    // The late A is not a tonic, so it does not start anything.
    expect(d.tick(100_000)).toBeNull()
  })

  it('a run an octave lower (MIDI 43-55) reads as left hand', () => {
    const d = detector()
    const out = feed(d, run(lower(G_UP_DOWN)))
    expect((out[14] as FinishedRun).hand).toBe('lh')
  })

  it('octave-paired notes read as together and finish on the final pair', () => {
    const d = detector()
    const notes: PlayedNote[] = []
    G_UP_DOWN.forEach((m, i) => {
      notes.push({ midi: m - 12, t: i * STEP }, { midi: m, t: i * STEP + 20 })
    })
    const out = feed(d, notes)
    // The first note of the final pair must not end the run, or its partner would be lost.
    expect(out[28]).toBeNull()
    const finished = out[29] as FinishedRun
    expect(finished.hand).toBe('together')
    expect(finished.notes).toEqual(notes)
  })

  it('together: a final pair whose partner never comes finishes once the pair window has passed', () => {
    const d = detector()
    const notes: PlayedNote[] = []
    G_UP_DOWN.forEach((m, i) => {
      notes.push({ midi: m - 12, t: i * STEP }, { midi: m, t: i * STEP + 20 })
    })
    const lone = notes.slice(0, 29)
    feed(d, lone)
    const last = (lone[28] as PlayedNote).t
    expect(d.tick(last + PAIR_WINDOW_MS - 1)).toBeNull()
    const finished = d.tick(last + PAIR_WINDOW_MS) as FinishedRun
    expect(finished.notes).toEqual(lone)
    expect(finished.hand).toBe('together')
  })

  it('together: a new run right after a finished pair is not swallowed as the partner', () => {
    const d = detector()
    const notes: PlayedNote[] = []
    G_UP_DOWN.forEach((m, i) => {
      notes.push({ midi: m - 12, t: i * STEP }, { midi: m, t: i * STEP + 20 })
    })
    feed(d, notes)
    // Fresh again: the next rep starts on a new tonic with no wait.
    const next = run(G_UP_DOWN, notes[29]!.t + 300)
    const out = feed(d, next)
    expect((out[14] as FinishedRun).notes).toEqual(next)
  })

  it('a start is allowed immediately after a run finished on its tonic', () => {
    const d = detector()
    const first = run(G_UP_DOWN)
    feed(d, first)
    // Chris goes straight into the next rep: well inside the 1500 ms start-silence.
    const second = run(G_UP_DOWN, (first[14] as PlayedNote).t + 300)
    const out = feed(d, second)
    expect(out.slice(0, 14).every((r) => r === null)).toBe(true)
    expect((out[14] as FinishedRun).notes).toEqual(second)
  })

  it('reset drops a run in progress', () => {
    const d = detector()
    feed(d, run(G_UP_DOWN.slice(0, 10)))
    d.reset()
    expect(d.tick(100_000)).toBeNull()
    const out = feed(d, run(G_UP_DOWN, 200_000))
    expect((out[14] as FinishedRun).notes).toHaveLength(15)
  })

  it('does not finish on a non-tonic note even when long enough', () => {
    const d = detector()
    const out = feed(d, run([55, 57, 59, 60, 62, 64, 66, 67, 66, 64, 62, 60, 59, 57, 59, 57]))
    expect(out.every((r) => r === null)).toBe(true)
  })
})

describe('classifyHand', () => {
  it('right hand above the split, left hand below', () => {
    expect(classifyHand(run(G_UP_DOWN))).toBe('rh')
    expect(classifyHand(run(lower(G_UP_DOWN)))).toBe('lh')
  })

  it('a median of exactly 60 reads as right hand', () => {
    expect(classifyHand(run([58, 60, 62]))).toBe('rh')
    expect(classifyHand(run([58, 59, 61, 62]))).toBe('rh') // median 60 (average of the middle two)
    expect(classifyHand(run([57, 58, 60, 61]))).toBe('lh') // median 59
  })

  it('together needs at least 60% of onsets in octave pairs', () => {
    const base = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76]
    const paired = (pairs: number): PlayedNote[] => {
      const out: PlayedNote[] = []
      base.slice(0, pairs).forEach((m, i) => out.push({ midi: m - 12, t: i * 400 }, { midi: m, t: i * 400 + 20 }))
      base.slice(pairs, 10 - pairs).forEach((m, i) => out.push({ midi: m, t: 10_000 + i * 400 }))
      return out
    }
    // 3 pairs = 6 of 10 onsets = exactly 60%.
    expect(paired(3)).toHaveLength(10)
    expect(classifyHand(paired(3))).toBe('together')
    // 2 pairs = 4 of 10 onsets.
    expect(paired(2)).toHaveLength(10)
    expect(classifyHand(paired(2))).not.toBe('together')
  })

  it('fast neighbouring notes in one hand are not pairs', () => {
    const quick = [60, 62, 64, 65, 67].map((midi, i) => ({ midi, t: i * 60 }))
    expect(classifyHand(quick)).toBe('rh')
  })

  it('an empty run reads as right hand', () => {
    expect(classifyHand([])).toBe('rh')
  })
})
