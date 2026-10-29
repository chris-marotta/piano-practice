import { describe, expect, it } from 'vitest'
import { analyseRun, collapsePairs, describeIssue, evenness, tempoFromOnsets } from '../../src/play/analyse'
import type { PlayedNote } from '../../src/play/analyse'
import { expectedRun } from '../../src/play/sequence'

const exp = expectedRun({ root: 'G', form: 'major' }, 1, 4)
const asPlayed = (midis: number[], step = 500): PlayedNote[] => midis.map((midi, i) => ({ midi, t: i * step }))
const cleanMidis = exp.map((e) => e.midi)
const opts = { together: false, prefer: '#' as const }

describe('analyseRun', () => {
  it('a clean run has no slips, even timing and 60 bpm', () => {
    const a = analyseRun(exp, asPlayed(cleanMidis), opts)
    expect(a).toMatchObject({ slips: 0, evenness: 1, tempo: 60, offset: 0, notes: 15 })
    expect(a.wrong).toEqual([])
    expect(a.missed).toEqual([])
    expect(a.extra).toEqual([])
  })

  it('F natural for F sharp going up is one wrong note', () => {
    const m = [...cleanMidis]
    m[6] = 77
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.slips).toBe(1)
    expect(a.wrong).toHaveLength(1)
    expect(a.wrong[0]).toMatchObject({ kind: 'wrong', index: 6, played: 77, direction: 'up' })
    expect(describeIssue(a.wrong[0]!, '#')).toBe('Played F instead of F♯ going up')
  })

  it('a skipped note going down is missed, with direction down', () => {
    const m = cleanMidis.filter((_, i) => i !== 13) // the A going down
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.missed).toHaveLength(1)
    expect(a.wrong).toHaveLength(0)
    expect(a.missed[0]!.direction).toBe('down')
    expect(a.missed[0]!.index).toBe(13)
    expect(describeIssue(a.missed[0]!, '#')).toBe('Missed A going down')
  })

  it('an inserted C sharp is one extra note', () => {
    const m = [...cleanMidis.slice(0, 4), 73, ...cleanMidis.slice(4)]
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.extra).toHaveLength(1)
    expect(a.wrong).toHaveLength(0)
    expect(a.missed).toHaveLength(0)
    expect(a.extra[0]).toMatchObject({ kind: 'extra', index: 4, played: 73, direction: 'up' })
    expect(describeIssue(a.extra[0]!, '#')).toBe('Extra C♯ going up')
  })

  it('names extra and wrong notes in flats when prefer is b', () => {
    const m = [...cleanMidis.slice(0, 4), 73, ...cleanMidis.slice(4)]
    const a = analyseRun(exp, asPlayed(m), { together: false, prefer: 'b' })
    expect(describeIssue(a.extra[0]!, 'b')).toBe('Extra D♭ going up')
  })

  it('the top note counts as going up', () => {
    const m = [...cleanMidis]
    m[7] = 80 // wrong top note
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.wrong[0]).toMatchObject({ index: 7, direction: 'up' })
  })

  it('an extra after the last expected note is down, indexed at the end', () => {
    const a = analyseRun(exp, asPlayed([...cleanMidis, 65]), opts)
    expect(a.extra).toHaveLength(1)
    expect(a.extra[0]).toMatchObject({ index: 15, played: 65, direction: 'down' })
  })

  it('mixes wrong, missed and extra in one run', () => {
    const m = [...cleanMidis]
    m[2] = 70 // wrong (B -> Bb)
    m.splice(9, 1) // miss E going down (index 9)
    m.splice(12, 0, 61) // extra C# near the end
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.wrong.map((i) => i.index)).toEqual([2])
    expect(a.missed.map((i) => i.index)).toEqual([9])
    expect(a.extra).toHaveLength(1)
    expect(a.slips).toBe(3)
  })

  it('reads a run started in another octave as clean (offset -24)', () => {
    const a = analyseRun(exp, asPlayed(cleanMidis.map((n) => n - 24)), opts)
    expect(a).toMatchObject({ slips: 0, offset: -24 })
  })

  it('prefers the offset closest to zero when costs tie', () => {
    const a = analyseRun(exp, [], opts)
    expect(a.offset).toBe(0)
    expect(a.missed).toHaveLength(15)
    expect(a.evenness).toBeNull()
    expect(a.tempo).toBeNull()
  })

  it('wrong notes are reported with their real (played) midi under an offset', () => {
    const m = cleanMidis.map((n) => n - 12)
    m[6] = 77 - 12
    const a = analyseRun(exp, asPlayed(m), opts)
    expect(a.offset).toBe(-12)
    expect(a.wrong[0]).toMatchObject({ index: 6, played: 65 })
  })

  it('reports uneven timing', () => {
    const onsets = cleanMidis.map((_, i) => (i % 2 === 0 ? i * 500 : i * 500 + 200))
    const played = cleanMidis.map((midi, i) => ({ midi, t: onsets[i]! }))
    const a = analyseRun(exp, played, opts)
    expect(a.evenness!).toBeLessThan(0.85)
  })

  it('Together: pairs an octave apart within the window count as one note', () => {
    const played: PlayedNote[] = []
    cleanMidis.forEach((midi, i) => {
      played.push({ midi: midi - 12, t: i * 500 + 20 }, { midi, t: i * 500 })
    })
    expect(collapsePairs(played)).toHaveLength(15)
    const a = analyseRun(exp, played, { together: true, prefer: '#' })
    expect(a).toMatchObject({ slips: 0, offset: 0, notes: 15, evenness: 1, tempo: 60 })
  })

  it('Together: a wrong note in the right hand is still caught', () => {
    const m = [...cleanMidis]
    m[6] = 77
    const played: PlayedNote[] = []
    m.forEach((midi, i) => {
      played.push({ midi: midi - 12, t: i * 500 }, { midi, t: i * 500 + 40 })
    })
    const a = analyseRun(exp, played, { together: true, prefer: '#' })
    expect(a.wrong).toHaveLength(1)
    expect(a.wrong[0]).toMatchObject({ index: 6, played: 77 })
  })

  it('Together: a lone note with no partner is left in place', () => {
    const played: PlayedNote[] = [
      { midi: 67, t: 0 },
      { midi: 55, t: 10 },
      { midi: 69, t: 500 },
    ]
    expect(collapsePairs(played).map((p) => p.midi)).toEqual([67, 69])
    expect(collapsePairs([{ midi: 67, t: 0 }, { midi: 69, t: 500 }])).toHaveLength(2)
  })
})

describe('collapsePairs', () => {
  it('does not collapse neighbouring notes in a quick one-hand run', () => {
    const p: PlayedNote[] = [
      { midi: 67, t: 0 },
      { midi: 69, t: 30 },
      { midi: 71, t: 60 },
    ]
    expect(collapsePairs(p)).toHaveLength(3)
  })

  it('does not collapse an octave pair outside the pair window', () => {
    const p: PlayedNote[] = [
      { midi: 55, t: 0 },
      { midi: 67, t: 151 },
    ]
    expect(collapsePairs(p)).toHaveLength(2)
  })

  it('keeps the upper note, at the earlier onset', () => {
    const out = collapsePairs([
      { midi: 55, t: 100 },
      { midi: 67, t: 130 },
    ])
    expect(out).toEqual([{ midi: 67, t: 100 }])
  })

  it('does not reuse a note in two pairs', () => {
    const out = collapsePairs([
      { midi: 55, t: 0 },
      { midi: 67, t: 10 },
      { midi: 79, t: 20 },
    ])
    expect(out).toHaveLength(2)
  })
})

describe('evenness', () => {
  it('is 0.8 for alternating 400/600 ms gaps', () => {
    expect(evenness([0, 400, 1000, 1400, 2000])).toBeCloseTo(0.8, 10)
  })
  it('is null with fewer than 4 intervals', () => {
    expect(evenness([0, 500, 1000, 1500])).toBeNull()
  })
  it('is 1 for perfectly even gaps and clamps at 0', () => {
    expect(evenness([0, 500, 1000, 1500, 2000])).toBe(1)
    expect(evenness([0, 10, 1010, 1020, 3020])).toBe(0)
  })
})

describe('tempoFromOnsets', () => {
  it('is 60 for 500 ms gaps', () => {
    expect(tempoFromOnsets([0, 500, 1000, 1500, 2000])).toBe(60)
  })
  it('uses the median gap, so one long pause does not drag it', () => {
    expect(tempoFromOnsets([0, 500, 1000, 1500, 5000, 5500])).toBe(60)
  })
  it('is null with fewer than 4 intervals', () => {
    expect(tempoFromOnsets([0, 500, 1000])).toBeNull()
  })
})

describe('describeIssue', () => {
  it('writes a wrong note going down in flats', () => {
    expect(
      describeIssue({ kind: 'wrong', index: 9, expected: { midi: 76, name: 'E5' }, played: 75, direction: 'down' }, 'b'),
    ).toBe('Played E♭ instead of E going down')
  })
})
