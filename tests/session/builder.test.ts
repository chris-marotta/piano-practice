import { describe, expect, it } from 'vitest'
import { SESSION_SIZES, buildSession, estimateSeconds } from '../../src/session/builder'
import type { Step } from '../../src/session/builder'
import {
  DEFAULT_SETTINGS,
  chordsId,
  enabledScales,
  KEY_IDS,
  placeItems,
  recallId,
  scaleId,
  stateFor,
} from '../../src/srs/items'
import type { Placement, Settings } from '../../src/srs/items'
import { addDays } from '../../src/srs/dates'
import { applyRating } from '../../src/srs/scheduler'
import { rateItem } from '../../src/session/record'
import { emptyState } from '../../src/store/storage'
import type { AppState } from '../../src/store/storage'
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

/** The deck's cards, in deck order (empty when there is no deck step). */
const deckCards = (steps: Step[]) => ofKind(steps, 'deck').flatMap((d) => d.cards)

const scaleRefs = (steps: Step[]): ScaleRef[] => ofKind(steps, 'scale').map((s) => s.ref)
/** Every item id in session order, the deck's cards included. */
const itemIds = (steps: Step[]): string[] =>
  steps.flatMap((s) => (s.kind === 'deck' ? s.cards.map((c) => c.itemId) : 'itemId' in s ? [s.itemId] : []))

const C: ScaleRef = { root: 'C', form: 'major' }
const G: ScaleRef = { root: 'G', form: 'major' }
const D: ScaleRef = { root: 'D', form: 'major' }
const A: ScaleRef = { root: 'A', form: 'major' }
const Am: ScaleRef = { root: 'A', form: 'natural' }

describe('SESSION_SIZES', () => {
  it('matches the spec table', () => {
    expect(SESSION_SIZES).toEqual({
      5: { keys: 4, staff: 3, ear: 2, cards: 4, scales: 1, chordSets: 1, freeplaySeconds: 0 },
      10: { keys: 8, staff: 6, ear: 4, cards: 6, scales: 2, chordSets: 1, freeplaySeconds: 0 },
      15: { keys: 8, staff: 6, ear: 4, cards: 8, scales: 3, chordSets: 2, freeplaySeconds: 0 },
      20: { keys: 8, staff: 6, ear: 4, cards: 10, scales: 4, chordSets: 2, freeplaySeconds: 120 },
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
      expect(ofKind(steps, 'deck')).toHaveLength(1)
      expect(deckCards(steps)).toHaveLength(c)
      expect(steps.filter((x) => x.kind === 'scale')).toHaveLength(s)
      expect(steps.filter((x) => x.kind === 'chords')).toHaveLength(ch)
      expect(steps.filter((x) => x.kind === 'freeplay')).toHaveLength(fp)
    })
  }

  it('is deterministic: same inputs → identical output', () => {
    const items = allSolid()
    expect(buildSession(items, withMinutes(20), TODAY)).toEqual(buildSession(items, withMinutes(20), TODAY))
  })

  it('ignores key items in stored state (drill items never enter sessions)', () => {
    const items = allDue(allSolid(), TODAY)
    const withKeys = { ...items }
    for (const id of KEY_IDS) withKeys[id] = { ...(items[Object.keys(items)[0] as string] as ItemState), id }
    expect(buildSession(withKeys, withMinutes(20), TODAY)).toEqual(buildSession(items, withMinutes(20), TODAY))
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

describe('buildSession: weakest first (ruling R19)', () => {
  const F: ScaleRef = { root: 'F', form: 'major' }

  it('lowest box beats more overdue', () => {
    const items = allSolid()
    set(items, scaleId(C), { box: 3, due: '2026-09-01' })
    set(items, scaleId(F), { box: 1, due: TODAY })
    expect(scaleRefs(buildSession(items, withMinutes(10), TODAY))).toEqual([F, C])
  })

  it('a Lost scale comes back the next day ahead of box-2 scales overdue by 10 days', () => {
    const items = allSolid()
    for (const ref of enabledScales(DEFAULT_SETTINGS)) set(items, scaleId(ref), { box: 2, due: '2026-10-10' })
    const yesterday = addDays(TODAY, -1)
    items[scaleId(F)] = applyRating(items[scaleId(F)] as ItemState, 'lost', yesterday)
    expect(items[scaleId(F)]).toMatchObject({ box: 1, due: TODAY })
    expect(scaleRefs(buildSession(items, withMinutes(5), TODAY))).toEqual([F])
    expect(scaleRefs(buildSession(items, withMinutes(10), TODAY))).toEqual([F, C])
  })

  it('due recall cards also rank lowest box first', () => {
    const items = allSolid()
    // C's own cards were done today, so the other-due pool decides the last two slots.
    for (const t of ['keysig', 'spell', 'relative', 'thumb'] as const)
      items[recallId(t, C)] = applyRating(items[recallId(t, C)] as ItemState, 'nailed', TODAY)
    set(items, recallId('keysig', G), { box: 3, due: '2026-09-01' })
    set(items, recallId('spell', F), { box: 1, due: TODAY })
    const recalls = deckCards(buildSession(items, withMinutes(5), TODAY)).map((s) => s.itemId)
    expect(recalls.slice(0, 2)).toEqual([recallId('spell', F), recallId('keysig', G)])
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
    it(`${min} min: the drill, the staff round, the ear round, the deck, then scale/chords pairs; each chords ref equals the preceding scale's ref`, () => {
      const steps = buildSession(allSolid(), withMinutes(min), TODAY)
      expect(steps[0]?.kind).toBe('drill')
      expect(steps[1]?.kind).toBe('staff')
      expect(steps[2]?.kind).toBe('ear')
      expect(steps[3]?.kind).toBe('deck')
      expect(steps.slice(4).some((s) => s.kind === 'deck' || s.kind === 'drill' || s.kind === 'staff' || s.kind === 'ear')).toBe(false)
      expect(steps[4]?.kind).toBe('scale')
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

  it('deck card = recallCard(type, ref)', () => {
    const recalls = deckCards(buildSession(allSolid(), withMinutes(5), TODAY))
    expect(recalls[0]).toEqual({ itemId: 'recall:keysig:C:major', card: recallCard('keysig', C) })
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
    expect(steps.slice(0, 4).map((s) => s.kind)).toEqual(['drill', 'staff', 'ear', 'deck'])
    expect(steps.slice(4).map((s) => s.kind + ':' + ('ref' in s ? s.ref.root : ''))).toEqual([
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
    const recalls = deckCards(buildSession(allSolid(), withMinutes(10), TODAY))
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
    expect(deckCards(steps).map((s) => s.itemId)).toEqual([
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
    expect(deckCards(steps).map((s) => s.itemId)).toEqual(freshCards(C))
  })

  it("today's due introduced cards come before today's non-introduced cards", () => {
    const items = allSolid()
    for (const id of freshCards(C)) set(items, id, { introduced: false })
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(scaleRefs(steps)).toEqual([C, G])
    expect(deckCards(steps).map((s) => s.itemId)).toEqual([...freshCards(G), recallId('keysig', C), recallId('spell', C)])
  })

  it("non-introduced cards of scales NOT in today's session stay out", () => {
    const items = allSolid()
    const F: ScaleRef = { root: 'F', form: 'major' }
    for (const id of freshCards(F)) set(items, id, { introduced: false })
    const steps = buildSession(items, withMinutes(20), TODAY)
    for (const id of freshCards(F)) expect(itemIds(steps)).not.toContain(id)
  })

  it('daily sessions, nailing every step after alternating solid/unknown placement → no recall card is orphaned', () => {
    // Rated through rateItem, the app's write path: a new scale's first rating introduces its
    // cards (rating with applyRating alone leaves an introduced scale with never-introduced
    // cards, a state the app never reaches). With a slot held for a new scale (R20), all 12
    // 'unknown' scales are introduced by day 12, and by day 30 every card has been rated.
    const settings = DEFAULT_SETTINGS
    const refs = enabledScales(settings)
    const choices: Record<string, Placement> = Object.fromEntries(
      refs.map((r, i) => [scaleId(r), (i % 2 === 0 ? 'solid' : 'unknown') as Placement]),
    )
    let state: AppState = { ...emptyState(), settings, placedAt: PLACED, items: placeItems(choices, settings, PLACED) }
    const neverRated = (rs: ScaleRef[]): string[] =>
      rs.flatMap(freshCards).filter((id) => (state.items[id]?.history.length ?? 0) === 0)
    const introduced = (): ScaleRef[] => refs.filter((r) => state.items[scaleId(r)]?.introduced)
    let day = PLACED
    for (let d = 1; d <= 45; d++) {
      for (const id of itemIds(buildSession(state.items, settings, day))) state = rateItem(state, id, 'nailed', day)
      day = addDays(day, 1)
      if (d === 12) expect(introduced()).toHaveLength(24)
      if (d === 30) expect(neverRated(refs)).toEqual([])
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
    expect(deckCards(steps).map((s) => s.itemId)).toEqual([
      recallId('keysig', C),
      recallId('spell', C),
      recallId('relative', C),
      recallId('thumb', C),
    ])
    expect(ofKind(steps, 'chords').map((s) => s.itemId)).toEqual([chordsId(C)])
    expect(itemIds(steps).every((id) => id.endsWith(':C:major'))).toBe(true)
  })

  it('5 min (one scale slot): no new scale while a due scale fills it', () => {
    const items = allSolid()
    set(items, scaleId(G), { introduced: false })
    expect(scaleRefs(buildSession(items, withMinutes(5), TODAY))).toEqual([C])
  })

  it('10 min with unknowns: one slot reserved for a new scale → 1 due + 1 new (R20)', () => {
    const items = allSolid()
    const F: ScaleRef = { root: 'F', form: 'major' }
    set(items, scaleId(F), { introduced: false })
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(scaleRefs(steps)).toEqual([C, F])
    expect(ofKind(steps, 'scale')[1]?.itemId).toBe(scaleId(F))
  })

  it('still at most one new scale per session, at every length (R20)', () => {
    const refs = enabledScales(DEFAULT_SETTINGS)
    const choices: Record<string, Placement> = Object.fromEntries(
      refs.map((r, i) => [scaleId(r), (i % 2 === 0 ? 'solid' : 'unknown') as Placement]),
    )
    const items = placeItems(choices, DEFAULT_SETTINGS, PLACED)
    for (const min of [10, 15, 20] as const) {
      const steps = ofKind(buildSession(items, withMinutes(min), TODAY), 'scale')
      expect(steps).toHaveLength(SESSION_SIZES[min].scales)
      expect(steps.filter((s) => !items[s.itemId]?.introduced)).toHaveLength(1)
    }
  })

  it('a reserved slot no new scale can take (shared root) goes back to due scales (R20)', () => {
    const settings: Settings = { ...withMinutes(10), minorForms: { natural: true, harmonic: true, melodic: false } }
    const items = allSolid(settings)
    const Ah: ScaleRef = { root: 'A', form: 'harmonic' }
    set(items, scaleId(Ah), { introduced: false })
    set(items, scaleId(A), { box: 1 }) // A major leads, so A harmonic can't join it
    expect(scaleRefs(buildSession(items, settings, TODAY))).toEqual([A, C])
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
      expect(deckCards(steps)).toHaveLength(SESSION_SIZES[min].cards)
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
    expect(deckCards(steps)).toHaveLength(10)
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

describe('buildSession: the warm-up deck (phase 3 §5.1)', () => {
  it('6 recall picks → exactly one deck step, right after the ear round, holding the same 6 ids in the old order', () => {
    const steps = buildSession(allSolid(), withMinutes(10), TODAY)
    const decks = ofKind(steps, 'deck')
    expect(decks).toHaveLength(1)
    expect(steps[3]).toBe(decks[0])
    expect(steps[4]?.kind).toBe('scale')
    // The order the phase-2 builder produced as six recall steps.
    expect(decks[0]?.cards.map((c) => c.itemId)).toEqual([
      'recall:keysig:C:major',
      'recall:spell:C:major',
      'recall:relative:C:major',
      'recall:thumb:C:major',
      'recall:keysig:G:major',
      'recall:spell:G:major',
    ])
    expect(steps.some((s) => (s.kind as string) === 'recall')).toBe(false)
  })

  it('no recall picks → no deck step', () => {
    const items = allSolid()
    for (const id of Object.keys(items)) {
      if (id.startsWith('recall:')) items[id] = applyRating(items[id] as ItemState, 'nailed', TODAY)
    }
    const steps = buildSession(items, withMinutes(10), TODAY)
    expect(steps.length).toBeGreaterThan(0)
    expect(ofKind(steps, 'deck')).toEqual([])
    expect(steps.slice(0, 4).map((s) => s.kind)).toEqual(['drill', 'staff', 'ear', 'scale'])
  })
})

describe('buildSession: the name-that-key drill (phase 3 §6.1)', () => {
  it('the drill step is first, once', () => {
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(allSolid(), withMinutes(min), TODAY)
      expect(steps[0]?.kind).toBe('drill')
      expect(ofKind(steps, 'drill')).toHaveLength(1)
    }
  })

  it('8 questions at 10 minutes and up, 4 at 5 minutes', () => {
    expect(buildSession(allSolid(), withMinutes(5), TODAY)[0]).toEqual({ kind: 'drill', count: 4 })
    for (const min of [10, 15, 20] as const) {
      expect(buildSession(allSolid(), withMinutes(min), TODAY)[0]).toEqual({ kind: 'drill', count: 8 })
    }
  })

  it('every scale rated today → [] (a drill alone never makes a session)', () => {
    let state: AppState = { ...emptyState(), items: allSolid() }
    for (const ref of enabledScales(DEFAULT_SETTINGS)) state = rateItem(state, scaleId(ref), 'nailed', TODAY)
    expect(buildSession(state.items, DEFAULT_SETTINGS, TODAY)).toEqual([])
  })
})

describe('buildSession: the staff round (phase 4 §5.1, Review Focus 5)', () => {
  it('5 min: drill 4, then staff 3', () => {
    const steps = buildSession(allSolid(), withMinutes(5), TODAY)
    expect(steps.slice(0, 2)).toEqual([
      { kind: 'drill', count: 4 },
      { kind: 'staff', count: 3 },
    ])
  })

  it('10, 15 and 20 min: staff 6, once, right after the drill', () => {
    for (const min of [10, 15, 20] as const) {
      const steps = buildSession(allSolid(), withMinutes(min), TODAY)
      expect(steps[1]).toEqual({ kind: 'staff', count: 6 })
      expect(ofKind(steps, 'staff')).toHaveLength(1)
    }
  })

  it('every scale rated today → [] (neither round makes a session alone)', () => {
    let state: AppState = { ...emptyState(), items: allSolid() }
    for (const ref of enabledScales(DEFAULT_SETTINGS)) state = rateItem(state, scaleId(ref), 'nailed', TODAY)
    expect(buildSession(state.items, DEFAULT_SETTINGS, TODAY)).toEqual([])
  })
})

describe('estimateSeconds', () => {
  it('counts 15 s per deck card, as it did per recall step, and 7 s per drill question', () => {
    for (const min of [5, 10, 15, 20] as const) {
      const steps = buildSession(allSolid(), withMinutes(min), TODAY)
      const size = SESSION_SIZES[min]
      expect(estimateSeconds(steps)).toBe(
        size.keys * 7 +
          size.staff * 8 +
          size.ear * 10 +
          deckCards(steps).length * 15 +
          size.scales * 180 +
          ofKind(steps, 'chords').length * 90 +
          size.freeplaySeconds,
      )
      expect(deckCards(steps)).toHaveLength(size.cards)
    }
  })

  it('default session = 8×7 + 6×8 + 4×10 + 6×15 + 2×180 + 1×90', () => {
    expect(estimateSeconds(buildSession(allSolid(), DEFAULT_SETTINGS, TODAY))).toBe(8 * 7 + 6 * 8 + 4 * 10 + 6 * 15 + 2 * 180 + 1 * 90)
  })

  it('20 min session adds free play seconds', () => {
    expect(estimateSeconds(buildSession(allSolid(), withMinutes(20), TODAY))).toBe(8 * 7 + 6 * 8 + 4 * 10 + 10 * 15 + 4 * 180 + 2 * 90 + 120)
  })

  it('a drill of 8 adds 56 s', () => {
    expect(estimateSeconds([{ kind: 'drill', count: 8 }])).toBe(56)
  })

  it('a staff round of 6 adds 48 s', () => {
    expect(estimateSeconds([{ kind: 'staff', count: 6 }])).toBe(48)
  })

  it('empty → 0', () => {
    expect(estimateSeconds([])).toBe(0)
  })
})

describe('buildSession: the ear round (phase 5 §5.1)', () => {
  it('10 min: drill, staff, ear (4, the first scale root), then the deck', () => {
    const steps = buildSession(allSolid(), withMinutes(10), TODAY)
    const first = ofKind(steps, 'scale')[0]
    expect(steps.slice(0, 3)).toEqual([
      { kind: 'drill', count: 8 },
      { kind: 'staff', count: 6 },
      { kind: 'ear', count: 4, root: first?.ref.root },
    ])
    expect(first?.ref.root).toBe('C')
    expect(steps[3]?.kind).toBe('deck')
    expect(ofKind(steps, 'ear')).toHaveLength(1)
  })

  it('5 min: ear 2; 15 and 20 min: ear 4', () => {
    expect(ofKind(buildSession(allSolid(), withMinutes(5), TODAY), 'ear')).toEqual([{ kind: 'ear', count: 2, root: 'C' }])
    for (const min of [15, 20] as const) {
      expect(ofKind(buildSession(allSolid(), withMinutes(min), TODAY), 'ear').map((s) => s.count)).toEqual([4])
    }
    expect([5, 10, 15, 20].map((m) => SESSION_SIZES[m as 5 | 10 | 15 | 20].ear)).toEqual([2, 4, 4, 4])
  })

  it('the root follows the first scale step (G when C was rated today)', () => {
    let state: AppState = { ...emptyState(), items: allSolid() }
    state = rateItem(state, scaleId(C), 'nailed', TODAY)
    const steps = buildSession(state.items, withMinutes(10), TODAY)
    const first = ofKind(steps, 'scale')[0]
    expect(ofKind(steps, 'ear')[0]?.root).toBe(first?.ref.root)
    expect(first?.ref.root).not.toBe('C')
  })

  it('estimateSeconds adds 40 for ear 4', () => {
    expect(estimateSeconds([{ kind: 'ear', count: 4, root: 'C' }])).toBe(40)
  })

  it('every scale rated today → [] (an ear round alone never makes a session)', () => {
    let state: AppState = { ...emptyState(), items: allSolid() }
    for (const ref of enabledScales(DEFAULT_SETTINGS)) state = rateItem(state, scaleId(ref), 'nailed', TODAY)
    for (const min of [5, 10, 15, 20] as const) expect(buildSession(state.items, withMinutes(min), TODAY)).toEqual([])
  })
})
