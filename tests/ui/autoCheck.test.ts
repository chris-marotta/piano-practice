import { describe, expect, it } from 'vitest'
import { expectedRun } from '../../src/play/sequence'
import {
  REP_KINDS,
  assignRun,
  chordMatched,
  createStepChecker,
  emptyTiles,
  placeRun,
  untick,
  toggleTile,
} from '../../src/ui/screens/steps/autoCheck'
import type { RunOutcome } from '../../src/ui/screens/play/playRun'

const f = false
const t = true

describe('REP_KINDS', () => {
  it('matches the six v1 tiles: RH ×2, LH ×2, Together ×2', () => {
    expect(REP_KINDS).toEqual(['rh', 'rh', 'lh', 'lh', 'together', 'together'])
  })
})

describe('assignRun', () => {
  it('[f,f,f,f,f,f] + lh → 2', () => {
    expect(assignRun([f, f, f, f, f, f], 'lh')).toBe(2)
  })

  it('[t,t,f,f,f,f] + rh → 2 (RH full: first unticked of any kind)', () => {
    expect(assignRun([t, t, f, f, f, f], 'rh')).toBe(2)
  })

  it('all ticked → null', () => {
    expect(assignRun([t, t, t, t, t, t], 'together')).toBeNull()
  })

  it('the second tile of a kind once the first is ticked', () => {
    expect(assignRun([f, f, f, f, t, f], 'together')).toBe(5)
    expect(assignRun([t, f, f, f, f, f], 'rh')).toBe(1)
  })
})

describe('chordMatched', () => {
  const held = (...m: number[]) => new Set(m)

  it('E-G-C vs C major → true (any inversion)', () => {
    expect(chordMatched(held(64, 67, 72), 'C', 'M')).toBe(true)
  })

  it('C-E vs C major → false', () => {
    expect(chordMatched(held(60, 64), 'C', 'M')).toBe(false)
  })

  it('an extra note → false; doubled pitch classes still match', () => {
    expect(chordMatched(held(60, 64, 67, 69), 'C', 'M')).toBe(false)
    expect(chordMatched(held(48, 60, 64, 67), 'C', 'M')).toBe(true)
  })

  it('minor and diminished by pitch class', () => {
    expect(chordMatched(held(57, 60, 64), 'A', 'm')).toBe(true)
    expect(chordMatched(held(57, 61, 64), 'A', 'm')).toBe(false)
    expect(chordMatched(held(71, 74, 77), 'B', 'dim')).toBe(true)
  })

  it('nothing held → false', () => {
    expect(chordMatched(held(), 'C', 'M')).toBe(false)
  })
})

const outcome = (slips: number, evenness: number | null = 0.9): RunOutcome => ({
  kind: 'check',
  slips,
  issues: [],
  evenness,
  tempo: 80,
  intervals: [],
})

describe('tiles', () => {
  it('placeRun ticks the assigned tile and stores its result', () => {
    const tiles = placeRun(emptyTiles(), 'lh', outcome(0))
    expect(tiles.map((x) => x.ticked)).toEqual([f, f, t, f, f, f])
    expect(tiles[2]?.result?.slips).toBe(0)
    expect(tiles[0]?.result).toBeNull()
  })

  it('placeRun skips hand-ticked tiles and returns the same tiles when all are ticked', () => {
    const one = toggleTile(emptyTiles(), 0)
    const two = placeRun(one, 'rh', outcome(1))
    expect(two[0]?.result).toBeNull()
    expect(two[1]?.result?.slips).toBe(1)
    const full = REP_KINDS.reduce((ts, _k, i) => toggleTile(ts, i), emptyTiles())
    expect(placeRun(full, 'rh', outcome(0))).toBe(full)
  })

  it('untick clears both the tick and the result', () => {
    const tiles = untick(placeRun(emptyTiles(), 'rh', outcome(0)), 0)
    expect(tiles[0]).toEqual({ ticked: false, result: null })
  })
})

describe('createStepChecker', () => {
  const E = { root: 'E', form: 'major' as const }
  const play = (notes: number[], step = 400, start = 1000) => notes.map((midi, i) => ({ midi, t: start + i * step }))

  it('a clean RH run from E4 finishes on the final tonic partner window and judges clean', () => {
    const checker = createStepChecker(E, 1)
    const notes = play(expectedRun(E, 1, 4).map((e) => e.midi))
    const outs = notes.map((n) => checker.push(n)).filter((x) => x !== null)
    expect(outs).toHaveLength(0) // the last tonic waits for a possible octave partner
    const done = checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    expect(done?.hand).toBe('rh')
    expect(done?.outcome).toMatchObject({ kind: 'check', slips: 0 })
    expect(done?.outcome.evenness).toBeCloseTo(1)
  })

  it('a LH run from E3 reads as LH and judges clean', () => {
    const checker = createStepChecker(E, 1)
    const notes = play(expectedRun(E, 1, 3).map((e) => e.midi))
    notes.forEach((n) => checker.push(n))
    const done = checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    expect(done?.hand).toBe('lh')
    expect(done?.outcome.slips).toBe(0)
  })

  describe('hand by octave offset vs the RH run from octave 4 (P15)', () => {
    const G = { root: 'G', form: 'major' as const }
    const finish = (notes: { midi: number; t: number }[]) => {
      const checker = createStepChecker(G, 2)
      // A Together run finishes on push (the final tonic's partner); one-hand runs on tick after the pair window.
      const pushed = notes.map((n) => checker.push(n)).filter((x) => x !== null)
      return pushed[0] ?? checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    }
    const g4 = expectedRun(G, 2, 4).map((e) => e.midi)

    it('a G major 2-octave LH run from G3 → lh (median rule would say rh)', () => {
      const done = finish(play(g4.map((m) => m - 12)))
      expect(done?.hand).toBe('lh')
      expect(done?.outcome.slips).toBe(0)
    })

    it('RH from G4 → rh', () => {
      expect(finish(play(g4))?.hand).toBe('rh')
    })

    it('RH played an octave up (+12) → rh', () => {
      const done = finish(play(g4.map((m) => m + 12)))
      expect(done?.hand).toBe('rh')
      expect(done?.outcome.slips).toBe(0)
    })

    it('Together stays Together (pair ratio)', () => {
      const notes = g4.flatMap((m, i) => [
        { midi: m - 12, t: 1000 + i * 400 },
        { midi: m, t: 1010 + i * 400 },
      ])
      const done = finish(notes)
      expect(done?.hand).toBe('together')
      expect(done?.outcome.slips).toBe(0)
    })
  })

  it('three wrong notes → 3 slips', () => {
    const checker = createStepChecker(E, 1)
    const midis = expectedRun(E, 1, 4).map((e) => e.midi)
    // F#4 → F4, G#4 → G4, C#5 → C5 going up
    const wrong = midis.map((m, i) => (i === 1 || i === 2 || i === 5 ? m - 1 : m))
    const notes = play(wrong)
    notes.forEach((n) => checker.push(n))
    const done = checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    expect(done?.outcome.slips).toBe(3)
    expect(done?.outcome.issues).toHaveLength(3)
  })

  it('reset abandons the run in progress', () => {
    const checker = createStepChecker(E, 1)
    const notes = play(expectedRun(E, 1, 4).map((e) => e.midi))
    notes.slice(0, 8).forEach((n) => checker.push(n))
    checker.reset()
    expect(checker.tick(1_000_000)).toBeNull()
  })
})
