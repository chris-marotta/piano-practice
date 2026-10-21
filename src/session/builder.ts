import { enabledScales, idsForScale, parseId, stateFor } from '../srs/items'
import type { Settings } from '../srs/items'
import type { ItemState } from '../srs/scheduler'
import { progression } from '../theory/chords'
import type { DiatonicChord } from '../theory/chords'
import { recallCard } from '../theory/recall'
import type { RecallCard, RecallType } from '../theory/recall'
import type { ScaleRef } from '../theory/scales'

export type Step =
  | { kind: 'recall'; itemId: string; card: RecallCard }
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
  kind: 'scale' | 'recall' | 'chords'
  ref: ScaleRef
  recallType?: RecallType
  state: ItemState
  /** Catalog position: the tie-breaker everywhere. */
  order: number
}

const refKey = (ref: ScaleRef): string => `${ref.root}:${ref.form}`

/**
 * Today's practice steps. Pure and deterministic: candidates come only from the
 * enabled catalog (stored keys are never iterated or parsed), anything rated
 * today is excluded from every pool, and ties break by catalog order.
 */
export function buildSession(items: Record<string, ItemState>, settings: Settings, today: string): Step[] {
  const size = SESSION_SIZES[settings.sessionMinutes]

  // 1–2. Candidates from enabled scales only, minus anything rated today.
  const candidates: Candidate[] = []
  for (const ref of enabledScales(settings)) {
    for (const id of idsForScale(ref)) {
      const state = stateFor(id, items, today, settings)
      if (state.history[state.history.length - 1]?.date === today) continue
      const { kind, recallType } = parseId(id) // our own generated id, never a stored key
      candidates.push({ id, kind, ref, recallType, state, order: candidates.length })
    }
  }

  // 3. Due = introduced and due on or before today; most overdue, then lowest box, then catalog.
  const isDue = (c: Candidate): boolean => c.state.introduced && c.state.due <= today
  const notYetDue = (c: Candidate): boolean => c.state.introduced && c.state.due > today
  const byDue = (a: Candidate, b: Candidate): number =>
    a.state.due < b.state.due ? -1 : a.state.due > b.state.due ? 1 : a.state.box - b.state.box || a.order - b.order
  const ofKind = (kind: Candidate['kind']): Candidate[] => candidates.filter((c) => c.kind === kind)

  // 4. Scales: due with distinct roots → at most one new scale → next-soonest introduced.
  const scalePool = ofKind('scale')
  const chosen: Candidate[] = []
  const roots = new Set<string>()
  const pick = (c: Candidate): void => {
    if (chosen.length >= size.scales || roots.has(c.ref.root)) return
    chosen.push(c)
    roots.add(c.ref.root)
  }
  scalePool.filter(isDue).sort(byDue).forEach(pick)
  let newScale: Candidate | undefined
  if (chosen.length < size.scales) {
    newScale = scalePool.find((c) => !c.state.introduced && !roots.has(c.ref.root))
    if (newScale) pick(newScale)
  }
  if (chosen.length < size.scales) scalePool.filter(notYetDue).sort(byDue).forEach(pick)

  // 5. Chord sets: chosen scales' chord items, scale order, due ones first; take M.
  const chordFor = new Map(ofKind('chords').map((c) => [refKey(c.ref), c]))
  const chordPool = chosen.flatMap((s) => chordFor.get(refKey(s.ref)) ?? [])
  const chordPicks = [...chordPool.filter(isDue), ...chordPool.filter((c) => !isDue(c))].slice(0, size.chordSets)
  const chosenChords = new Map(chordPicks.map((c) => [refKey(c.ref), c]))

  // 6. Recall: due on today's scales → other due → the new scale's cards → next-soonest; take K.
  const recallPool = ofKind('recall')
  const todayKeys = new Set(chosen.map((s) => refKey(s.ref)))
  const dueRecall = recallPool.filter(isDue).sort(byDue)
  const newKey = newScale ? refKey(newScale.ref) : undefined
  const recallPicks = [
    ...dueRecall.filter((c) => todayKeys.has(refKey(c.ref))),
    ...dueRecall.filter((c) => !todayKeys.has(refKey(c.ref))),
    ...recallPool.filter((c) => !c.state.introduced && refKey(c.ref) === newKey),
    ...recallPool.filter(notYetDue).sort(byDue),
  ].slice(0, size.cards)

  // 7. Order: recall → each scale followed by its chord set → free play.
  const steps: Step[] = recallPicks.map((c) => ({
    kind: 'recall',
    itemId: c.id,
    card: recallCard(c.recallType as RecallType, c.ref),
  }))
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
    if (s.kind === 'recall') total += RECALL_SECONDS
    else if (s.kind === 'scale') total += SCALE_SECONDS
    else if (s.kind === 'chords') total += CHORDS_SECONDS
    else total += s.seconds
  }
  return total
}
