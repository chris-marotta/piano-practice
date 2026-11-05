// The Staff drill's definition: which staff notes are in play per level, and how a staff question is built and judged. Pure.
import { STAFF_FAST_MS, STAFF_SLOW_MS } from '../play/thresholds'
import { parseStaffId, staffId } from '../srs/items'
import { formatNote } from '../theory/format'
import { chroma, noteMidi } from '../theory/scales'
import { STAFF_LEVEL_NOTES, staffChoices } from '../theory/staff'
import type { DrillDef, DrillFormat, Given, Question, Verdict } from './engine'

export const STAFF_LEVEL_NAMES: Record<number, string> = {
  1: 'Landmarks',
  2: 'Treble staff',
  3: 'Bass staff',
  4: 'Ledger lines',
  5: 'Sharps & flats',
  6: 'Speed',
}

export const STAFF_LEVEL_HINTS: Record<number, string> = {
  1: 'Middle C, treble G, bass F',
  2: 'Lines and spaces, treble',
  3: 'Lines and spaces, bass',
  4: 'Above and below the staff',
  5: '♯ and ♭ on the staff',
  6: '4 seconds a note',
}

/** A staff item has one fixed note, so `prevMidi` is ignored. Choices only on 'name' questions. */
function buildQuestion(itemId: string, format: DrillFormat, rng: () => number): Question {
  const parsed = parseStaffId(itemId)
  if (parsed === null) throw new Error(`Not a staff item id: "${itemId}"`)
  const { clef, note } = parsed
  const question: Question = {
    itemId,
    pc: chroma(note),
    midi: noteMidi(note),
    format,
    answer: note.replace(/-?\d+$/, ''),
    repeat: false,
    staff: { clef, note },
  }
  if (format === 'name') {
    question.choices = staffChoices(note, clef, rng).map((value) => ({ value, label: formatNote(value) }))
  }
  return question
}

/** A name pick is right by spelling (F♯ for a G♭ is wrong). A key is right by pitch; another octave is 'otherOctave'. */
function judge(q: Question, given: Given): Verdict {
  if (given.kind === 'timeout') return 'wrong'
  if (given.kind === 'choice') return given.value === q.answer ? 'right' : 'wrong'
  if ((((given.midi % 12) + 12) % 12) !== q.pc) return 'wrong'
  return given.midi === q.midi ? 'right' : 'otherOctave'
}

export const STAFF_DEF: DrillDef = {
  kind: 'staff',
  levelCount: 6,
  levelItems: (n) => (STAFF_LEVEL_NOTES[n as 1 | 2 | 3 | 4 | 5] ?? []).map((s) => staffId(s.clef, s.note)),
  levelNames: STAFF_LEVEL_NAMES,
  levelHints: STAFF_LEVEL_HINTS,
  levelSetting: 'lastStaffLevel',
  slowMs: STAFF_SLOW_MS,
  fastMs: STAFF_FAST_MS,
  buildQuestion,
  judge,
}
