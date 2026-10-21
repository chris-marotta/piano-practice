import { describe, expect, it } from 'vitest'
import { SESSION_SIZES, buildSession, estimateSeconds } from '../../src/session/builder'
import type { Step } from '../../src/session/builder'
import {
  DEFAULT_SETTINGS,
  chordsId,
  enabledScales,
  placeItems,
  recallId,
  scaleId,
  stateFor,
} from '../../src/srs/items'
import type { Placement, Settings } from '../../src/srs/items'
import { addDays } from '../../src/srs/dates'
import { applyRating } from '../../src/srs/scheduler'
import type { ItemState } from '../../src/srs/scheduler'
import { progression } from '../../src/theory/chords'
import { recallCard } from '../../src/theory/recall'
import type { ScaleRef } from '../../src/theory/scales'

const TODAY = '2026-10-20'
const PLACED = '2026-10-01'

const allSolid = (settings: Settings = DEFAULT_SETTINGS): Record<string, ItemState> => {
  const choices: Record<string, Placement> = Object.fromEntries(
    enabledScales(settings).map((r) => [scaleId(r), 'solid' as Placement]),
  )
  return placeItems(choices, settings, PLACED)
}

const withMinutes = (sessionMinutes: Settings['sessionMinutes']): Settings => ({ ...DEFAULT_SETTINGS, sessionMinutes })

/** Copy of `items` with every item's due date set to `due`. */
const allDue = (items: Record<string, ItemState>, due: string): Record<string, ItemState> =>
  Object.fromEntries(Object.entries(items).map(([id, s]) => [id, { ...s, due }]))

const set = (items: Record<string, ItemState>, id: string, patch: Partial<ItemState>): void => {
  items[id] = { ...(items[id] as ItemState), ...patch }
}

const ofKind = <K extends Step['kind']>(steps: Step[], kind: K): Extract<Step, { kind: K }>[] =>
  steps.filter((s): s is Extract<Step, { kind: K }> => s.kind === kind)

const scaleRefs = (steps: Step[]): ScaleRef[] => ofKind(steps, 'scale').map((s) => s.ref)
const itemIds = (steps: Step[]): string[] => steps.flatMap((s) => ('itemId' in s ? [s.itemId] : []))

const C: ScaleRef = { root: 'C', form: 'major' }
const G: ScaleRef = { root: 'G', form: 'major' }
const D: ScaleRef = { root: 'D', form: 'major' }
const A: ScaleRef = { root: 'A', form: 'major' }
const Am: ScaleRef = { root: 'A', form: 'natural' }

describe('SESSION_SIZES', () => {
  it('matches the spec table', () => {
    expect(SESSION_SIZES).toEqual({
      5: { cards: 4, scales: 1, chordSets: 1, freeplaySeconds: 0 },
      10: { cards: 6, scales: 2, chordSets: 1, freeplaySeconds: 0 },
      15: { cards: 8, scales: 3, chordSets: 2, freeplaySeconds: 0 },
      20: { cards: 10, scales: 4, chordSets: 2, freeplaySeconds: 120 },
    })
  })
})

describe('buildSession: sizes', () => {
  const items = allSolid()
  for (const [min, c, s, ch, fp] of [
    [5, 4, 1, 1, 0],
    [10, 6, 2, 1, 0],
    [15, 8, 3, 2, 0],
    [20, 10, 4, 2, 1],
  ] as const) {
    it(`${min} min → ${c} cards / ${s} scales / ${ch} chord sets / ${fp} free play`, () => {
      const steps = buildSession(items, withMinutes(min), TODAY)
      expect(steps.filter((x) => x.kind === 'recall')).toHaveLength(c)
      expect(steps.filter((x) => x.kind === 'scale')).toHaveLength(s)
      expect(steps.filter((x) => x.kind === 'chords')).toHaveLength(ch)
      expect(steps.filter((x) => x.kind === 'freeplay')).toHaveLength(fp)
    })
  }

  it('is deterministic: same inputs → identical output', () => {
    const items = allSolid()
    expect(buildSession(items, withMinutes(20), TODAY)).toEqual(buildSession(items, withMinutes(20), TODAY))
  })

  it('ties (same due, same box) break by catalog order', () => {
    const steps = buildSession(allSolid(), withMinutes(20), TODAY)
    expect(scaleRefs(steps)).toEqual([C, G, D, A])
  })
})

describe('buildSession: due ordering (rule 1)', () => {
  it('most overdue first', () => {
    const items = allSolid()
    set(items, scaleId({ root: 'F', form: 'major' }), { due: '2026-09-01' })
    set(items, scaleId({ root: 'Bb', form: 'major' }), { due: '2026-09-05' })
    const steps = buildSession(items, withMinutes(15), TODAY)
    expect(scaleRefs(steps)).toEqual([
      { root: 'F', form: 'major' },
      { root: 'Bb', form: 'major' },
      C,
    ])
  })

  it('same due date → lowest box first', () => {
    const items = allSolid()
    set(items, scaleId({ root: 'B', form: 'major' }), { box: 1 })
    set(items, scaleId({ root: 'E', form: 'major' }), { box: 2 })
    const steps = buildSession(items, withMinutes(15), TODAY)
    expect(scaleRefs(steps)).toEqual([{ root: 'B', form: 'major' }, { root: 'E', form: 'major' }, C])
  })
})

describe('buildSession: distinct roots (rule 2)', () => {
  it('A major and A minor overdue the most → only one of them is picked', () => {
    const items = allSolid()
    set(items, scaleId(Am), { due: '2026-09-01' })
    set(items, scaleId(A), { due: '2026-09-02' })
    const steps = buildSession(items, withMinutes(10), TODAY)
    const refs = scaleRefs(steps)
    expect(refs.filter((r) => r.root === 'A')).toHaveLength(1)
    expect(refs).toEqual([Am, C])
  })

  it('no two scale steps share a root, even at 20 min with every scale due', () => {
    const refs = scaleRefs(buildSession(allSolid(), withMinutes(20), TODAY))
    expect(new Set(refs.map((r) => r.root)).size).toBe(refs.length)
  })
})

describe('buildSession: step order (rule 7)', () => {
  for (const min of [15, 20] as const) {
    it(`${min} min: recall steps first, then scale/chords pairs; each chords ref equals the preceding scale's ref`, () => {
      const steps = buildSession(allSolid(), withMinutes(min), TODAY)
      const firstNonRecall = steps.findIndex((s) => s.kind !== 'recall')
      expect(firstNonRecall).toBe(SESSION_SIZES[min].cards)
      expect(steps.slice(firstNonRecall).some((s) => s.kind === 'recall')).toBe(false)
      expect(steps[firstNonRecall]?.kind).toBe('scale')
      steps.forEach((s, i) => {
        if (s.kind !== 'chords') return
        const prev = steps[i - 1]
        expect(prev?.kind).toBe('scale')
        expect(s.ref).toEqual((prev as Extract<Step, { kind: 'scale' }>).ref)
      })
    })
  }

  it('free play is last, on the first scale ref, for 120 s (20 min only)', () => {
    const steps = buildSession(allSolid(), withMinutes(20), TODAY)
    const last = steps[steps.length - 1]
    expect(last).toEqual({ kind: 'freeplay', ref: C, seconds: 120 })
    expect(ofKind(steps, 'freeplay')).toHaveLength(1)
  })
})

describe('buildSession: step contents', () => {
  it('scale step carries its id, support and tempo from state', () => {
    const items = allSolid()
    set(items, scaleId(C), { tempo: 76, support: 1 })
    const [step] = ofKind(buildSession(items, withMinutes(5), TODAY), 'scale')
    expect(step).toEqual({ kind: 'scale', itemId: 'scale:C:major', ref: C, support: 1, tempo: 76 })
  })

  it('chords step = progression(ref); includeInversions when box ≥ 3', () => {
    const items = allSolid()
    set(items, chordsId(G), { box: 2 })
    const chords = ofKind(buildSession(items, withMinutes(15), TODAY), 'chords')
    expect(chords).toEqual([
      { kind: 'chords', itemId: 'chords:C:major', ref: C, chords: progression(C), includeInversions: true },
      { kind: 'chords', itemId: 'chords:G:major', ref: G, chords: progression(G), includeInversions: false },
    ])
  })

  it('recall step card = recallCard(type, ref)', () => {
    const recalls = ofKind(buildSession(allSolid(), withMinutes(5), TODAY), 'recall')
    expect(recalls[0]).toEqual({ kind: 'recall', itemId: 'recall:keysig:C:major', card: recallCard('keysig', C) })
    for (const r of recalls) {
      const [, type, root, form] = r.itemId.split(':')
      expect(r.card).toEqual(recallCard(type as never, { root: root as string, form: form as never }))
    }
  })
})

describe('buildSession: chord sets (rule 5)', () => {
  it("come only from today's scales, due ones first, then rendered in scale order", () => {
    const items = allSolid()
    set(items, chordsId(C), { due: '2026-10-25' }) // C's chord set is not due
    const steps = buildSession(items, withMinutes(15), TODAY)
    expect(scaleRefs(steps)).toEqual([C, G, D])
    expect(ofKind(steps, 'chords').map((s) => s.ref)).toEqual([G, D])
    expect(steps.slice(SESSION_SIZES[15].cards).map((s) => s.kind + ':' + ('ref' in s ? s.ref.root : ''))).toEqual([
      'scale:C',
      'scale:G',
      'chords:G',
      'scale:D',
      'chords:D',
    ])
  })

  it("a not-due chord set of today's scale still fills an open slot", () => {
    const items = allSolid()
    set(items, chordsId(C), { due: '2026-10-25' })
    const chords = ofKind(buildSession(items, withMinutes(5), TODAY), 'chords')
    expect(chords.map((s) => s.itemId)).toEqual(['chords:C:major'])
  })
})

describe('buildSession: recall cards (rule 6)', () => {
  it("prefer today's keys", () => {
    const recalls = ofKind(buildSession(allSolid(), withMinutes(10), TODAY), 'recall')
    expect(recalls.map((s) => s.itemId)).toEqual([
      recallId('keysig', C),
      recallId('spell', C),
      recallId('relative', C),
      recallId('thumb', C),
      recallId('keysig', G),
      recallId('spell', G),
    ])
  })

  it('remaining slots come from other due cards, most overdue first', () => {
    const items = allSolid()
    const F: ScaleRef = { root: 'F', form: 'major' }
    // C's keysig and spell cards were done today; F's keysig is the most overdue other card.
    items[recallId('keysig', C)] = applyRating(items[recallId('keysig', C)] as ItemState, 'nailed', TODAY)
    items[recallId('spell', C)] = applyRating(items[recallId('spell', C)] as ItemState, 'nailed', TODAY)
    set(items, recallId('keysig', F), { due: '2026-09-01' })
    const steps = buildSession(items, withMinutes(5), TODAY)
    expect(scaleRefs(steps)).toEqual([C])
    expect(ofKind(steps, 'recall').map((s) => s.itemId)).toEqual([
      recallId('relative', C),
      recallId('thumb', C),
      recallId('keysig', F),
      recallId('keysig', G),
    ])
  })
})

describe('buildSession: non-introduced cards of today\'s scales (R12)', () => {
  const freshCards = (ref: ScaleRef) => (['keysig', 'spell', 'relative', 'thumb'] as const).map((t) => recallId(t, ref))

  it("an introduced scale's never-introduced cards are used, even with plenty of other due cards", () => {
    const items = allSolid()
    for (const id of freshCards(C)) set(items, id, { introduced: false })
    const steps = buildSession(items, withMinutes(5), TODAY)
    expect(scaleRefs(steps)).toEqual([C])
    expect(ofKind(steps, 'recall').map((s) => s.itemId)).toEqual(freshCards(C))
  })

  it("today's due introduced cards come before today's non-introduced cards", () => {
    const items = allSolid()
    for (const id of freshCards(C)) set(items, id, { introduced: false })
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(scaleRefs(steps)).toEqual([C, G])
    expect(ofKind(steps, 'recall').map((s) => s.itemId)).toEqual([...freshCards(G), recallId('keysig', C), recallId('spell', C)])
  })

  it("non-introduced cards of scales NOT in today's session stay out", () => {
    const items = allSolid()
    const F: ScaleRef = { root: 'F', form: 'major' }
    for (const id of freshCards(F)) set(items, id, { introduced: false })
    const steps = buildSession(items, withMinutes(20), TODAY)
    for (const id of freshCards(F)) expect(itemIds(steps)).not.toContain(id)
  })

  it('daily sessions, nailing every step after alternating solid/unknown placement → no recall card is orphaned', () => {
    // At day 30, 4 'unknown' scales are still waiting on the one-new-scale-per-session cap
    // (a throughput limit, not orphaning), so the day-30 check covers introduced scales only;
    // by day 45 every scale, and so every card, has been introduced.
    const settings = DEFAULT_SETTINGS
    const refs = enabledScales(settings)
    const choices: Record<string, Placement> = Object.fromEntries(
      refs.map((r, i) => [scaleId(r), (i % 2 === 0 ? 'solid' : 'unknown') as Placement]),
    )
    const items = placeItems(choices, settings, PLACED)
    const neverRated = (rs: ScaleRef[]): string[] =>
      rs.flatMap(freshCards).filter((id) => (items[id]?.history.length ?? 0) === 0)
    let day = PLACED
    for (let d = 1; d <= 45; d++) {
      for (const step of buildSession(items, settings, day)) {
        if (step.kind === 'freeplay') continue
        items[step.itemId] = applyRating(stateFor(step.itemId, items, day, settings), 'nailed', day)
      }
      day = addDays(day, 1)
      if (d === 30) {
        const introduced = refs.filter((r) => items[scaleId(r)]?.introduced)
        expect(introduced.length).toBeGreaterThanOrEqual(20)
        expect(neverRated(introduced)).toEqual([])
      }
    }
    expect(refs.flatMap(freshCards)).toHaveLength(96)
    expect(neverRated(refs)).toEqual([])
  })
})

describe('buildSession: new items (rule 4 cap)', () => {
  it("all 'unknown' placement → exactly 1 scale step, with support 0", () => {
    const items = placeItems({}, DEFAULT_SETTINGS, PLACED)
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(items, withMinutes(min), TODAY)
      const scales = ofKind(steps, 'scale')
      expect(scales).toHaveLength(1)
      expect(scales[0]?.support).toBe(0)
      expect(scales[0]?.ref).toEqual(C)
    }
  })

  it("all 'unknown' → every step belongs to the one new scale; its recall cards are used", () => {
    const items = placeItems({}, DEFAULT_SETTINGS, PLACED)
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(ofKind(steps, 'recall').map((s) => s.itemId)).toEqual([
      recallId('keysig', C),
      recallId('spell', C),
      recallId('relative', C),
      recallId('thumb', C),
    ])
    expect(ofKind(steps, 'chords').map((s) => s.itemId)).toEqual([chordsId(C)])
    expect(itemIds(steps).every((id) => id.endsWith(':C:major'))).toBe(true)
  })

  it('no new scale while due scales fill every slot', () => {
    const items = allSolid()
    set(items, scaleId(G), { introduced: false })
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(scaleRefs(steps)).toEqual([C, D])
  })

  it('the new scale also respects distinct roots', () => {
    const items = allDue(allSolid(), '2026-10-25')
    set(items, scaleId(A), { due: TODAY })
    const settings: Settings = { ...withMinutes(10), minorForms: { natural: true, harmonic: true, melodic: false } }
    const refs = scaleRefs(buildSession(items, settings, TODAY))
    // A major is due; the first new scale in catalog order is A harmonic, which shares root A → E harmonic.
    expect(refs).toEqual([A, { root: 'E', form: 'harmonic' }])
  })
})

describe('buildSession: never empty (rule 4 fill)', () => {
  it('everything due in the future → still returns N scale steps (next-soonest)', () => {
    const items = allDue(allSolid(), '2026-10-25')
    set(items, scaleId(G), { due: '2026-10-21' })
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(items, withMinutes(min), TODAY)
      expect(ofKind(steps, 'scale')).toHaveLength(SESSION_SIZES[min].scales)
      expect(ofKind(steps, 'recall')).toHaveLength(SESSION_SIZES[min].cards)
      expect(ofKind(steps, 'chords')).toHaveLength(SESSION_SIZES[min].chordSets)
    }
    expect(scaleRefs(buildSession(items, withMinutes(10), TODAY))).toEqual([G, C])
  })
})

describe('buildSession: rated today (Review Focus 3)', () => {
  it("rate the first picked scale 'shaky' today (due tomorrow); rebuild → that scale is not in the session", () => {
    const items = allSolid()
    const first = ofKind(buildSession(items, DEFAULT_SETTINGS, TODAY), 'scale')[0]
    expect(first?.itemId).toBe(scaleId(C))
    items[scaleId(C)] = applyRating(items[scaleId(C)] as ItemState, 'shaky', TODAY)
    expect(items[scaleId(C)]?.due).toBe('2026-10-21')
    const steps = buildSession(items, DEFAULT_SETTINGS, TODAY)
    expect(itemIds(steps)).not.toContain(scaleId(C))
    expect(scaleRefs(steps)).toEqual([G, D])
  })

  it('a scale rated today is not pulled back by the next-soonest fill, even as the soonest', () => {
    const items = allDue(allSolid(), '2026-10-25')
    items[scaleId(C)] = applyRating(items[scaleId(C)] as ItemState, 'shaky', TODAY) // due 10-21: soonest of all
    const refs = scaleRefs(buildSession(items, withMinutes(20), TODAY))
    expect(refs).toHaveLength(4)
    expect(refs).not.toContainEqual(C)
  })

  it('recall cards and chord sets rated today are excluded from every pool', () => {
    const items = allDue(allSolid(), '2026-10-25')
    const ratedToday = [recallId('keysig', C), recallId('spell', C), chordsId(C)]
    for (const id of ratedToday) items[id] = applyRating(items[id] as ItemState, 'lost', TODAY)
    const steps = buildSession(items, withMinutes(20), TODAY)
    expect(scaleRefs(steps)[0]).toEqual(C) // the scale itself was not rated today
    for (const id of ratedToday) expect(itemIds(steps)).not.toContain(id)
    expect(ofKind(steps, 'recall')).toHaveLength(10)
  })

  it('every enabled scale rated today → empty session, even though recall cards are still due (R11)', () => {
    const items = allSolid()
    for (const ref of enabledScales(DEFAULT_SETTINGS)) {
      items[scaleId(ref)] = applyRating(items[scaleId(ref)] as ItemState, 'nailed', TODAY)
    }
    for (const min of [5, 10, 15, 20] as const) expect(buildSession(items, withMinutes(min), TODAY)).toEqual([])
  })

  it('history from an earlier day does not exclude', () => {
    const items = allDue(allSolid(), '2026-10-25')
    items[scaleId(C)] = applyRating(items[scaleId(C)] as ItemState, 'shaky', '2026-10-19') // due today
    expect(items[scaleId(C)]?.due).toBe(TODAY)
    expect(scaleRefs(buildSession(items, DEFAULT_SETTINGS, TODAY))).toEqual([C, G])
  })
})

describe('buildSession: settings change after placement (Review Focus 4)', () => {
  const harmonicOn: Settings = { ...DEFAULT_SETTINGS, minorForms: { natural: true, harmonic: true, melodic: false } }

  it('enable harmonic after placement → builds without throwing; at most 1 harmonic scale (new) appears', () => {
    const items = allSolid() // placed with harmonic off: no harmonic state stored
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(items, { ...harmonicOn, sessionMinutes: min }, TODAY)
      expect(scaleRefs(steps).filter((r) => r.form === 'harmonic').length).toBeLessThanOrEqual(1)
    }
  })

  it('enable harmonic when nothing is due → exactly 1 new harmonic scale at start tempo, L0, the rest next-soonest', () => {
    const items = allDue(allSolid(), '2026-10-25')
    const settings: Settings = { ...harmonicOn, sessionMinutes: 20, startTempo: 50 }
    const steps = buildSession(items, settings, TODAY)
    const scales = ofKind(steps, 'scale')
    expect(scales.map((s) => s.ref)).toEqual([{ root: 'A', form: 'harmonic' }, C, G, D])
    expect(scales[0]).toMatchObject({ itemId: 'scale:A:harmonic', support: 0, tempo: 50 })
    expect(itemIds(steps).filter((id) => id.endsWith(':harmonic'))).toEqual([
      recallId('keysig', { root: 'A', form: 'harmonic' }),
      recallId('spell', { root: 'A', form: 'harmonic' }),
      recallId('relative', { root: 'A', form: 'harmonic' }),
      recallId('thumb', { root: 'A', form: 'harmonic' }),
      'scale:A:harmonic',
      'chords:A:harmonic',
    ])
  })

  it("disable natural → no ':natural' ids in any step", () => {
    const items = allSolid()
    for (const id of Object.keys(items)) if (id.endsWith(':natural')) set(items, id, { due: '2026-09-01' })
    const settings: Settings = { ...DEFAULT_SETTINGS, minorForms: { natural: false, harmonic: false, melodic: false } }
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(items, { ...settings, sessionMinutes: min }, TODAY)
      expect(itemIds(steps).some((id) => id.includes(':natural'))).toBe(false)
      expect(steps.some((s) => 'ref' in s && s.ref.form === 'natural')).toBe(false)
      expect(ofKind(steps, 'scale')).toHaveLength(SESSION_SIZES[min].scales)
    }
  })

  it('stored garbage keys are ignored, never parsed', () => {
    const items: Record<string, ItemState> = { ...allSolid() }
    const junk = (id: string): ItemState => ({ id, introduced: true, box: 1, support: 0, levelStreak: 0, due: '2026-01-01', history: [] })
    items['garbage'] = junk('garbage')
    items['scale:H:major'] = junk('scale:H:major')
    items['scale:F♯:major'] = junk('scale:F♯:major')
    const steps = buildSession(items, DEFAULT_SETTINGS, TODAY)
    expect(scaleRefs(steps)).toEqual([C, G])
  })
})

describe('estimateSeconds', () => {
  it('default session = 6×15 + 2×180 + 1×90', () => {
    expect(estimateSeconds(buildSession(allSolid(), DEFAULT_SETTINGS, TODAY))).toBe(6 * 15 + 2 * 180 + 1 * 90)
  })

  it('20 min session adds free play seconds', () => {
    expect(estimateSeconds(buildSession(allSolid(), withMinutes(20), TODAY))).toBe(10 * 15 + 4 * 180 + 2 * 90 + 120)
  })

  it('empty → 0', () => {
    expect(estimateSeconds([])).toBe(0)
  })
})
