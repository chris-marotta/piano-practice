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
/** Feed a whole run, then let the final-tonic wait (PAIR_WINDOW_MS) pass; returns what the detector finishes. */
function playOut(d: ReturnType<typeof createRunDetector>, notes: PlayedNote[]): FinishedRun | null {
  const pushed = feed(d, notes)
  expect(pushed.every((r) => r === null)).toBe(true)
  return d.tick((notes[notes.length - 1] as PlayedNote).t + PAIR_WINDOW_MS)
}
const detector = () => createRunDetector({ tonicPc: G, expectedLength: 15 })

describe('createRunDetector', () => {
  it('a clean 15-note run ends on the final G (after the pair window) and reads as right hand', () => {
    const d = detector()
    const notes = run(G_UP_DOWN)
    const out = feed(d, notes)
    // The final G waits PAIR_WINDOW_MS in case it is half of an octave pair.
    expect(out.every((r) => r === null)).toBe(true)
    const lastT = (notes[14] as PlayedNote).t
    expect(d.tick(lastT + PAIR_WINDOW_MS - 1)).toBeNull()
    const finished = d.tick(lastT + PAIR_WINDOW_MS) as FinishedRun
    expect(finished.hand).toBe('rh')
    expect(finished.notes).toEqual(notes)
  })

  it('the next note closes a full-length run without waiting for tick', () => {
    const d = detector()
    const notes = run(G_UP_DOWN)
    feed(d, notes)
    const closed = d.push({ midi: 57, t: (notes[14] as PlayedNote).t + PAIR_WINDOW_MS + 1 }) as FinishedRun
    expect(closed.notes).toEqual(notes)
    // The late A is not a tonic, so nothing starts.
    expect(d.tick(100_000)).toBeNull()
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
    expect((playOut(d, run(G_UP_DOWN, 11_000)) as FinishedRun).notes).toHaveLength(15)
  })

  it('notes before the first tonic are ignored', () => {
    const d = detector()
    const stray = run([57, 59, 62], 0)
    const real = run(G_UP_DOWN, 1000)
    feed(d, stray)
    const finished = playOut(d, real) as FinishedRun
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
    const finished = playOut(d, second.slice(1)) as FinishedRun
    expect(finished.notes).toEqual(second)
  })

  it('a stray tonic within the start-silence gap stays part of the run', () => {
    const d = detector()
    const first = run(G_UP_DOWN.slice(0, 7))
    feed(d, first)
    const stray: PlayedNote = { midi: 55, t: (first[6] as PlayedNote).t + RUN_START_SILENCE_MS - 1 }
    expect(d.push(stray)).toBeNull()
    // The run carries on and finishes with the stray G still in it (15 notes: 7 + stray + 7).
    const rest = run(G_UP_DOWN.slice(8), stray.t + STEP, STEP)
    const finished = playOut(d, rest) as FinishedRun
    expect(finished.notes).toHaveLength(15)
    expect(finished.notes[7]).toEqual(stray)
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
    expect((playOut(d, run(lower(G_UP_DOWN))) as FinishedRun).hand).toBe('lh')
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
    const next = run(G_UP_DOWN, (notes[29] as PlayedNote).t + 300)
    expect((playOut(d, next) as FinishedRun).notes).toEqual(next)
  })

  it('a start is allowed immediately after a run finished on its tonic', () => {
    const d = detector()
    const first = run(G_UP_DOWN)
    feed(d, first)
    // Chris goes straight into the next rep: well inside the 1500 ms start-silence.
    const second = run(G_UP_DOWN, (first[14] as PlayedNote).t + 300)
    const out = feed(d, second)
    // The first note of the second rep closes the first rep (final G waiting) and starts the next.
    expect((out[0] as FinishedRun).notes).toEqual(first)
    expect(out.slice(1).every((r) => r === null)).toBe(true)
    const finished = d.tick((second[14] as PlayedNote).t + PAIR_WINDOW_MS) as FinishedRun
    expect(finished.notes).toEqual(second)
  })

  it('reset drops a run in progress', () => {
    const d = detector()
    feed(d, run(G_UP_DOWN.slice(0, 10)))
    d.reset()
    expect(d.tick(100_000)).toBeNull()
    expect((playOut(d, run(G_UP_DOWN, 200_000)) as FinishedRun).notes).toHaveLength(15)
  })

  it('a short run closed by a later tonic returns null and the tonic still starts the next run', () => {
    const d = detector()
    feed(d, run([55, 57, 59]))
    const second = run(G_UP_DOWN, 2 * RUN_START_SILENCE_MS)
    expect(d.push(second[0] as PlayedNote)).toBeNull()
    const finished = playOut(d, second.slice(1)) as FinishedRun
    expect(finished.notes).toEqual(second)
  })

  it('a full-length run closed by a non-partner tonic is returned and that tonic starts the next run', () => {
    const d = detector()
    const first = run(G_UP_DOWN)
    feed(d, first)
    const next = run(G_UP_DOWN, (first[14] as PlayedNote).t + PAIR_WINDOW_MS + 1)
    expect((d.push(next[0] as PlayedNote) as FinishedRun).notes).toEqual(first)
    const finished = playOut(d, next.slice(1)) as FinishedRun
    expect(finished.notes).toEqual(next)
  })

  it('a pending run closed by a non-partner, non-tonic note is returned and nothing starts', () => {
    const d = detector()
    const first = run(G_UP_DOWN)
    feed(d, first)
    const closed = d.push({ midi: 62, t: (first[14] as PlayedNote).t + 50 }) as FinishedRun
    expect(closed.notes).toEqual(first)
    expect(d.tick(100_000)).toBeNull()
  })

  it('together near the ratio: a final pair keeps its partner even though the run reads as rh without it', () => {
    // 6 octave pairs + 8 single notes + a final pair: 12/21 = 0.571 without the partner, 14/22 = 0.636 with it.
    const d = detector()
    const notes: PlayedNote[] = []
    let t = 0
    G_UP_DOWN.forEach((m, i) => {
      if (i < 6) notes.push({ midi: m - 12, t }, { midi: m, t: t + 20 })
      else notes.push({ midi: m, t })
      t += STEP
    })
    const partner: PlayedNote = { midi: 67, t: t - STEP + 20 }
    expect(classifyHand(notes)).not.toBe('together')
    const probe = [...notes, partner]
    expect(classifyHand(probe)).toBe('together')

    expect(feed(d, notes).every((r) => r === null)).toBe(true)
    const finished = d.push(partner) as FinishedRun
    expect(finished.notes).toEqual(probe)
    expect(finished.hand).toBe('together')

    // The next rep starts clean: no phantom run from a leftover partner.
    const next = run(G_UP_DOWN, partner.t + 300)
    const pushed = feed(d, next)
    expect(pushed.every((r) => r === null)).toBe(true)
    const second = d.tick((next[14] as PlayedNote).t + PAIR_WINDOW_MS) as FinishedRun
    expect(second.notes).toEqual(next)
    expect(second.hand).toBe('rh')
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
