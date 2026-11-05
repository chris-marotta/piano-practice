import { describe, expect, it } from 'vitest'
import type { KeyMark } from '../../src/ui/components/keyboardLayout'
import {
  DEFAULT_TOGGLES,
  DEFAULT_WINDOW,
  checkAvailable,
  chordReadout,
  effectiveMode,
  effectiveToggles,
  fitHand,
  fittedWindow,
  modeForPickedTarget,
  followsNotes,
  pickerSummary,
  STAFF_ROUND_QUESTIONS,
  guideAvailable,
  degreeLabel,
  playMarks,
  reserveRowsFor,
  shiftWindow,
  showConnectHint,
  shownWindow,
  targetPitchClasses,
  type PlayLabels,
  type PlayMode,
  type PlayTarget,
  type PlayToggles,
} from '../../src/ui/screens/play/playView'
import { shouldGrade } from '../../src/drill/engine'
import { STAFF_DEF } from '../../src/drill/staff'
import type { ItemState } from '../../src/srs/scheduler'
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
  labels?: PlayLabels
}): KeyMark[] {
  return playMarks({
    mode: opts.mode ?? 'free',
    target: opts.target ?? G_MAJOR,
    toggles: { ...DEFAULT_TOGGLES, ...opts.toggles },
    held: new Set(opts.held ?? []),
    next: opts.next ?? null,
    window: DEFAULT_WINDOW,
    flash: opts.flash ?? null,
    labels: opts.labels ?? 'names',
  })
}

const at = (ms: KeyMark[], midi: number) => ms.filter((m) => m.midi === midi)
const GLOWS = new Set(['target', 'played'])
const stateAt = (ms: KeyMark[], midi: number) => at(ms, midi).find((m) => m.state && !GLOWS.has(m.state))?.state

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
    expect(at(ms, 67).filter((m) => m.state && !GLOWS.has(m.state))).toHaveLength(1)
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
    const ms = playMarks({ mode: 'guided', target: C_CHORD, toggles: DEFAULT_TOGGLES, held: new Set(), next, window: w, labels: 'names' })
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

describe('playMarks: target highlight (Free)', () => {
  const outlined = (ms: KeyMark[]) => ms.filter((m) => m.state === 'target').map((m) => m.midi)
  it('glows every target note in the window when highlight is on', () => {
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

describe('playMarks: guided scale glows its own run, one leg at a time', () => {
  type Hand = 'rh' | 'lh' | 'together'
  const guideAt = (target: Extract<PlayTarget, { kind: 'scale' }>, hand: Hand, index: number, offset: number | null): GuideState => ({
    ...createGuide({ kind: 'scale', ref: target.ref, octaves: target.octaves, hand }),
    index,
    offset,
  })
  const glows = (target: Extract<PlayTarget, { kind: 'scale' }>, guide: GuideState, toggles: Partial<PlayToggles> = {}) => {
    const ms = playMarks({
      mode: 'guided',
      target,
      toggles: { ...DEFAULT_TOGGLES, ...toggles },
      labels: 'off',
      held: new Set(),
      next: null,
      window: DEFAULT_WINDOW,
      guide,
    })
    const of = (state: 'target' | 'played') =>
      ms
        .filter((m) => m.state === state)
        .map((m) => m.midi)
        .sort((a, b) => a - b)
    return { target: of('target'), played: of('played') }
  }
  const G1 = G_MAJOR as Extract<PlayTarget, { kind: 'scale' }>

  it('going up: notes before the next one dim, the rest of the way up glows; no other octave glows', () => {
    // G4 A4 B4 | next C5 | D5 E5 F#5 G5
    expect(glows(G1, guideAt(G1, 'rh', 3, 0))).toEqual({ target: [74, 76, 78, 79], played: [67, 69, 71] })
  })
  it('before the octave lock: the whole way up glows at the home octave, nothing dims', () => {
    expect(glows(G1, guideAt(G1, 'rh', 0, null))).toEqual({ target: [69, 71, 72, 74, 76, 78, 79], played: [] })
  })
  it('coming down: only the down leg shows; the top and the notes played on the way down dim, the keys below glow', () => {
    // run: ... G5 (7) F#5 E5 | next D5 (10) | C5 B4 A4 G4
    expect(glows(G1, guideAt(G1, 'rh', 10, 0))).toEqual({ target: [67, 69, 71, 72], played: [76, 78, 79] })
  })
  it('follows the locked octave', () => {
    expect(glows(G1, guideAt(G1, 'rh', 3, -12))).toEqual({ target: [62, 64, 66, 67], played: [55, 57, 59] })
  })
  it('a finished run: the whole down leg is dim', () => {
    expect(glows(G1, guideAt(G1, 'rh', 15, 0))).toEqual({ target: [], played: [67, 69, 71, 72, 74, 76, 78, 79] })
  })
  it('Together: both hands, an octave apart', () => {
    const g = glows(G1, guideAt(G1, 'together', 2, 0))
    expect(g.played).toEqual([55, 57, 67, 69])
    expect(g.target).toEqual([60, 62, 64, 66, 67, 72, 74, 76, 78, 79])
  })
  it('melodic minor: the way down glows the natural-minor notes, not F♯ / G♯', () => {
    const A_MEL: Extract<PlayTarget, { kind: 'scale' }> = { kind: 'scale', ref: { root: 'A', form: 'melodic' }, octaves: 1 }
    // down: A5 (7) G5 | next F5 (9) | E5 D5 C5 B4 A4
    expect(glows(A_MEL, guideAt(A_MEL, 'rh', 9, 0))).toEqual({ target: [69, 71, 72, 74, 76], played: [79, 81] })
  })
  it('two octaves: the leg turns at index 14', () => {
    const G2: Extract<PlayTarget, { kind: 'scale' }> = { ...G1, octaves: 2 }
    const up = glows(G2, guideAt(G2, 'rh', 14, 0))
    expect(up.played).toHaveLength(14)
    expect(up.target).toEqual([])
    const down = glows(G2, guideAt(G2, 'rh', 15, 0))
    expect(down.played).toEqual([91])
    expect(down.target).toHaveLength(13)
  })
  it('highlight off hides both the glow and the dim', () => {
    expect(glows(G1, guideAt(G1, 'rh', 3, 0), { highlight: false })).toEqual({ target: [], played: [] })
  })
  it('a guided chord keeps the pitch-class glow and never dims', () => {
    const next: GuideNext = { chord: { pcs: [0, 4, 7], bassPc: 0, inversion: 0 } }
    const ms = playMarks({
      mode: 'guided',
      target: C_CHORD,
      toggles: DEFAULT_TOGGLES,
      labels: 'off',
      held: new Set(),
      next,
      window: DEFAULT_WINDOW,
      guide: createGuide({ kind: 'chord', root: 'C', type: 'M' }),
    })
    expect(ms.filter((m) => m.state === 'played')).toEqual([])
    expect(ms.filter((m) => m.state === 'target').map((m) => m.midi)).toContain(36)
  })
  it('Free keeps glowing every scale pitch class in the window', () => {
    expect(marks({}).filter((m) => m.state === 'target')).toHaveLength(29)
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
  it('P14: with the fitted window moved an octave up or down (followed notes), every guided chord step stays inside', () => {
    const roots = [...new Set([...MAJOR_ROOTS, ...MINOR_ROOTS])]
    const off: string[] = []
    for (const root of roots)
      for (const { id } of CHORD_TYPES) {
        const t: PlayTarget = { kind: 'chord', root, type: id, inversion: 0 }
        const f = fittedWindow(t, 'rh')
        for (const shift of [12, -12]) {
          const w = { low: f.low + shift, high: f.high + shift }
          for (let inv = 0; inv <= maxInversion(id); inv++) {
            const next: GuideNext = { chord: { pcs: [], bassPc: 0, inversion: inv } }
            const ms = playMarks({ mode: 'guided', target: t, toggles: DEFAULT_TOGGLES, held: new Set(), next, window: w, labels: 'off' })
            const midis = ms.filter((m) => m.state === undefined).map((m) => m.midi)
            expect(midis.length).toBeGreaterThan(0)
            if (midis.some((m) => m < w.low || m > w.high)) off.push(`${root}${id}/${inv}${shift}`)
          }
        }
      }
    expect(off).toEqual([])
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
          const ms = playMarks({ mode: 'guided', target: t, toggles: DEFAULT_TOGGLES, held: new Set(), next, window: w, labels: 'off' })
          const midis = ms.filter((m) => m.state === undefined).map((m) => m.midi)
          const below = whiteKeys(w.low, Math.min(...midis) - 1).length
          const above = whiteKeys(Math.max(...midis) + 1, w.high).length
          if (below < 2 || above < 2) tight.push(`${root}${id}/${inv}`)
        }
      }
    expect(tight).toEqual([])
  })
})

describe('fitHand (whose run the keyboard is zoomed to)', () => {
  it('Guided scale: the chosen hand', () => {
    expect(fitHand('guided', G_MAJOR, 'rh')).toBe('rh')
    expect(fitHand('guided', G_MAJOR, 'lh')).toBe('lh')
    expect(fitHand('guided', G_MAJOR, 'together')).toBe('together')
  })
  it('Check and Free with a scale: both hands (LH octave 3 through RH top), whatever the hand control says', () => {
    for (const h of ['rh', 'lh', 'together'] as const) {
      expect(fitHand('check', G_MAJOR, h)).toBe('together')
      expect(fitHand('free', G_MAJOR, h)).toBe('together')
    }
  })
  it('chords and nothing: RH (unchanged)', () => {
    expect(fitHand('free', C_CHORD, 'together')).toBe('rh')
    expect(fitHand('guided', C_CHORD, 'lh')).toBe('rh')
    expect(fitHand('free', NONE, 'lh')).toBe('rh')
  })
  it('one-octave Check / Free windows: C major A2..E5 (19 white keys), F♯ major E3..A5 (18)', () => {
    const c = fittedWindow({ kind: 'scale', ref: { root: 'C', form: 'major' }, octaves: 1 }, fitHand('check', G_MAJOR, 'rh'))
    expect(c).toEqual({ low: 45, high: 76 })
    expect(whiteKeys(c.low, c.high)).toHaveLength(19)
    const fs = fittedWindow({ kind: 'scale', ref: { root: 'F#', form: 'major' }, octaves: 1 }, 'together')
    expect(fs).toEqual({ low: 52, high: 81 })
    expect(whiteKeys(fs.low, fs.high)).toHaveLength(18)
  })
})

describe('followsNotes (whole-octave following on notes off screen)', () => {
  it('everywhere but a guided scale, which follows its octave lock instead', () => {
    expect(followsNotes('guided', G_MAJOR)).toBe(false)
    expect(followsNotes('guided', C_CHORD)).toBe(true)
    expect(followsNotes('free', G_MAJOR)).toBe(true)
    expect(followsNotes('check', G_MAJOR)).toBe(true)
    expect(followsNotes('free', NONE)).toBe(true)
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
  it('Keys works with any target, or none', () => {
    expect(effectiveMode('keys', C_CHORD)).toBe('keys')
    expect(effectiveMode('keys', NONE)).toBe('keys')
    expect(effectiveMode('keys', G_MAJOR)).toBe('keys')
  })
})

describe('modeForPickedTarget', () => {
  it('Keys would hide a picked scale, so it opens Free', () => {
    expect(modeForPickedTarget('keys')).toBe('free')
  })
  it('the other modes are kept', () => {
    expect(modeForPickedTarget('free')).toBe('free')
    expect(modeForPickedTarget('guided')).toBe('guided')
    expect(modeForPickedTarget('check')).toBe('check')
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

describe('degreeLabel', () => {
  const D_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'D', form: 'major' }, octaves: 1 }
  const A_MELODIC: PlayTarget = { kind: 'scale', ref: { root: 'A', form: 'melodic' }, octaves: 1 }
  const G7 = (inversion: number): PlayTarget => ({ kind: 'chord', root: 'G', type: '7', inversion })

  it('numbers a scale by position, the tonic as 1', () => {
    // D E F# G A B C#
    const pcs = [2, 4, 6, 7, 9, 11, 1]
    expect(pcs.map((pc) => degreeLabel(D_MAJOR, pc))).toEqual(['1', '2', '3', '4', '5', '6', '7'])
  })
  it('melodic minor: the raised and the natural 6th and 7th share a position number', () => {
    expect([5, 6].map((pc) => degreeLabel(A_MELODIC, pc))).toEqual(['6', '6']) // F, F#
    expect([7, 8].map((pc) => degreeLabel(A_MELODIC, pc))).toEqual(['7', '7']) // G, G#
  })
  it('chords: 1 3 5 and 7 on sevenths, in every inversion', () => {
    for (let inv = 0; inv <= 3; inv++) {
      expect([7, 11, 2, 5].map((pc) => degreeLabel(G7(inv), pc))).toEqual(['1', '3', '5', '7'])
    }
  })
  it('chords that are not 1 3 5 keep their real numbers (sus2, sus4, 6, add9)', () => {
    const c = (type: 'sus2' | 'sus4' | '6' | 'add9'): PlayTarget => ({ kind: 'chord', root: 'C', type, inversion: 0 })
    expect([0, 2, 7].map((pc) => degreeLabel(c('sus2'), pc))).toEqual(['1', '2', '5'])
    expect([0, 5, 7].map((pc) => degreeLabel(c('sus4'), pc))).toEqual(['1', '4', '5'])
    expect([0, 4, 7, 9].map((pc) => degreeLabel(c('6'), pc))).toEqual(['1', '3', '5', '6'])
    expect([0, 4, 7, 2].map((pc) => degreeLabel(c('add9'), pc))).toEqual(['1', '3', '5', '9'])
  })
  it('null outside the target, and with no target', () => {
    expect(degreeLabel(D_MAJOR, 0)).toBeNull() // C natural
    expect(degreeLabel(G7(0), 0)).toBeNull()
    expect(degreeLabel(NONE, 2)).toBeNull()
  })
})

describe('playMarks: labels and root dots', () => {
  const D_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'D', form: 'major' }, octaves: 1 }
  const labelAt = (ms: KeyMark[], midi: number) => at(ms, midi).find((m) => m.label !== undefined)?.label
  const rootAt = (ms: KeyMark[], midi: number) => at(ms, midi).some((m) => m.root)
  // D4 62 .. D5 74
  const DEGREES: [number, string][] = [[62, '1'], [64, '2'], [66, '3'], [67, '4'], [69, '5'], [71, '6'], [73, '7'], [74, '1']]

  it('degrees: D major, with the top tonic as 1', () => {
    const ms = marks({ target: D_MAJOR, labels: 'degrees' })
    for (const [midi, deg] of DEGREES) expect(labelAt(ms, midi), `midi ${midi}`).toBe(deg)
  })
  it('names: note names on target keys, spelled for the key', () => {
    const ms = marks({ target: D_MAJOR, labels: 'names' })
    expect(labelAt(ms, 66)).toBe('F♯')
    expect(labelAt(ms, 73)).toBe('C♯')
    expect(labelAt(ms, 62)).toBe('D')
    expect(labelAt(ms, 63)).toBeUndefined() // D# is not in D major
    const flats = marks({ target: { kind: 'scale', ref: { root: 'Eb', form: 'major' }, octaves: 1 } })
    expect(labelAt(flats, 70)).toBe('B♭')
  })
  it('chords: degrees 1 3 5 7 (G7), names by chord spelling', () => {
    const g7: PlayTarget = { kind: 'chord', root: 'G', type: '7', inversion: 1 }
    const d = marks({ target: g7, labels: 'degrees' })
    expect([67, 71, 74, 65].map((m) => labelAt(d, m))).toEqual(['1', '3', '5', '7'])
    const n = marks({ target: g7, labels: 'names' })
    expect([67, 71, 74, 65].map((m) => labelAt(n, m))).toEqual(['G', 'B', 'D', 'F'])
  })
  it('off: no mark has a label, root marks are still set', () => {
    for (const mode of ['free', 'guided', 'check'] as const) {
      const ms = marks({ mode, target: D_MAJOR, labels: 'off', held: [62, 65] })
      expect(ms.filter((m) => m.label !== undefined), mode).toEqual([])
      expect(rootAt(ms, 62), mode).toBe(true)
      expect(rootAt(ms, 74), mode).toBe(true)
    }
  })
  it('a wrong pressed key has no label in any setting; a flashed wrong key neither', () => {
    for (const labels of ['off', 'names', 'degrees'] as const) {
      const ms = marks({ target: D_MAJOR, labels, held: [65] }) // F natural
      expect(stateAt(ms, 65)).toBe('bad')
      expect(labelAt(ms, 65), labels).toBeUndefined()
      const flash = marks({ mode: 'guided', target: D_MAJOR, labels, flash: 64, toggles: { highlight: false } })
      expect(labelAt(flash, 64), labels).toBeUndefined()
    }
  })
  it('a flashed key inside the glow has no label either (highlight on), but keeps the root dot', () => {
    const G1 = G_MAJOR as Extract<PlayTarget, { kind: 'scale' }>
    // Guided G major up, next C5: G4 A4 B4 are dimmed (played), D5 E5 F#5 G5 glow (target).
    const guide: GuideState = { ...createGuide({ kind: 'scale', ref: G1.ref, octaves: 1, hand: 'rh' }), index: 3, offset: 0 }
    for (const labels of ['names', 'degrees'] as const) {
      for (const flash of [69, 76, 79]) {
        // A4 played-glow, E5 target-glow, G5 target-glow and the scale's root
        const ms = playMarks({
          mode: 'guided', target: G1, toggles: DEFAULT_TOGGLES, labels, held: new Set(), next: null, window: DEFAULT_WINDOW, flash, guide,
        })
        expect(stateAt(ms, flash), `${labels} ${flash}`).toBe('bad')
        expect(at(ms, flash).filter((m) => m.label !== undefined), `${labels} ${flash}`).toEqual([])
      }
      // The neighbours keep theirs.
      const ms = playMarks({ mode: 'guided', target: G1, toggles: DEFAULT_TOGGLES, labels, held: new Set(), next: null, window: DEFAULT_WINDOW, flash: 76, guide })
      expect(labelAt(ms, 74)).toBeDefined()
      expect(labelAt(ms, 78)).toBeDefined()
      // The root dot stays on a flashed root key.
      const root = playMarks({ mode: 'guided', target: G1, toggles: DEFAULT_TOGGLES, labels, held: new Set(), next: null, window: DEFAULT_WINDOW, flash: 79, guide })
      expect(rootAt(root, 79)).toBe(true)
    }
  })
  it('the same for a guided chord: a chord tone flashed in the wrong place has no label', () => {
    const next: GuideNext = { chord: { pcs: [0, 4, 7], bassPc: 0, inversion: 0 } }
    for (const labels of ['names', 'degrees'] as const) {
      for (const flash of [52, 64, 67, 72]) {
        const ms = playMarks({
          mode: 'guided', target: C_CHORD, toggles: DEFAULT_TOGGLES, labels, held: new Set(), next, window: DEFAULT_WINDOW, flash,
          guide: createGuide({ kind: 'chord', root: 'C', type: 'M' }),
        })
        expect(stateAt(ms, flash), `${labels} ${flash}`).toBe('bad')
        expect(at(ms, flash).filter((m) => m.label !== undefined), `${labels} ${flash}`).toEqual([])
      }
    }
  })
  it('keys outside the target never get a label, in any setting', () => {
    for (const labels of ['names', 'degrees'] as const) {
      const ms = marks({ target: D_MAJOR, labels })
      for (const m of ms) if (!targetPitchClasses(D_MAJOR).has(m.midi % 12)) expect(m.label).toBeUndefined()
    }
  })
  it('the root dot is on every root key in the window, with the highlight off too', () => {
    const ms = marks({ target: D_MAJOR, toggles: { highlight: false }, labels: 'degrees' })
    const roots = ms.filter((m) => m.root).map((m) => m.midi)
    expect(new Set(roots)).toEqual(new Set([38, 50, 62, 74]))
    expect(labelAt(ms, 62)).toBe('1')
    expect(labelAt(ms, 64)).toBeUndefined() // highlight off: only the root shows its label
    // The dot carrier adds no fill or glow of its own.
    expect(at(ms, 62).every((m) => m.state === undefined && m.hand === 'none')).toBe(true)
  })
  it('a chord root gets the dot; no target means no dot', () => {
    const ms = marks({ target: C_CHORD, labels: 'names' })
    expect(new Set(ms.filter((m) => m.root).map((m) => m.midi))).toEqual(new Set([36, 48, 60, 72, 84]))
    expect(marks({ target: NONE }).some((m) => m.root || m.label !== undefined)).toBe(false)
  })
  it('Check shows no more than the dot: the root key only, even with labels on', () => {
    const ms = marks({ mode: 'check', target: D_MAJOR, labels: 'degrees', held: [64, 65] })
    expect(ms.filter((m) => m.label !== undefined).every((m) => m.root)).toBe(true)
    expect(labelAt(ms, 64)).toBeUndefined()
    expect(stateAt(ms, 64)).toBe('pressed')
  })
  it('a pressed key that is right takes the label', () => {
    const ms = marks({ mode: 'guided', target: D_MAJOR, labels: 'degrees', held: [64] })
    expect(stateAt(ms, 64)).toBe('good')
    expect(labelAt(ms, 64)).toBe('2')
  })
})

describe('pickerSummary: the one line the picker collapses to', () => {
  const D_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'D', form: 'major' }, octaves: 1 }
  const A_HARMONIC: PlayTarget = { kind: 'scale', ref: { root: 'A', form: 'harmonic' }, octaves: 2 }

  it('a guided scale names its hand', () => {
    expect(pickerSummary(D_MAJOR, 1, 'guided', 'rh')).toBe('D major · 1 oct · Guided RH')
    expect(pickerSummary(D_MAJOR, 1, 'guided', 'lh')).toBe('D major · 1 oct · Guided LH')
  })

  it('a checked scale names its hand', () => {
    expect(pickerSummary(A_HARMONIC, 2, 'check', 'together')).toBe('A harmonic minor · 2 oct · Check Together')
  })

  it('Free has no hand', () => {
    expect(pickerSummary(D_MAJOR, 1, 'free', 'rh')).toBe('D major · 1 oct · Free')
  })

  it('the octaves argument is the one shown', () => {
    expect(pickerSummary(D_MAJOR, 2, 'free', 'rh')).toBe('D major · 2 oct · Free')
  })

  it('a chord has no octaves and no hand', () => {
    expect(pickerSummary(C_CHORD, 1, 'free', 'rh')).toBe('C major chord · Free')
    expect(pickerSummary(C_CHORD, 1, 'guided', 'rh')).toBe('C major chord · Guided')
  })

  it('a chord names its inversion, as the Library does', () => {
    expect(pickerSummary({ ...C_CHORD, inversion: 1 }, 1, 'guided', 'rh')).toBe('C major chord, 1st inversion · Guided')
    expect(pickerSummary({ ...C_CHORD, inversion: 2 }, 1, 'free', 'rh')).toBe('C major chord, 2nd inversion · Free')
  })

  it('Keys names the drill level, whatever the target', () => {
    expect(pickerSummary(D_MAJOR, 1, 'keys', 'rh', 2)).toBe('Keys · Level 2')
    expect(pickerSummary(C_CHORD, 1, 'keys', 'rh', 4)).toBe('Keys · Level 4')
    expect(pickerSummary(NONE, 1, 'keys', 'rh', 1)).toBe('Keys · Level 1')
  })

  it('spells accidentals with the display glyphs', () => {
    const t: PlayTarget = { kind: 'scale', ref: { root: 'Bb', form: 'major' }, octaves: 1 }
    expect(pickerSummary(t, 1, 'free', 'rh')).toBe('B♭ major · 1 oct · Free')
  })

  it('nothing picked is just free play', () => {
    expect(pickerSummary(NONE, 1, 'free', 'rh')).toBe('Free play')
  })
})

describe('Staff mode', () => {
  it('is always available, like Keys, and leaves the target alone', () => {
    expect(effectiveMode('staff', NONE)).toBe('staff')
    expect(effectiveMode('staff', C_CHORD)).toBe('staff')
    expect(effectiveMode('staff', G_MAJOR)).toBe('staff')
  })

  it('a picked target from the circle page sends Staff to Free, as Keys', () => {
    expect(modeForPickedTarget('staff')).toBe('free')
  })

  it('the summary names the mode: "Staff · Level 3", never "Keys"', () => {
    expect(pickerSummary(NONE, 1, 'staff', 'rh', 3)).toBe('Staff · Level 3')
    expect(pickerSummary(G_MAJOR, 1, 'staff', 'rh', 1)).toContain('Staff')
    expect(pickerSummary(G_MAJOR, 1, 'staff', 'rh', 1)).not.toContain('Keys')
  })

  it('a round is 6 questions', () => {
    expect(STAFF_ROUND_QUESTIONS).toBe(6)
  })

  it('play grading: a right answer on a not-due item is not graded, a wrong one is', () => {
    const q = STAFF_DEF.buildQuestion('staff:treble:C4', 'tap', () => 0)
    const notDue: ItemState = { id: q.itemId, introduced: true, box: 3, support: 0, levelStreak: 0, due: '2026-11-10', history: [] }
    expect(shouldGrade(q, notDue, '2026-11-05', 'play', true)).toBe(false)
    expect(shouldGrade(q, notDue, '2026-11-05', 'play', false)).toBe(true)
    expect(shouldGrade(q, { ...notDue, due: '2026-11-05' }, '2026-11-05', 'play', true)).toBe(true)
  })
})
