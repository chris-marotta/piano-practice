import { describe, expect, it } from 'vitest'
import type { MidiEvent } from '../../src/midi/parse'
import { expectedRun } from '../../src/play/sequence'
import { createPlayRun, resultView, type RunOutcome } from '../../src/ui/screens/play/playRun'
import type { PlayTarget } from '../../src/ui/screens/play/playView'

const on = (midi: number, t: number): MidiEvent => ({ type: 'on', midi, velocity: 80, t })
const off = (midi: number, t: number): MidiEvent => ({ type: 'off', midi, t })

const E_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'E', form: 'major' }, octaves: 1 }
const G_MAJOR: PlayTarget = { kind: 'scale', ref: { root: 'G', form: 'major' }, octaves: 1 }
const C_CHORD: PlayTarget = { kind: 'chord', root: 'C', type: 'M', inversion: 0 }

const midis = (t: PlayTarget & { kind: 'scale' }) => expectedRun(t.ref, t.octaves, 4).map((e) => e.midi)

/** Press and release each note, `step` ms apart. Returns every outcome reported. */
function playNotes(run: ReturnType<typeof createPlayRun>, notes: number[], start = 0, step = 400): RunOutcome[] {
  const out: RunOutcome[] = []
  notes.forEach((m, i) => {
    const t = start + i * step
    const a = run?.handle(on(m, t))
    if (a?.outcome) out.push(a.outcome)
    const b = run?.handle(off(m, t + 200))
    if (b?.outcome) out.push(b.outcome)
  })
  return out
}

describe('createPlayRun', () => {
  it('Free has no run', () => {
    expect(createPlayRun('free', E_MAJOR, 'rh')).toBeNull()
  })

  it('Guided: a clean E major RH run reports a clean result once', () => {
    const run = createPlayRun('guided', E_MAJOR, 'rh')
    const outs = playNotes(run, midis(E_MAJOR as PlayTarget & { kind: 'scale' }))
    expect(outs).toHaveLength(1)
    expect(outs[0]).toMatchObject({ kind: 'guided', slips: 0, issues: [] })
    expect(outs[0]?.evenness).toBeCloseTo(1)
    expect(outs[0]?.tempo).toBe(75) // 400 ms eighths
    expect(outs[0]?.intervals).toHaveLength(14)
  })

  it('Guided: a wrong note flashes and counts as a slip', () => {
    const run = createPlayRun('guided', E_MAJOR, 'rh')
    run?.handle(on(64, 0)) // E4 locks
    const r = run?.handle(on(65, 400)) // F instead of F#
    expect(r?.flash).toBe(65)
    expect(run?.guide()?.slips).toBe(1)
  })

  it('Guided: next() follows the run', () => {
    const run = createPlayRun('guided', E_MAJOR, 'rh')
    expect(run?.next()).toEqual({ rh: { midi: 64, finger: 1 } })
    run?.handle(on(64, 0))
    expect(run?.next()).toEqual({ rh: { midi: 66, finger: 2 } })
  })

  it('Guided chord: holding each inversion steps through them', () => {
    const run = createPlayRun('guided', C_CHORD, 'rh')
    const held = (notes: number[], t: number) => {
      const outs = notes.map((m, i) => run?.handle(on(m, t + i)).outcome).filter(Boolean)
      notes.forEach((m) => run?.handle(off(m, t + 100)))
      return outs
    }
    expect(held([60, 64, 67], 0)).toEqual([])
    expect(held([64, 67, 72], 1000)).toEqual([])
    const last = held([67, 72, 76], 2000)
    expect(last).toHaveLength(1)
    expect(last[0]).toMatchObject({ kind: 'guided', slips: 0 })
  })

  it('Guided: keys already down when the run starts count (held seed)', () => {
    const held = { held: new Set([60, 64]), sounding: new Set([60, 64]), pedal: false }
    const run = createPlayRun('guided', C_CHORD, 'rh', held)
    run?.handle(on(67, 0)) // completes C E G with the two keys held from before
    expect(run?.guide()?.index).toBe(1)
  })

  it('Guided: clear() takes the held keys to restart from', () => {
    const run = createPlayRun('guided', C_CHORD, 'rh')
    run?.handle(on(60, 0))
    run?.clear({ held: new Set([64]), sounding: new Set([64]), pedal: false })
    run?.handle(on(67, 100)) // held is now {64, 67}: no C, no match
    expect(run?.guide()?.index).toBe(0)
  })

  it('Guided: a cleared run reports nothing and starts over', () => {
    const run = createPlayRun('guided', E_MAJOR, 'rh')
    const run8 = midis(E_MAJOR as PlayTarget & { kind: 'scale' })
    playNotes(run, run8.slice(0, 10))
    run?.clear()
    expect(run?.guide()?.index).toBe(0)
    // The rest of the old run no longer finishes anything.
    expect(playNotes(run, run8.slice(10), 10_000)).toEqual([])
    expect(run?.tick(100_000)).toBeNull()
  })

  it('Guided: Restart (clear) drops the octave lock, so the keyboard goes back to the fitted window', () => {
    const run = createPlayRun('guided', E_MAJOR, 'rh')
    const up = midis(E_MAJOR as PlayTarget & { kind: 'scale' }).map((m) => m + 12)
    playNotes(run, up.slice(0, 3))
    expect(run?.guide()?.offset).toBe(12)
    run?.clear()
    expect(run?.guide()).toMatchObject({ index: 0, offset: null, slips: 0, done: false })
  })

  it('Guided chord: the result has no timing (inversion gaps are not a tempo)', () => {
    const run = createPlayRun('guided', C_CHORD, 'rh')
    const outs: RunOutcome[] = []
    ;[[60, 64, 67], [64, 67, 72], [67, 72, 76]].forEach((chord, k) => {
      chord.forEach((m, i) => {
        const o = run?.handle(on(m, k * 1000 + i)).outcome
        if (o) outs.push(o)
      })
      chord.forEach((m) => run?.handle(off(m, k * 1000 + 500)))
    })
    expect(outs).toHaveLength(1)
    expect(outs[0]).toMatchObject({ evenness: null, tempo: null, intervals: [] })
    expect(resultView(outs[0] as RunOutcome).timing).toBe(false)
  })

  describe('P16: Guided restarts on a tonic after done', () => {
    const e4 = midis(E_MAJOR as PlayTarget & { kind: 'scale' })

    it('a tonic note-on after a finished run starts a fresh run with that note as its first', () => {
      const run = createPlayRun('guided', E_MAJOR, 'rh')
      expect(playNotes(run, e4)).toHaveLength(1)
      expect(run?.guide()?.done).toBe(true)
      // E3: a different octave locks the new run an octave down.
      const r = run?.handle(on(52, 20_000))
      expect(r).toEqual({ flash: null, outcome: null })
      expect(run?.guide()).toMatchObject({ done: false, index: 1, offset: -12, slips: 0 })
      expect(run?.next()).toEqual({ rh: { midi: 54, finger: 2 } })
      // The restarted run reports its own result.
      const outs = playNotes(
        run,
        e4.slice(1).map((m) => m - 12),
        20_400,
      )
      expect(outs).toHaveLength(1)
      expect(outs[0]).toMatchObject({ kind: 'guided', slips: 0 })
    })

    it('a non-tonic note after done changes nothing (no flash, still done)', () => {
      const run = createPlayRun('guided', E_MAJOR, 'rh')
      playNotes(run, e4)
      const before = run?.guide()
      expect(run?.handle(on(66, 20_000))).toEqual({ flash: null, outcome: null })
      expect(run?.guide()).toBe(before)
    })

    it('Together: the restarting tonic pairs with its octave partner to lock', () => {
      const run = createPlayRun('guided', E_MAJOR, 'together')
      e4.forEach((m, i) => {
        run?.handle(on(m - 12, i * 400))
        run?.handle(on(m, i * 400 + 10))
      })
      expect(run?.guide()?.done).toBe(true)
      run?.handle(on(52, 20_000))
      run?.handle(on(64, 20_010))
      expect(run?.guide()).toMatchObject({ done: false, index: 1, offset: 0 })
    })

    it('chord: a root note-on after done restarts at root position', () => {
      const run = createPlayRun('guided', C_CHORD, 'rh')
      ;[[60, 64, 67], [64, 67, 72], [67, 72, 76]].forEach((chord, k) => {
        chord.forEach((m, i) => run?.handle(on(m, k * 1000 + i)))
        chord.forEach((m) => run?.handle(off(m, k * 1000 + 500)))
      })
      expect(run?.guide()?.done).toBe(true)
      run?.handle(on(64, 5000)) // E: not the root, still done
      expect(run?.guide()?.done).toBe(true)
      run?.handle(off(64, 5100))
      run?.handle(on(48, 6000)) // C3 restarts
      expect(run?.guide()).toMatchObject({ done: false, index: 0, slips: 0 })
      run?.handle(on(52, 6001))
      run?.handle(on(55, 6002)) // C E G with the restarting C as the bass
      expect(run?.guide()?.index).toBe(1)
    })
  })

  it('restartsOn: the pitch class a next run starts on (scale tonic, chord root)', () => {
    const check = createPlayRun('check', E_MAJOR, 'rh')
    expect(check?.restartsOn(64)).toBe(true)
    expect(check?.restartsOn(40)).toBe(true)
    expect(check?.restartsOn(66)).toBe(false)
    const chord = createPlayRun('guided', C_CHORD, 'rh')
    expect(chord?.restartsOn(72)).toBe(true)
    expect(chord?.restartsOn(64)).toBe(false)
  })

  it('Check: G major with two wrong notes reports two issue lines', () => {
    const run = createPlayRun('check', G_MAJOR, 'rh')
    const notes = midis(G_MAJOR as PlayTarget & { kind: 'scale' })
    // G4 A B C5 D E F♯ G5 F♯ E D5 C B A G4
    notes[3] = 73 // C♯5 instead of C5 going up
    notes[10] = 75 // D♯5 instead of D5 going down
    expect(playNotes(run, notes)).toEqual([]) // the final tonic waits for a possible octave partner...
    const o = run?.tick(14 * 400 + 160) as RunOutcome // ...for PAIR_WINDOW_MS
    expect(o).not.toBeNull()
    expect(o.kind).toBe('check')
    expect(o.slips).toBe(2)
    expect(o.issues).toEqual(['Played C♯ instead of C going up', 'Played D♯ instead of D going down'])
  })

  it('Check: a run in another octave reads clean', () => {
    const run = createPlayRun('check', G_MAJOR, 'rh')
    playNotes(run, midis(G_MAJOR as PlayTarget & { kind: 'scale' }).map((m) => m - 24))
    expect(run?.tick(14 * 400 + 160)).toMatchObject({ slips: 0, issues: [] })
  })

  it('Check: a run that trails off finishes on tick after 2 s of silence', () => {
    const run = createPlayRun('check', G_MAJOR, 'rh')
    const notes = midis(G_MAJOR as PlayTarget & { kind: 'scale' }).slice(0, 8)
    expect(playNotes(run, notes)).toEqual([])
    const lastOn = 7 * 400
    expect(run?.tick(lastOn + 1000)).toBeNull()
    const o = run?.tick(lastOn + 2000)
    expect(o?.kind).toBe('check')
    expect(o?.slips).toBe(7) // the 7 notes coming down were missed
  })

  it('Check: a cleared run reports nothing', () => {
    const run = createPlayRun('check', G_MAJOR, 'rh')
    playNotes(run, midis(G_MAJOR as PlayTarget & { kind: 'scale' }).slice(0, 8))
    run?.clear()
    expect(run?.tick(100_000)).toBeNull()
  })

  it('Check is unavailable for chords', () => {
    expect(createPlayRun('check', C_CHORD, 'rh')).toBeNull()
  })
})

describe('resultView', () => {
  const base: RunOutcome = { kind: 'check', slips: 0, issues: [], evenness: 0.923, tempo: 96, intervals: [300, 320, 280, 300, 310] }
  it('a clean run', () => {
    const v = resultView(base)
    expect(v.headline).toBe('Clean run ✓')
    expect(v.clean).toBe(true)
    expect(v.evenness).toBe('92%')
    expect(v.tempo).toBe('♩ ≈ 96')
    expect(v.bars).toHaveLength(5)
    expect(Math.max(...v.bars)).toBe(1)
  })
  it('no evenness or tempo yet shows —', () => {
    const v = resultView({ ...base, evenness: null, tempo: null, intervals: [] })
    expect(v.evenness).toBe('—')
    expect(v.tempo).toBe('♩ ≈ —')
    expect(v.timing).toBe(false)
  })
  it('timing shows when either evenness or tempo is known', () => {
    expect(resultView(base).timing).toBe(true)
    expect(resultView({ ...base, evenness: null }).timing).toBe(true)
    expect(resultView({ ...base, tempo: null }).timing).toBe(true)
  })
  it('guided slips are counted, not listed', () => {
    expect(resultView({ ...base, kind: 'guided', slips: 1 }).headline).toBe('1 slip')
    expect(resultView({ ...base, kind: 'guided', slips: 3 }).headline).toBe('3 slips')
  })
  it('check issues are listed, at most 4 with a count of the rest', () => {
    const issues = ['a', 'b', 'c', 'd', 'e', 'f']
    const v = resultView({ ...base, slips: 6, issues })
    expect(v.headline).toBe('6 slips')
    expect(v.lines).toEqual(['a', 'b', 'c', 'd'])
    expect(v.more).toBe('and 2 more')
  })
})
