// The Keys drill's definition: which keys are in play per level, and how a key question is built and judged. Pure.
import { DRILL_FAST_MS, DRILL_SLOW_MS } from '../play/thresholds'
import { keyId } from '../srs/items'
import { PC_ASCII, keyLabel, nearbyChoices } from '../theory/keyNames'
import type { DrillDef, DrillFormat, Given, Question, Verdict } from './engine'

/** Pitch classes by level. Level 4 (Speed) uses all of them, so it has no keys of its own. */
export const LEVEL_KEYS: Record<1 | 2 | 3, number[]> = {
  1: [0, 5],
  2: [2, 4, 7, 9, 11],
  3: [1, 3, 6, 8, 10],
}

export const LEVEL_NAMES: Record<1 | 2 | 3 | 4, string> = {
  1: 'Landmarks',
  2: 'White keys',
  3: 'Black keys',
  4: 'Speed',
}

/** The line under each ladder step's name (copy from the plan's globals). */
const LEVEL_HINTS: Record<1 | 2 | 3 | 4, string> = {
  1: 'C and F',
  2: 'D E G A B',
  3: '♯ and ♭ names',
  4: '3 seconds a key',
}

/** The lowest and highest MIDI note a question may use (C3 to B4). Each pitch class has two octaves in range. */
const MIDI_LOW = 48

const pcOfItem = (itemId: string): number => PC_ASCII.indexOf(itemId.slice(4))

/** The two MIDI notes of `pc` within 48-71, lowest first. */
function octavesOf(pc: number): [number, number] {
  const low = MIDI_LOW + (((pc - MIDI_LOW) % 12) + 12) % 12
  return [low, low + 12]
}

function buildQuestion(itemId: string, format: DrillFormat, rng: () => number, prevMidi?: number): Question {
  const pc = pcOfItem(itemId)
  const [low, high] = octavesOf(pc)
  const midi = prevMidi !== undefined ? (prevMidi === low ? high : low) : rng() < 0.5 ? low : high
  const question: Question = { itemId, pc, midi, format, answer: PC_ASCII[pc] as string, repeat: false }
  if (format === 'name') {
    question.choices = nearbyChoices(pc, rng).map((c) => ({ value: PC_ASCII[c] as string, label: keyLabel(c) }))
  }
  return question
}

/** Any octave of the asked pitch class is right; a timeout never is. */
function judge(q: Question, given: Given): Verdict {
  if (given.kind === 'timeout') return 'wrong'
  if (given.kind === 'choice') return given.value === q.answer ? 'right' : 'wrong'
  return ((given.midi % 12) + 12) % 12 === q.pc ? 'right' : 'wrong'
}

export const KEYS_DEF: DrillDef = {
  kind: 'keys',
  levelCount: 4,
  levelItems: (n) => (LEVEL_KEYS[n as 1 | 2 | 3] ?? []).map(keyId),
  levelNames: LEVEL_NAMES,
  levelHints: LEVEL_HINTS,
  levelSetting: 'lastDrillLevel',
  slowMs: DRILL_SLOW_MS,
  fastMs: DRILL_FAST_MS,
  tieOrder: pcOfItem,
  buildQuestion,
  judge,
}
