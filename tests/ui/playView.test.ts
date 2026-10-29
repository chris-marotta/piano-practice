import { describe, expect, it } from 'vitest'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import {
  DEFAULT_TOGGLES,
  DEFAULT_WINDOW,
  checkAvailable,
  chordReadout,
  effectiveMode,
  effectiveToggles,
  fittedWindow,
  guideAvailable,
  playMarks,
  reserveRowsFor,
  shiftWindow,
  showConnectHint,
  shownWindow,
  targetPitchClasses,
  type PlayMode,
  type PlayTarget,
  type PlayToggles,
} from '../../src/ui/screens/play/playView'
import { createGuide, type GuideNext, type GuideState } from '../../src/play/guide'
import { isBlack, whiteKeys } from '../../src/ui/components/keyboardLayout'
import { CHORD_TYPES, maxInversion } from '../../src/theory/chords'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../../src/theory/scales'

const G_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'G', form: 'major' }, octaves: 1 }
const NONE: PlayTarget = { kind: 'none' }
const C_CHORD: PlayTarget = { kind: 'chord', root: 'C', type: 'M', inversion: 0 }

function marks(opts: {
  mode?: PlayMode
  target?: PlayTarget
  toggles?: Partial<PlayToggles>
  held?: number[]
  next?: GuideNext
  flash?: number | null
}): KeyMark[] {
  return playMarks({
    mode: opts.mode ?? 'free',
    target: opts.target ?? G_MAJOR,
    toggles: { ...DEFAULT_TOGGLES, ...opts.toggles },
    held: new Set(opts.held ?? []),
    next: opts.next ?? null,
    window: DEFAULT_WINDOW,
    flash: opts.flash ?? null,
  })
}

const at = (ms: KeyMark[], midi: number) => ms.filter((m) => m.midi === midi)
const stateAt = (ms: KeyMark[], midi: number) => at(ms, midi).find((m) => m.state && m.state !== 'target')?.state

describe('playMarks: priority (spec §4.3)', () => {
  it('pressed + in target is good, pressed + not in target is bad (by pitch class)', () => {
    const ms = marks({ held: [66, 65] })
    expect(stateAt(ms, 66)).toBe('good')
    expect(stateAt(ms, 65)).toBe('bad')
  })
  it('any octave of a scale note counts as in target', () => {
    expect(stateAt(marks({ held: [42] }), 42)).toBe('good') // F#2
  })
  it('pressed with no target is the neutral pressed fill', () => {
    expect(stateAt(marks({ target: NONE, held: [65] }), 65)).toBe('pressed')
  })
  it('with right/wrong colours off, presses are neutral', () => {
    const ms = marks({ held: [66, 65], toggles: { colours: false } })
    expect(stateAt(ms, 66)).toBe('pressed')
    expect(stateAt(ms, 65)).toBe('pressed')
  })
  it('Check shows only the neutral pressed fill', () => {
    const ms = marks({ mode: 'check', held: [66, 65] })
    expect(stateAt(ms, 66)).toBe('pressed')
    expect(stateAt(ms, 65)).toBe('pressed')
  })
  it('a pressed key never carries two states', () => {
    const ms = marks({ held: [67], mode: 'guided', next: { rh: { midi: 67, finger: 1 } } })
    expect(at(ms, 67).filter((m) => m.state && m.state !== 'target')).toHaveLength(1)
  })
})

describe('playMarks: guided next note', () => {
  it('marks the next RH note with its hand colour and finger', () => {
    const ms = marks({ mode: 'guided', next: { rh: { midi: 67, finger: 1 } } })
    expect(at(ms, 67).find((m) => m.state === undefined)).toMatchObject({ hand: 'rh', finger: 1 })
  })
  it('marks both hands in Together', () => {
    const ms = marks({ mode: 'guided', next: { rh: { midi: 67, finger: 1 }, lh: { midi: 55, finger: 5 } } })
    expect(at(ms, 55).find((m) => m.state === undefined)).toMatchObject({ hand: 'lh', finger: 5 })
  })
  it('hides the finger number when finger numbers are off, keeping the hand colour', () => {
    const ms = marks({ mode: 'guided', next: { rh: { midi: 67, finger: 1 } }, toggles: { fingers: false } })
    const m = at(ms, 67).find((x) => x.state === undefined)
    expect(m?.hand).toBe('rh')
    expect(m?.finger).toBeUndefined()
  })
  it('a guided chord step marks the voicing at octave 4 with RH fingers', () => {
    const next: GuideNext = { chord: { pcs: [4, 7, 0], bassPc: 4, inversion: 1 } }
    const ms = marks({ mode: 'guided', target: C_CHORD, next })
    const guided = ms.filter((m) => m.state === undefined)
    expect(guided.map((m) => [m.midi, m.finger])).toEqual([
      [64, 1],
      [67, 2],
      [72, 5],
    ])
  })
  it('P14: an A major 2nd-inversion step stays on the default keyboard (stepped down an octave)', () => {
    const next: GuideNext = { chord: { pcs: [4, 9, 1], bassPc: 4, inversion: 2 } }
    const ms = marks({ mode: 'guided', target: { kind: 'chord', root: 'A', type: 'M', inversion: 0 }, next })
    const guided = ms.filter((m) => m.state === undefined)
    expect(guided.map((m) => m.midi)).toEqual([64, 69, 73]) // E4 A4 C♯5, not E5 A5 C♯6 (85 > 84)
    for (const m of guided) expect(m.midi).toBeGreaterThanOrEqual(DEFAULT_WINDOW.low)
  })
  it('P14: every root x chord type x inversion step fits the default keyboard', () => {
    const roots = [...new Set([...MAJOR_ROOTS, ...MINOR_ROOTS])]
    const off: string[] = []
    for (const root of roots)
      for (const { id } of CHORD_TYPES)
        for (let inv = 0; inv <= maxInversion(id); inv++) {
          const next: GuideNext = { chord: { pcs: [], bassPc: 0, inversion: inv } }
          const ms = marks({ mode: 'guided', target: { kind: 'chord', root, type: id, inversion: 0 }, next })
          const guided = ms.filter((m) => m.state === undefined)
          expect(guided.length).toBeGreaterThan(0)
          if (guided.some((m) => m.midi < DEFAULT_WINDOW.low || m.midi > DEFAULT_WINDOW.high)) off.push(`${root}${id}/${inv}`)
        }
    expect(off).toEqual([])
  })
  it('P14: a guided chord step follows a window shifted up by the octave buttons', () => {
    const next: GuideNext = { chord: { pcs: [0, 4, 7], bassPc: 0, inversion: 0 } }
    const w = { low: 72, high: 120 }
    const ms = playMarks({ mode: 'guided', target: C_CHORD, toggles: DEFAULT_TOGGLES, held: new Set(), next, window: w })
    const guided = ms.filter((m) => m.state === undefined)
    expect(guided.every((m) => m.midi >= w.low && m.midi <= w.high)).toBe(true)
  })
  it('the wrong-note flash shows bad, even on a key that is in the scale', () => {
    // A held while G was expected: in G major, but the guide calls it a slip.
    const ms = marks({ mode: 'guided', held: [69], flash: 69 })
    expect(stateAt(ms, 69)).toBe('bad')
  })
  it('the flash outlives the key press', () => {
    expect(stateAt(marks({ mode: 'guided', flash: 61 }), 61)).toBe('bad')
  })
  it('no flash when right/wrong colours are off', () => {
    expect(stateAt(marks({ mode: 'guided', flash: 61, toggles: { colours: false } }), 61)).toBeUndefined()
  })
})

describe('playMarks: target highlight', () => {
  const outlined = (ms: KeyMark[]) => ms.filter((m) => m.state === 'target').map((m) => m.midi)
  it('outlines every target note in the window when highlight is on', () => {
    const o = outlined(marks({}))
    expect(o).toContain(67)
    expect(o).toContain(42)
    expect(o).not.toContain(65)
    expect(o.every((m) => m >= DEFAULT_WINDOW.low && m <= DEFAULT_WINDOW.high)).toBe(true)
    expect(o).toHaveLength(29) // 7 pitch classes over C2..C6: 4 octaves x 7 + C6
  })
  it('is absent when highlight is off', () => {
    expect(outlined(marks({ toggles: { highlight: false } }))).toEqual([])
  })
  it('is absent in Check even with highlight on', () => {
    expect(outlined(marks({ mode: 'check' }))).toEqual([])
  })
  it('is absent with no target', () => {
    expect(outlined(marks({ target: NONE }))).toEqual([])
  })
})

describe('effectiveToggles', () => {
  it('Check forces highlight, colours and finger numbers off', () => {
    expect(effectiveToggles('check', DEFAULT_TOGGLES)).toEqual({ highlight: false, colours: false, fingers: false, drone: false })
    expect(effectiveToggles('check', { ...DEFAULT_TOGGLES, drone: true }).drone).toBe(true)
  })
  it('Free and Guided pass the toggles through', () => {
    expect(effectiveToggles('free', DEFAULT_TOGGLES)).toEqual(DEFAULT_TOGGLES)
    expect(effectiveToggles('guided', DEFAULT_TOGGLES)).toEqual(DEFAULT_TOGGLES)
  })
  it('defaults: highlight, colours and fingers on, drone off', () => {
    expect(DEFAULT_TOGGLES).toEqual({ highlight: true, colours: true, fingers: true, drone: false })
  })
})

describe('targetPitchClasses', () => {
  it('a major scale has its 7 pitch classes', () => {
    expect([...targetPitchClasses(G_MAJOR)].sort((a, b) => a - b)).toEqual([0, 2, 4, 6, 7, 9, 11])
  })
  it('melodic minor counts ascending and descending: A melodic includes F, F♯, G, G♯', () => {
    const pcs = targetPitchClasses({ kind: 'scale', ref: { root: 'A', form: 'melodic' }, octaves: 1 })
    for (const pc of [5, 6, 7, 8]) expect(pcs.has(pc)).toBe(true)
    expect(pcs.size).toBe(9)
  })
  it('a chord has its own pitch classes', () => {
    expect([...targetPitchClasses(C_CHORD)].sort((a, b) => a - b)).toEqual([0, 4, 7])
  })
  it('nothing is empty', () => {
    expect(targetPitchClasses(NONE).size).toBe(0)
  })
})

describe('keyboard window', () => {
  it('defaults to the Roli 49 keys, C2..C6', () => {
    expect(DEFAULT_WINDOW).toEqual({ low: 36, high: 84 })
  })
  it('shifts up by whole octaves to include a high note', () => {
    expect(shiftWindow(DEFAULT_WINDOW, 90)).toEqual({ low: 48, high: 96 })
    expect(shiftWindow(DEFAULT_WINDOW, 110)).toEqual({ low: 72, high: 120 })
  })
  it('shifts down for a low note', () => {
    expect(shiftWindow(DEFAULT_WINDOW, 30)).toEqual({ low: 24, high: 72 })
  })
  it('stays put for a note inside', () => {
    const w = shiftWindow(DEFAULT_WINDOW, 84)
    expect(w).toEqual(DEFAULT_WINDOW)
  })
})

describe('fittedWindow (keyboard zoomed to the run)', () => {
  type Form = 'major' | 'natural' | 'harmonic' | 'melodic'
  const scale = (root: string, octaves: 1 | 2 = 1, form: Form = 'major'): PlayTarget => ({
    kind: 'scale',
    ref: { root, form },
    octaves,
  })
  const whites = (w: { low: number; high: number }) => whiteKeys(w.low, w.high).length

  it('nothing picked: the Roli 49 keys', () => {
    expect(fittedWindow(NONE, 'rh')).toEqual(DEFAULT_WINDOW)
  })
  it('C major RH, 1 octave: C4..C5 + 2 white keys each side, widened to 15 white keys (bias up): G3..G5', () => {
    const w = fittedWindow(scale('C'), 'rh')
    expect(w).toEqual({ low: 55, high: 79 })
    expect(whites(w)).toBe(15)
  })
  it('C major RH, 2 octaves: C4..C6 + 2 each side (19 white keys, no widening): A3..E6', () => {
    const w = fittedWindow(scale('C', 2), 'rh')
    expect(w).toEqual({ low: 57, high: 88 })
    expect(whites(w)).toBe(19)
  })
  it('LH only starts at octave 3: G2..G4', () => {
    expect(fittedWindow(scale('C'), 'lh')).toEqual({ low: 43, high: 67 })
  })
  it('Together spans the LH run at octave 3 through the RH top at octave 4: A2..E5', () => {
    expect(fittedWindow(scale('C'), 'together')).toEqual({ low: 45, high: 76 })
  })
  it('a black-key tonic: F♯ major margins from the nearest white keys, widened evenly to C4..C6', () => {
    expect(fittedWindow(scale('F#'), 'rh')).toEqual({ low: 60, high: 84 })
  })
  it('a chord spans every inversion at octave 4 (C: C4..E5), +2 each side, odd remainder up: A3..A5', () => {
    const w = fittedWindow(C_CHORD, 'rh')
    expect(w).toEqual({ low: 57, high: 81 })
    expect(whites(w)).toBe(15)
  })
  it('every scale and chord: white edges and at least 15 white keys', () => {
    const roots = [...new Set([...MAJOR_ROOTS, ...MINOR_ROOTS])]
    const targets: PlayTarget[] = []
    for (const root of roots) {
      for (const form of ['major', 'natural', 'harmonic', 'melodic'] as const)
        for (const octaves of [1, 2] as const) targets.push(scale(root, octaves, form))
      for (const { id } of CHORD_TYPES) targets.push({ kind: 'chord', root, type: id, inversion: 0 })
    }
    for (const t of targets)
      for (const hand of ['rh', 'lh', 'together'] as const) {
        const w = fittedWindow(t, hand)
        expect(isBlack(w.low) || isBlack(w.high)).toBe(false)
        expect(whites(w)).toBeGreaterThanOrEqual(15)
      }
  })
  it('P14: every guided chord step lands inside the fitted window, 2 white keys clear of each edge', () => {
    const roots = [...new Set([...MAJOR_ROOTS, ...MINOR_ROOTS])]
    const tight: string[] = []
    for (const root of roots)
      for (const { id } of CHORD_TYPES) {
        const t: PlayTarget = { kind: 'chord', root, type: id, inversion: 0 }
        const w = fittedWindow(t, 'rh')
        for (let inv = 0; inv <= maxInversion(id); inv++) {
          const next: GuideNext = { chord: { pcs: [], bassPc: 0, inversion: inv } }
          const ms = playMarks({ mode: 'guided', target: t, toggles: DEFAULT_TOGGLES, held: new Set(), next, window: w })
          const midis = ms.filter((m) => m.state === undefined).map((m) => m.midi)
          const below = whiteKeys(w.low, Math.min(...midis) - 1).length
          const above = whiteKeys(Math.max(...midis) + 1, w.high).length
          if (below < 2 || above < 2) tight.push(`${root}${id}/${inv}`)
        }
      }
    expect(tight).toEqual([])
  })
})

describe('shownWindow (which window the keyboard draws)', () => {
  const C1: PlayTarget = { kind: 'scale', ref: { root: 'C', form: 'major' }, octaves: 1 }
  const fitted = { low: 55, high: 79 }
  const follow = { low: 67, high: 91 }
  const guided = (offset: number | null): GuideState => ({
    ...createGuide({ kind: 'scale', ref: { root: 'C', form: 'major' }, octaves: 1, hand: 'rh' }),
    offset,
  })
  it('Free and Check draw the followed window (fitted, moved by whole octaves on notes off screen)', () => {
    expect(shownWindow({ mode: 'free', target: C1, fitted, follow, guide: null })).toBe(follow)
    expect(shownWindow({ mode: 'check', target: C1, fitted, follow, guide: null })).toBe(follow)
  })
  it('Guided scale before the octave lock: the fitted window as is', () => {
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(null) })).toBe(fitted)
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: null })).toBe(fitted)
  })
  it('Guided scale once locked: the fitted window moved by the lock offset', () => {
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(0) })).toEqual(fitted)
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(-24) })).toEqual({ low: 31, high: 55 })
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(12) })).toEqual({ low: 67, high: 91 })
  })
  it('an offset that is not a whole octave moves by the nearest whole octave (edges stay on white keys)', () => {
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(11) })).toEqual({ low: 67, high: 91 })
    expect(shownWindow({ mode: 'guided', target: C1, fitted, follow, guide: guided(-5) })).toEqual(fitted)
  })
  it('Guided chord has no octave lock: it follows like Free (P14 marks move with it)', () => {
    expect(shownWindow({ mode: 'guided', target: C_CHORD, fitted, follow, guide: null })).toBe(follow)
  })
})

describe('chordReadout', () => {
  it('names an inversion with its slash bass: E-G-C is C/E', () => {
    expect(chordReadout(new Set([64, 67, 72]))).toBe('C/E')
  })
  it('names a root-position triad', () => {
    expect(chordReadout(new Set([60, 64, 67]))).toBe('C')
  })
  it('a single note or nothing is —', () => {
    expect(chordReadout(new Set([60]))).toBe('—')
    expect(chordReadout(new Set())).toBe('—')
  })
})

describe('mode availability', () => {
  it('Check works with scales only', () => {
    expect(checkAvailable(G_MAJOR)).toBe(true)
    expect(checkAvailable(C_CHORD)).toBe(false)
    expect(checkAvailable(NONE)).toBe(false)
  })
  it('Guided needs a target', () => {
    expect(guideAvailable(G_MAJOR)).toBe(true)
    expect(guideAvailable(C_CHORD)).toBe(true)
    expect(guideAvailable(NONE)).toBe(false)
  })
  it('an unavailable mode falls back to Free', () => {
    expect(effectiveMode('check', C_CHORD)).toBe('free')
    expect(effectiveMode('check', NONE)).toBe('free')
    expect(effectiveMode('guided', NONE)).toBe('free')
    expect(effectiveMode('check', G_MAJOR)).toBe('check')
  })
})

describe('reserveRowsFor', () => {
  it('no badge rows when nothing can show a finger', () => {
    expect(reserveRowsFor('free', G_MAJOR, 'rh')).toBe(false)
    expect(reserveRowsFor('check', G_MAJOR, 'lh')).toBe(false)
  })
  it('RH rows for RH and chords, both for LH and Together', () => {
    expect(reserveRowsFor('guided', G_MAJOR, 'rh')).toBe('rh')
    expect(reserveRowsFor('guided', C_CHORD, 'lh')).toBe('rh')
    expect(reserveRowsFor('guided', G_MAJOR, 'lh')).toBe(true)
    expect(reserveRowsFor('guided', G_MAJOR, 'together')).toBe(true)
  })
})

describe('showConnectHint', () => {
  it('shows "Connect a keyboard…" only where connecting is possible but not done', () => {
    expect(showConnectHint({ kind: 'off' })).toBe(true)
    expect(showConnectHint({ kind: 'denied' })).toBe(true)
    expect(showConnectHint({ kind: 'no-device' })).toBe(true)
    expect(showConnectHint({ kind: 'connected', name: 'Roli' })).toBe(false)
    // iPad: the chip already says keyboard input needs Chrome on a computer.
    expect(showConnectHint({ kind: 'unsupported' })).toBe(false)
  })
})
