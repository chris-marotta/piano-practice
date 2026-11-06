import { describe, expect, it } from 'vitest'
import {
  EAR_DEGREES,
  EAR_KEY_LEVEL,
  EAR_LEVEL_DEGREES,
  degreeOf,
  earChoices,
  earRoute,
  earSpelling,
  earTarget,
  earTonicMidi,
  isEarDegree,
  walkHome,
  type EarDegree,
} from '../../src/theory/ear'

const ALL = EAR_DEGREES.map((d) => d.degree)

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('ear tables', () => {
  it('has 12 degrees in half-step order', () => {
    expect(EAR_DEGREES.map((d) => d.semis)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(EAR_DEGREES.map((d) => d.label)).toEqual(['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'])
    expect(EAR_DEGREES.map((d) => d.whyName)).toEqual(['home', '♭2', '2nd', '♭3', '3rd', '4th', '♯4', '5th', '♭6', '6th', '♭7', '7th'])
    expect(EAR_DEGREES[6]?.interval).toBe('4A')
    expect(EAR_DEGREES[6]?.feel).toBe('The odd one out: it leans up into 5, then 6–7–8.')
    expect(EAR_DEGREES[0]?.feel).toBe('Home: everything settles here.')
  })
  it('levels flatten to 12 distinct degrees', () => {
    const flat = ([1, 2, 3, 4, 5] as const).flatMap((l) => EAR_LEVEL_DEGREES[l])
    expect(new Set(flat).size).toBe(12)
    expect(flat).toHaveLength(12)
    expect(EAR_KEY_LEVEL).toBe(4)
  })
  it('isEarDegree', () => {
    expect(isEarDegree('b3')).toBe(true)
    expect(isEarDegree('#4')).toBe(true)
    expect(isEarDegree('8')).toBe(false)
  })
})

describe('tonic and target', () => {
  it('earTonicMidi', () => {
    expect(earTonicMidi('C')).toBe(60)
    expect(earTonicMidi('G')).toBe(55)
    expect(earTonicMidi('F#')).toBe(66)
    expect(earTonicMidi('Gb')).toBe(66)
    expect(earTonicMidi('Ab')).toBe(56)
    for (const r of ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']) {
      const m = earTonicMidi(r)
      expect(m).toBeGreaterThanOrEqual(55)
      expect(m).toBeLessThanOrEqual(66)
    }
  })
  it('earTarget', () => {
    expect(earTarget(60, '5')).toBe(67)
    expect(earTarget(60, '1')).toBe(72)
    expect(earTarget(66, '7')).toBe(77)
    expect(earTarget(57, 'b3')).toBe(60)
  })
  it('degreeOf', () => {
    expect(degreeOf(60, 66)).toBe('#4')
    expect(degreeOf(57, 36)).toBe('b3')
    expect(degreeOf(60, 72)).toBe('1')
  })
})

describe('earSpelling', () => {
  it('spells', () => {
    expect(earSpelling('C', 'b3')).toBe('Eb')
    expect(earSpelling('A', '#4')).toBe('D#')
    expect(earSpelling('Bb', '6')).toBe('G')
    expect(earSpelling('F#', '7')).toBe('E#')
    expect(earSpelling('G#', '#4')).toBe('D')
    expect(earSpelling('Db', 'b6')).toBe('A')
  })
})

describe('routes and walk home', () => {
  it('earRoute', () => {
    expect(earRoute(60, '5')).toEqual([60, 62, 64, 65])
    expect(earRoute(60, 'b3')).toEqual([60, 62])
    expect(earRoute(60, '1')).toEqual([60])
    expect(earRoute(60, '7')).toEqual([60, 62, 64, 65, 67, 69])
  })
  it('walkHome matches the table', () => {
    const table: Record<EarDegree, number[]> = {
      '1': [], b2: [1, 0], '2': [2, 0], b3: [3, 2, 0], '3': [4, 2, 0], '4': [5, 4, 2, 0],
      '#4': [6, 7, 9, 11, 12], '5': [7, 9, 11, 12], b6: [8, 7, 9, 11, 12], '6': [9, 11, 12],
      b7: [10, 9, 11, 12], '7': [11, 12],
    }
    for (const d of ALL) expect(walkHome(d)).toEqual(table[d])
  })
})

describe('earChoices', () => {
  const set = (d: EarDegree, pool: EarDegree[]) => new Set(earChoices(d, pool, seeded(1)))
  it('pinned sets', () => {
    expect(set('5', ['1', '5'])).toEqual(new Set(['5', '4', '1', '3']))
    expect(set('1', ['1', '5'])).toEqual(new Set(['1', '7', '5', '3']))
    expect(set('#4', ALL)).toEqual(new Set(['#4', '4', '5', '3']))
    expect(set('b3', ALL)).toEqual(new Set(['b3', '3', '2', 'b2']))
  })
  it('always 4 distinct, includes target, deterministic', () => {
    for (const d of ALL) {
      const a = earChoices(d, ALL, seeded(7))
      expect(a).toHaveLength(4)
      expect(new Set(a).size).toBe(4)
      expect(a).toContain(d)
      expect(earChoices(d, ALL, seeded(7))).toEqual(a)
      const b = earChoices(d, ['1', '5'], seeded(3))
      expect(new Set(b).size).toBe(4)
      expect(b).toContain(d)
    }
  })
})
