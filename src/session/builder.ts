import { enabledScales, idsForScale, parseId, stateFor } from '../srs/items'
import type { Settings } from '../srs/items'
import type { ItemState } from '../srs/scheduler'
import { progression } from '../theory/chords'
import type { DiatonicChord } from '../theory/chords'
import { recallCard } from '../theory/recall'
import type { RecallCard, RecallType } from '../theory/recall'
import type { ScaleRef } from '../theory/scales'

export type Step =
  /** The warm-up: every recall card picked today, in pick order, as one flip deck. Each card is rated on its own id. */
  | { kind: 'deck'; cards: { itemId: string; card: RecallCard }[] }
  | { kind: 'scale'; itemId: string; ref: ScaleRef; support: 0 | 1 | 2 | 3; tempo: number }
  | { kind: 'chords'; itemId: string; ref: ScaleRef; chords: DiatonicChord[]; includeInversions: boolean }
  | { kind: 'freeplay'; ref: ScaleRef; seconds: number }

export const SESSION_SIZES: Record<5 | 10 | 15 | 20, { cards: number; scales: number; chordSets: number; freeplaySeconds: number }> = {
  5: { cards: 4, scales: 1, chordSets: 1, freeplaySeconds: 0 },
  10: { cards: 6, scales: 2, chordSets: 1, freeplaySeconds: 0 },
  15: { cards: 8, scales: 3, chordSets: 2, freeplaySeconds: 0 },
  20: { cards: 10, scales: 4, chordSets: 2, freeplaySeconds: 120 },
}

// ASSUMED estimates (spec §4.5).
const RECALL_SECONDS = 15
const SCALE_SECONDS = 180
const CHORDS_SECONDS = 90

interface Candidate {
  id: string
  ref: ScaleRef
  state: ItemState
  /** Catalog position: the tie-breaker everywhere. */
  order: number
}

interface RecallCandidate extends Candidate {
  recallType: RecallType
}

const refKey = (ref: ScaleRef): string => `${ref.root}:${ref.form}`

/**
 * Today's practice steps. Pure and deterministic: candidates come only from the
 * enabled catalog (stored keys are never iterated or parsed), anything rated
 * today is excluded from every pool, and ties break by catalog order.
 *
 * Returns [] exactly when every enabled scale has been rated today (a scale not
 * rated today is always pickable). Recall cards alone never make a session.
 */
export function buildSession(items: Record<string, ItemState>, settings: Settings, today: string): Step[] {
  const size = SESSION_SIZES[settings.sessionMinutes]

  // 1–2. Candidates from enabled scales only, minus anything rated today.
  const scalePool: Candidate[] = []
  const recallPool: RecallCandidate[] = []
  const chordPool: Candidate[] = []
  let order = 0
  for (const ref of enabledScales(settings)) {
    for (const id of idsForScale(ref)) {
      const state = stateFor(id, items, today, settings)
      const c: Candidate = { id, ref, state, order: order++ }
      if (state.history[state.history.length - 1]?.date === today) continue
      const parsed = parseId(id) // our own generated id, never a stored key
      if (parsed.kind === 'scale') scalePool.push(c)
      else if (parsed.kind === 'chords') chordPool.push(c)
      else if (parsed.recallType) recallPool.push({ ...c, recallType: parsed.recallType })
    }
  }

  // 3. Due = introduced and due on or before today. Weakest first (ruling R19): lowest box,
  //    then most overdue, then catalog, so a Lost scale (box 1, due tomorrow) is back the next
  //    day ahead of stronger scales that have waited longer. The not-yet-due fill stays
  //    next-soonest (due date, then box, then catalog).
  const isDue = (c: Candidate): boolean => c.state.introduced && c.state.due <= today
  const notYetDue = (c: Candidate): boolean => c.state.introduced && c.state.due > today
  const byDue = (a: Candidate, b: Candidate): number =>
    a.state.box - b.state.box || (a.state.due < b.state.due ? -1 : a.state.due > b.state.due ? 1 : a.order - b.order)
  const bySoonest = (a: Candidate, b: Candidate): number =>
    a.state.due < b.state.due ? -1 : a.state.due > b.state.due ? 1 : a.state.box - b.state.box || a.order - b.order

  // 4. Scales, distinct roots throughout, at most one new scale (ruling R20):
  //    with 2+ slots and a new scale waiting, one slot is held for it and due scales fill the
  //    rest; with 1 slot the new scale comes only when nothing is due. A held slot no new scale
  //    can take (shared root) goes back to due scales, then to the next-soonest introduced.
  const chosen: Candidate[] = []
  const roots = new Set<string>()
  const pick = (limit: number) => (c: Candidate): void => {
    if (chosen.length >= limit || roots.has(c.ref.root)) return
    chosen.push(c)
    roots.add(c.ref.root)
  }
  const dueScales = scalePool.filter(isDue).sort(byDue)
  const hasNew = scalePool.some((c) => !c.state.introduced)
  const dueLimit = hasNew && size.scales >= 2 ? size.scales - 1 : size.scales
  dueScales.forEach(pick(dueLimit))
  if (chosen.length < size.scales) {
    const newScale = scalePool.find((c) => !c.state.introduced && !roots.has(c.ref.root))
    if (newScale) pick(size.scales)(newScale)
  }
  dueScales.forEach(pick(size.scales))
  scalePool.filter(notYetDue).sort(bySoonest).forEach(pick(size.scales))
  if (chosen.length === 0) return []

  // 5. Chord sets: chosen scales' chord items, scale order, due ones first; take M.
  const chordFor = new Map(chordPool.map((c) => [refKey(c.ref), c]))
  const todayChords = chosen.flatMap((s) => chordFor.get(refKey(s.ref)) ?? [])
  const chordPicks = [...todayChords.filter(isDue), ...todayChords.filter((c) => !isDue(c))].slice(0, size.chordSets)
  const chosenChords = new Map(chordPicks.map((c) => [refKey(c.ref), c]))

  // 6. Recall (ruling R12), take K:
  //    (1) today's scales (exact root+form): due introduced cards (byDue), then never-introduced cards (catalog);
  //    (2) other due introduced cards (byDue);
  //    (3) next-soonest introduced cards (bySoonest).
  //    Never-introduced cards enter only through (1), so a scale's cards get introduced the
  //    next time that scale is practised, and cards of scales not in today's session stay out.
  const todayKeys = new Set(chosen.map((s) => refKey(s.ref)))
  const isToday = (c: Candidate): boolean => todayKeys.has(refKey(c.ref))
  const dueRecall = recallPool.filter(isDue).sort(byDue)
  const recallPicks = [
    ...dueRecall.filter(isToday),
    ...recallPool.filter((c) => isToday(c) && !c.state.introduced),
    ...dueRecall.filter((c) => !isToday(c)),
    ...recallPool.filter(notYetDue).sort(bySoonest),
  ].slice(0, size.cards)

  // 7. Order: the deck (today's recall cards, when there are any) → each scale followed by its chord set → free play.
  const steps: Step[] = []
  if (recallPicks.length > 0) {
    steps.push({ kind: 'deck', cards: recallPicks.map((c) => ({ itemId: c.id, card: recallCard(c.recallType, c.ref) })) })
  }
  for (const s of chosen) {
    steps.push({
      kind: 'scale',
      itemId: s.id,
      ref: s.ref,
      support: s.state.support,
      tempo: s.state.tempo ?? settings.startTempo,
    })
    const ch = chosenChords.get(refKey(s.ref))
    if (ch) {
      steps.push({
        kind: 'chords',
        itemId: ch.id,
        ref: ch.ref,
        chords: progression(ch.ref),
        includeInversions: ch.state.box >= 3,
      })
    }
  }
  const first = chosen[0]
  if (size.freeplaySeconds > 0 && first) steps.push({ kind: 'freeplay', ref: first.ref, seconds: size.freeplaySeconds })

  return steps
}

export function estimateSeconds(steps: Step[]): number {
  let total = 0
  for (const s of steps) {
    if (s.kind === 'deck') total += RECALL_SECONDS * s.cards.length
    else if (s.kind === 'scale') total += SCALE_SECONDS
    else if (s.kind === 'chords') total += CHORDS_SECONDS
    else total += s.seconds
  }
  return total
}
