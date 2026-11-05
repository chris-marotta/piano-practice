// The shared drill engine: which items to ask, in what order and format, and how answers become ratings. Pure.
// A drill (Keys, Staff) supplies a DrillDef; everything else here is the same for both.
import { stateFor } from '../srs/items'
import type { Settings } from '../srs/items'
import type { ItemState, Rating } from '../srs/scheduler'

export type DrillFormat = 'name' | 'tap' | 'play'
export type Verdict = 'right' | 'otherOctave' | 'wrong'
/** Local until the staff theory module (src/theory/staff.ts) defines it. */
export type Clef = 'treble' | 'bass'

/** What the player gave: a name pick, a key (tapped or played), or nothing before the clock ran out. */
export type Given = { kind: 'choice'; value: string } | { kind: 'key'; midi: number } | { kind: 'timeout' }

export interface Choice {
  value: string
  label: string
}

export interface Question {
  itemId: string
  pc: number
  midi: number
  format: DrillFormat
  /** The right choice's value (Keys: the ASCII pitch-class name). */
  answer: string
  /** Options to pick from; only on 'name' questions. */
  choices?: Choice[]
  /** A practice-only copy of a missed question. Never graded. */
  repeat: boolean
  staff?: { clef: Clef; note: string }
}

export interface DrillDef {
  kind: 'keys' | 'staff'
  /** Levels 1..levelCount; the last is speed and adds no items. */
  levelCount: number
  /** The item ids introduced at level `n` (1..levelCount-1). */
  levelItems(n: number): string[]
  levelNames: Record<number, string>
  levelHints: Record<number, string>
  levelSetting: 'lastDrillLevel' | 'lastStaffLevel'
  slowMs: number
  fastMs: number
  /**
   * Tie-break among due items (and among not-yet-due items) after box and due date. Defaults to the item's
   * position in the pool (level order). Keys supplies the pitch class, so its order matches phase 3 exactly.
   */
  tieOrder?(itemId: string): number
  buildQuestion(itemId: string, format: DrillFormat, rng: () => number, prevMidi?: number): Question
  judge(q: Question, given: Given): Verdict
}

/** A key counts as known for unlocking the next level at this Leitner box or higher. */
export const DRILL_LEVEL_UNLOCK_BOX = 3

/** Right is right; the right letter in another octave counts only when the exact octave is not required. */
export function isCorrect(verdict: Verdict, exactOctave: boolean): boolean {
  return verdict === 'right' || (verdict === 'otherOctave' && !exactOctave)
}

/** The stored level reached for this drill. Settings without the field (before the drill existed) read as 1. */
function reachedLevel(def: DrillDef, settings: Settings): number {
  return (settings as unknown as Record<string, number | undefined>)[def.levelSetting] ?? 1
}

/**
 * The highest unlocked level. Level n+1 unlocks when every item of levels 1..n is at box 3 or more; the speed level
 * unlocks when all of them are. An item with no stored state is at box 1.
 * Levels are sticky (ruling R-T11d): never below the stored level reached, so one lost item doesn't shrink the pool.
 */
export function drillLevel(def: DrillDef, items: Record<string, ItemState>, today: string, settings: Settings): number {
  const known = (id: string): boolean => stateFor(id, items, today, settings).box >= DRILL_LEVEL_UNLOCK_BOX
  let level = 1
  for (let n = 1; n < def.levelCount; n++) {
    if (!def.levelItems(n).every(known)) break
    level = n + 1
  }
  return Math.max(level, reachedLevel(def, settings))
}

/** The items in play at `level`, in level order. The speed level draws on the pool of the level before it. */
function poolFor(def: DrillDef, level: number): string[] {
  const pool: string[] = []
  for (let n = 1; n <= Math.min(level, def.levelCount - 1); n++) pool.push(...def.levelItems(n))
  return pool
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Pool order: due introduced items (box asc, due asc, tie order), then items not yet introduced (level order),
 * then the rest by soonest due. An item with no stored state counts as not introduced.
 */
function orderPool(def: DrillDef, pool: string[], items: Record<string, ItemState>, today: string, settings: Settings): string[] {
  const rows = pool.map((id, position) => ({ id, position, tie: def.tieOrder?.(id) ?? position, s: stateFor(id, items, today, settings) }))
  const dueNow = rows
    .filter((r) => r.s.introduced && r.s.due <= today)
    .sort((a, b) => a.s.box - b.s.box || cmp(a.s.due, b.s.due) || a.tie - b.tie)
  const fresh = rows.filter((r) => !r.s.introduced).sort((a, b) => a.position - b.position)
  const rest = rows
    .filter((r) => r.s.introduced && r.s.due > today)
    .sort((a, b) => cmp(a.s.due, b.s.due) || a.tie - b.tie)
  return [...dueNow, ...fresh, ...rest].map((r) => r.id)
}

/**
 * One round of `count` questions from the items unlocked at the current level (the speed level uses the pool of the
 * level before it). When the pool is smaller than `count` it cycles. Formats alternate per item (spec §3.4): an
 * item's first appearance is 'name' when its place in the pool order is even, else 'tap', and each later appearance
 * flips that item's previous format. With `midi` every format is 'play'. Deterministic for a given `rng`.
 */
export function buildRound(
  def: DrillDef,
  items: Record<string, ItemState>,
  today: string,
  settings: Settings,
  opts: { count: number; midi: boolean; rng: () => number },
): Question[] {
  const level = drillLevel(def, items, today, settings)
  const order = orderPool(def, poolFor(def, level), items, today, settings)
  const lastMidi = new Map<string, number>()
  const lastFormat = new Map<string, 'name' | 'tap'>()
  const round: Question[] = []
  for (let i = 0; i < opts.count; i++) {
    const index = i % order.length
    const id = order[index] as string
    let format: DrillFormat = 'play'
    if (!opts.midi) {
      const prev = lastFormat.get(id)
      const next: 'name' | 'tap' = prev === undefined ? (index % 2 === 0 ? 'name' : 'tap') : prev === 'name' ? 'tap' : 'name'
      lastFormat.set(id, next)
      format = next
    }
    const question = def.buildQuestion(id, format, opts.rng, lastMidi.get(id))
    lastMidi.set(id, question.midi)
    round.push(question)
  }
  return round
}

/**
 * Appends a practice-only copy of the missed question. At most one repeat per item: a missed repeat,
 * an item that already has one, or an index outside the round leaves the round as it is.
 */
export function withRepeat(round: Question[], missedIndex: number): Question[] {
  const missed = round[missedIndex]
  if (missed === undefined || missed.repeat) return round
  if (round.some((q) => q.repeat && q.itemId === missed.itemId)) return round
  return [...round, { ...missed, repeat: true }]
}

/** Wrong is lost. At the speed level anything past the fast limit is lost too. Right but past the slow limit is shaky. */
export function gradeAnswer(def: DrillDef, correct: boolean, ms: number, level: number): Rating {
  if (!correct) return 'lost'
  if (level === def.levelCount && ms > def.fastMs) return 'lost'
  if (ms > def.slowMs) return 'shaky'
  return 'nailed'
}

/**
 * Whether an answer should move the item's box. Repeats never do. In a session an item is graded once a day
 * (the caller also grades only an item's first answer in the round). In Play only misses and due items are graded,
 * so a Play round plus a session can't move an item up two boxes in one day.
 */
export function shouldGrade(
  q: Question,
  state: ItemState,
  today: string,
  where: 'session' | 'play',
  correct: boolean,
): boolean {
  if (q.repeat) return false
  if (where === 'session') return !state.history.some((h) => h.date === today)
  return !correct || state.due <= today
}

/**
 * The rating for one answer in a round, or null when it earns none: a practice repeat, an item already answered
 * earlier in this round (`seen` holds the first-answered item ids and is added to here), or one `shouldGrade` skips.
 * Shared by the session's drill and Play so both grade the same way.
 */
export function gradeFirstAnswer(
  def: DrillDef,
  q: Question,
  seen: Set<string>,
  state: ItemState,
  today: string,
  where: 'session' | 'play',
  correct: boolean,
  ms: number,
  level: number,
): Rating | null {
  if (q.repeat || seen.has(q.itemId)) return null
  seen.add(q.itemId)
  return shouldGrade(q, state, today, where, correct) ? gradeAnswer(def, correct, ms, level) : null
}
