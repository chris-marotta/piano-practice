import { describe, expect, it } from 'vitest'
import { expectedRun } from '../../src/play/sequence'
import {
  REP_KINDS,
  chordMatched,
  createStepChecker,
  currentTile,
  emptyTiles,
  fillTile,
  untick,
  toggleTile,
  wrongShapeText,
  type RepKind,
  type StepRun,
} from '../../src/ui/screens/steps/autoCheck'
import type { RunOutcome } from '../../src/ui/screens/play/playRun'

const f = false
const t = true

describe('REP_KINDS', () => {
  it('matches the six v1 tiles: RH ×2, LH ×2, Together ×2', () => {
    expect(REP_KINDS).toEqual(['rh', 'rh', 'lh', 'lh', 'together', 'together'])
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

describe('currentTile', () => {
  it('empty tiles, nothing picked → the first tile', () => {
    expect(currentTile(emptyTiles(), null)).toBe(0)
  })

  it('a picked empty tile is the current one', () => {
    expect(currentTile(emptyTiles(), 4)).toBe(4)
  })

  it('a picked tile that is filled falls back to the first empty tile', () => {
    const tiles = toggleTile(toggleTile(emptyTiles(), 0), 1)
    expect(currentTile(tiles, 1)).toBe(2)
    expect(currentTile(tiles, null)).toBe(2)
  })

  it('all filled → null', () => {
    const full = REP_KINDS.reduce((ts, _k, i) => toggleTile(ts, i), emptyTiles())
    expect(currentTile(full, 3)).toBeNull()
    expect(currentTile(full, null)).toBeNull()
  })
})

describe('tiles', () => {
  it('fillTile ticks tile i and stores its result', () => {
    const tiles = fillTile(emptyTiles(), 2, outcome(0))
    expect(tiles.map((x) => x.ticked)).toEqual([f, f, t, f, f, f])
    expect(tiles[2]?.result?.slips).toBe(0)
    expect(tiles[0]?.result).toBeNull()
  })

  it('untick clears both the tick and the result', () => {
    const tiles = untick(fillTile(emptyTiles(), 0, outcome(0)), 0)
    expect(tiles[0]).toEqual({ ticked: false, result: null })
  })
})

describe('wrongShapeText', () => {
  it('names what was heard and what this tile wants', () => {
    expect(wrongShapeText('one', 'together')).toBe("That sounded like one hand. This one's both hands.")
    expect(wrongShapeText('both', 'rh')).toBe("That sounded like both hands. This one's the right hand.")
    expect(wrongShapeText('both', 'lh')).toBe("That sounded like both hands. This one's the left hand.")
  })
})

describe('createStepChecker', () => {
  const E = { root: 'E', form: 'major' as const }
  const G = { root: 'G', form: 'major' as const }
  const play = (notes: number[], step = 400, start = 1000) => notes.map((midi, i) => ({ midi, t: start + i * step }))
  const midis = (ref: typeof E, octave: number) => expectedRun(ref, 1, octave).map((e) => e.midi)

  /** Feed the notes, then let the silence windows pass; the run is whatever finishes first. */
  const finish = (current: () => RepKind | null, notes: { midi: number; t: number }[], ref = G) => {
    const checker = createStepChecker(ref, current)
    const pushed = notes.map((n) => checker.push(n)).filter((x): x is StepRun => x !== null)
    return pushed[0] ?? checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
  }
  const pairs = (ms: number[]) =>
    ms.flatMap((m, i) => [
      { midi: m - 12, t: 1000 + i * 400 },
      { midi: m, t: 1010 + i * 400 },
    ])

  it('a clean one-octave RH run on an rh tile fills it', () => {
    const checker = createStepChecker(E, () => 'rh')
    const notes = play(midis(E, 4))
    expect(notes.map((n) => checker.push(n)).filter((x) => x !== null)).toHaveLength(0) // the last tonic waits for a partner
    const done = checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    expect(done?.kind).toBe('filled')
    if (done?.kind !== 'filled') throw new Error('expected filled')
    expect(done.outcome).toMatchObject({ kind: 'check', slips: 0 })
    expect(done.outcome.evenness).toBeCloseTo(1)
  })

  it('the same notes an octave lower on an lh tile fill it (no octave-based hand guess)', () => {
    const done = finish(() => 'lh', play(midis(G, 3)))
    expect(done?.kind).toBe('filled')
    if (done?.kind === 'filled') expect(done.outcome.slips).toBe(0)
  })

  it('RH-octave notes on an lh tile are still filled (the offset search absorbs it)', () => {
    const done = finish(() => 'lh', play(midis(G, 4)))
    expect(done?.kind).toBe('filled')
    if (done?.kind === 'filled') expect(done.outcome.slips).toBe(0)
  })

  it('octave-paired notes on an rh tile are the wrong shape: both', () => {
    expect(finish(() => 'rh', pairs(midis(G, 4)))).toEqual({ kind: 'wrongShape', heard: 'both' })
  })

  it('octave-paired notes on a together tile fill it', () => {
    const done = finish(() => 'together', pairs(midis(G, 4)))
    expect(done?.kind).toBe('filled')
    if (done?.kind === 'filled') expect(done.outcome.slips).toBe(0)
  })

  it('a one-hand run on a together tile is the wrong shape: one', () => {
    expect(finish(() => 'together', play(midis(G, 4)))).toEqual({ kind: 'wrongShape', heard: 'one' })
  })

  it('a wrong-shape run does not consume the tile: the next clean run fills the current one', () => {
    let cur: RepKind | null = 'rh'
    const checker = createStepChecker(G, () => cur)
    const wrong = pairs(midis(G, 4))
    const w = wrong.map((n) => checker.push(n)).find((x) => x !== null) ?? checker.tick(wrong[wrong.length - 1]!.t + 200)
    expect(w?.kind).toBe('wrongShape')
    // The caller turns only 'filled' runs into fillTile, so tiles are untouched and the same tile is still current.
    const tiles0 = emptyTiles()
    expect(currentTile(tiles0, null)).toBe(0)
    const next = play(midis(G, 4), 400, 20_000)
    next.forEach((n) => checker.push(n))
    const done = checker.tick(next[next.length - 1]!.t + 200)
    expect(done?.kind).toBe('filled')
    const i = currentTile(tiles0, null)
    const after = done?.kind === 'filled' && i !== null ? fillTile(tiles0, i, done.outcome) : tiles0
    expect(after.map((x) => x.ticked)).toEqual([t, f, f, f, f, f])
  })

  it('a run with tile 3 picked fills tile 3, not tile 0', () => {
    const tiles = emptyTiles()
    const picked = 3
    const kind = REP_KINDS[currentTile(tiles, picked) ?? 0] ?? null
    expect(kind).toBe('lh')
    const done = finish(() => kind, play(midis(G, 3)))
    const i = currentTile(tiles, picked)
    expect(done?.kind === 'filled' && i !== null).toBe(true)
    if (done?.kind === 'filled' && i !== null) {
      const after = fillTile(tiles, i, done.outcome)
      expect(after.map((x) => x.ticked)).toEqual([f, f, f, t, f, f])
    }
  })

  it('all six filled: current() is null and the run is dropped', () => {
    expect(finish(() => null, play(midis(G, 4)))).toBeNull()
  })

  it('three wrong notes → 3 slips', () => {
    const checker = createStepChecker(E, () => 'rh')
    // F#4 → F4, G#4 → G4, C#5 → C5 going up
    const wrong = midis(E, 4).map((m, i) => (i === 1 || i === 2 || i === 5 ? m - 1 : m))
    const notes = play(wrong)
    notes.forEach((n) => checker.push(n))
    const done = checker.tick((notes[notes.length - 1]?.t ?? 0) + 200)
    expect(done?.kind).toBe('filled')
    if (done?.kind === 'filled') {
      expect(done.outcome.slips).toBe(3)
      expect(done.outcome.issues).toHaveLength(3)
    }
  })

  it('reset abandons the run in progress', () => {
    const checker = createStepChecker(E, () => 'rh')
    play(midis(E, 4))
      .slice(0, 8)
      .forEach((n) => checker.push(n))
    checker.reset()
    expect(checker.tick(1_000_000)).toBeNull()
  })
})
