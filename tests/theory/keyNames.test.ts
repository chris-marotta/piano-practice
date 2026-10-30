import { describe, expect, it } from 'vitest'
import { keyLabel, keyName, landmarkRoute, nearbyChoices, PC_ASCII, routeText } from '../../src/theory/keyNames'

const BLACK = new Set([1, 3, 6, 8, 10])

/** A small deterministic rng (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('PC_ASCII, keyLabel, keyName', () => {
  it('lists the twelve pitch classes in ASCII sharps', () => {
    expect(PC_ASCII).toEqual(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
  })

  it('labels white keys plainly and black keys sharp-first with the flat', () => {
    expect(keyLabel(4)).toBe('E')
    expect(keyLabel(8)).toBe('G♯ / A♭')
    expect(keyLabel(1)).toBe('C♯ / D♭')
    expect(keyLabel(10)).toBe('A♯ / B♭')
  })

  it('names a key by its sharp name only', () => {
    expect(keyName(8)).toBe('G♯')
    expect(keyName(0)).toBe('C')
    expect(keyName(6)).toBe('F♯')
  })
})

describe('landmarkRoute', () => {
  const route = (midi: number) => landmarkRoute(midi)

  it('walks white keys up from the nearest C or F at or below', () => {
    expect(route(60)).toEqual([60]) // C
    expect(route(62)).toEqual([60, 62]) // D
    expect(route(64)).toEqual([60, 62, 64]) // E
    expect(route(65)).toEqual([65]) // F
    expect(route(67)).toEqual([65, 67]) // G
    expect(route(69)).toEqual([65, 67, 69]) // A
    expect(route(71)).toEqual([65, 67, 69, 71]) // B
  })

  it('routes a black key as the white key below, then the key', () => {
    expect(route(61)).toEqual([60, 61]) // C#
    expect(route(63)).toEqual([62, 63]) // D#
    expect(route(66)).toEqual([65, 66]) // F#
    expect(route(68)).toEqual([67, 68]) // G#
    expect(route(70)).toEqual([69, 70]) // A#
  })

  it('ends on the key for all twelve pitch classes at MIDI 60-71', () => {
    for (let midi = 60; midi <= 71; midi++) {
      const r = route(midi)
      expect(r.at(-1)).toBe(midi)
      if (!BLACK.has(midi % 12)) {
        expect([0, 5]).toContain((r[0] as number) % 12)
        expect(r.every((m) => !BLACK.has(m % 12))).toBe(true)
      }
    }
  })

  it('works in other octaves', () => {
    expect(route(36 + 11)).toEqual([41, 43, 45, 47])
    expect(route(84 + 4)).toEqual([84, 86, 88])
  })
})

describe('routeText', () => {
  it('uses the verbatim landmark sentences', () => {
    expect(routeText(0)).toBe('C is just left of the two black keys.')
    expect(routeText(5)).toBe('F is just left of the three black keys.')
  })

  it('walks from the landmark for other white keys', () => {
    expect(routeText(4)).toBe('From C (left of the two black keys): C, D, E.')
    expect(routeText(9)).toBe('From F (left of the three black keys): F, G, A.')
    expect(routeText(11)).toBe('From F (left of the three black keys): F, G, A, B.')
  })

  it('places a black key by the white key below, with its other name', () => {
    expect(routeText(8)).toBe('G♯ is the black key just right of G. Also called A♭.')
    expect(routeText(1)).toBe('C♯ is the black key just right of C. Also called D♭.')
  })
})

describe('nearbyChoices', () => {
  it('always gives 4 distinct same-colour pitch classes including the target', () => {
    for (let pc = 0; pc < 12; pc++) {
      for (let seed = 1; seed <= 20; seed++) {
        const choices = nearbyChoices(pc, seeded(seed))
        expect(choices).toHaveLength(4)
        expect(new Set(choices).size).toBe(4)
        expect(choices).toContain(pc)
        expect(choices.every((c) => BLACK.has(c) === BLACK.has(pc))).toBe(true)
      }
    }
  })

  it('is deterministic for a fixed rng', () => {
    for (let pc = 0; pc < 12; pc++) {
      expect(nearbyChoices(pc, seeded(7))).toEqual(nearbyChoices(pc, seeded(7)))
    }
  })

  it('picks 4 of the 5 black keys for a black target, leaving out the farthest', () => {
    const choices = nearbyChoices(1, seeded(3)) // C#: D#, F#, G# are nearest, A# is farthest
    expect([...choices].sort((a, b) => a - b)).toEqual([1, 3, 6, 8])
    const mid = nearbyChoices(6, seeded(3)) // F#: neighbours at distance 1 and 2 on both sides
    expect(mid).toHaveLength(4)
    expect(mid).toContain(6)
    expect(mid).toContain(3)
    expect(mid).toContain(8)
  })

  it('shuffles with the rng, so the target is not always in the same slot', () => {
    const slots = new Set<number>()
    for (let seed = 1; seed <= 40; seed++) slots.add(nearbyChoices(4, seeded(seed)).indexOf(4))
    expect(slots.size).toBeGreaterThan(1)
  })

  it('breaks distance ties with the rng', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) seen.add([...nearbyChoices(4, seeded(seed))].sort((a, b) => a - b).join())
    // E: D and F always; C or G (both at distance 2) varies
    expect(seen.size).toBeGreaterThan(1)
    for (const s of seen) expect(s).toMatch(/^(0,2,4,5|2,4,5,7)$/)
  })
})
