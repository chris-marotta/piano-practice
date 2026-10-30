// Drill rounds: which keys to ask, in what order and format, and how answers become ratings. Pure.
import { DRILL_FAST_MS, DRILL_SLOW_MS } from '../play/thresholds'
import { keyId, stateFor } from '../srs/items'
import type { Settings } from '../srs/items'
import type { ItemState, Rating } from '../srs/scheduler'
import { nearbyChoices } from '../theory/keyNames'
import { LEVEL_KEYS, drillLevel } from './levels'

export type DrillFormat = 'name' | 'tap' | 'play'

export interface Question {
  itemId: string
  pc: number
  midi: number
  format: DrillFormat
  /** Pitch classes to pick from; only on 'name' questions. */
  choices?: number[]
  /** A practice-only copy of a missed question. Never graded. */
  repeat: boolean
}

/** The lowest and highest MIDI note a question may use (C3 to B4). Each pitch class has two octaves in range. */
const MIDI_LOW = 48
const MIDI_HIGH = 71

/** The keys in play at `level`, in level order then pc. Level 4 draws on the level-3 pool, which is all 12. */
function poolFor(level: 1 | 2 | 3 | 4): number[] {
  const pool: number[] = []
  for (const n of [1, 2, 3] as const) if (n <= level) pool.push(...LEVEL_KEYS[n])
  return pool
}

/**
 * Pool order: due introduced keys (box asc, due asc, pc), then keys not yet introduced (level order, then pc),
 * then the rest by soonest due. A key with no stored state counts as not introduced.
 */
function orderPool(pool: number[], items: Record<string, ItemState>, today: string, settings: Settings): number[] {
  const rows = pool.map((pc, position) => ({ pc, position, s: stateFor(keyId(pc), items, today, settings) }))
  const dueNow = rows
    .filter((r) => r.s.introduced && r.s.due <= today)
    .sort((a, b) => a.s.box - b.s.box || cmp(a.s.due, b.s.due) || a.pc - b.pc)
  const fresh = rows.filter((r) => !r.s.introduced).sort((a, b) => a.position - b.position)
  const rest = rows
    .filter((r) => r.s.introduced && r.s.due > today)
    .sort((a, b) => cmp(a.s.due, b.s.due) || a.pc - b.pc)
  return [...dueNow, ...fresh, ...rest].map((r) => r.pc)
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The two MIDI notes of `pc` within 48-71, lowest first. */
function octavesOf(pc: number): [number, number] {
  const low = MIDI_LOW + ((pc - MIDI_LOW) % 12 + 12) % 12
  return [low, low + 12]
}

/**
 * One round of `count` questions from the keys unlocked at the current level (never above 3: level 4 is the
 * same keys, graded on speed). When the pool is smaller than `count` it cycles, and a key's repeat uses the
 * other octave from that key's previous question. Deterministic for a given `rng`.
 */
export function buildRound(
  items: Record<string, ItemState>,
  today: string,
  settings: Settings,
  opts: { count: number; midi: boolean; rng: () => number },
): Question[] {
  const level = Math.min(drillLevel(items, today, settings), 3) as 1 | 2 | 3
  const order = orderPool(poolFor(level), items, today, settings)
  const lastMidi = new Map<number, number>()
  const round: Question[] = []
  for (let i = 0; i < opts.count; i++) {
    const pc = order[i % order.length] as number
    const [low, high] = octavesOf(pc)
    const prev = lastMidi.get(pc)
    const midi = prev !== undefined ? (prev === low ? high : low) : opts.rng() < 0.5 ? low : high
    lastMidi.set(pc, midi)
    const format: DrillFormat = opts.midi ? 'play' : i % 2 === 0 ? 'name' : 'tap'
    const question: Question = { itemId: keyId(pc), pc, midi, format, repeat: false }
    if (format === 'name') question.choices = nearbyChoices(pc, opts.rng)
    round.push(question)
  }
  return round
}

/**
 * Appends a practice-only copy of the missed question. At most one repeat per key: a missed repeat,
 * a key that already has one, or an index outside the round leaves the round as it is.
 */
export function withRepeat(round: Question[], missedIndex: number): Question[] {
  const missed = round[missedIndex]
  if (missed === undefined || missed.repeat) return round
  if (round.some((q) => q.repeat && q.itemId === missed.itemId)) return round
  return [...round, { ...missed, repeat: true }]
}

/** Wrong is lost. At level 4 anything past the fast limit is lost too. Right but past the slow limit is shaky. */
export function gradeAnswer(correct: boolean, ms: number, level: 1 | 2 | 3 | 4): Rating {
  if (!correct) return 'lost'
  if (level === 4 && ms > DRILL_FAST_MS) return 'lost'
  if (ms > DRILL_SLOW_MS) return 'shaky'
  return 'nailed'
}

/**
 * Whether an answer should move the key's box. Repeats never do. In a session a key is graded once a day
 * (the caller also grades only a key's first answer in the round). In Play only misses and due keys are graded,
 * so a Play round plus a session can't move a key up two boxes in one day.
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
