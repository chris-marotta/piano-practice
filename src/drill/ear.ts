// The Ear drill's definition: which scale degrees are in play per level, and how an ear question is built and judged. Pure.
import { EAR_SLOW_MS } from '../play/thresholds'
import { earId, parseEarId } from '../srs/items'
import {
  EAR_DEGREES,
  EAR_KEY_LEVEL,
  EAR_LEVEL_DEGREES,
  earChoices,
  earSpelling,
  earTarget,
  earTonicMidi,
} from '../theory/ear'
import type { EarDegree } from '../theory/ear'
import { formatNote } from '../theory/format'
import type { DrillDef, DrillFormat, Given, Question, QuestionContext, Verdict } from './engine'

export const EAR_LEVEL_NAMES: Record<number, string> = {
  1: 'Home and five',
  2: 'Third and fourth',
  3: 'Every major step',
  4: 'Minor colours',
  5: 'Outside notes',
  6: 'Key once',
}

export const EAR_LEVEL_HINTS: Record<number, string> = {
  1: '1 and 5',
  2: '3 and 4',
  3: '2, 6 and 7',
  4: '♭3 ♭6 ♭7, your key',
  5: '♭2 and ♯4',
  6: 'Home once a round',
}

const LEVEL_ONE = EAR_LEVEL_DEGREES[1].map(earId)
const SEMIS = new Map(EAR_DEGREES.map((d) => [d.degree, d.semis]))
const LABEL = new Map(EAR_DEGREES.map((d) => [d.degree, d.label]))

/** The key a round at `level` is drilled in: C below EAR_KEY_LEVEL, else the round's tonic (C when none). */
export function earRoot(level: number, tonic?: string): string {
  return level >= EAR_KEY_LEVEL ? (tonic ?? 'C') : 'C'
}

/** Without a `ctx` the question is level 1 in C. Levels below EAR_KEY_LEVEL stay in C whatever the round's tonic. */
function buildQuestion(itemId: string, format: DrillFormat, rng: () => number, _prevMidi?: number, ctx?: QuestionContext): Question {
  const degree = parseEarId(itemId)
  if (degree === null) throw new Error(`Not an ear item id: "${itemId}"`)
  const level = ctx?.level ?? 1
  const root = earRoot(level, ctx?.tonic)
  const tonic = earTonicMidi(root)
  const target = earTarget(tonic, degree)
  const question: Question = {
    itemId,
    pc: target % 12,
    midi: target,
    format,
    answer: degree,
    repeat: false,
    ear: { root, tonic, target, degree, withTonic: level < 6 },
  }
  if (format === 'name') {
    const poolDegrees = (ctx?.pool ?? LEVEL_ONE).map(parseEarId).filter((d): d is EarDegree => d !== null)
    question.choices = earChoices(degree, poolDegrees, rng).map((d) => ({
      value: d,
      label: LABEL.get(d) as string,
      sub: formatNote(earSpelling(root, d)),
    }))
  }
  return question
}

/** A name pick is right by degree. A key is right by pitch; another octave is 'otherOctave' (same rule as Staff). */
function judge(q: Question, given: Given): Verdict {
  if (given.kind === 'timeout') return 'wrong'
  if (given.kind === 'choice') return given.value === q.answer ? 'right' : 'wrong'
  if ((((given.midi % 12) + 12) % 12) !== q.pc) return 'wrong'
  return given.midi === q.midi ? 'right' : 'otherOctave'
}

export const EAR_DEF: DrillDef = {
  kind: 'ear',
  levelCount: 6,
  levelItems: (n) => (EAR_LEVEL_DEGREES[n as 1 | 2 | 3 | 4 | 5] ?? []).map(earId),
  levelNames: EAR_LEVEL_NAMES,
  levelHints: EAR_LEVEL_HINTS,
  levelSetting: 'lastEarLevel',
  slowMs: EAR_SLOW_MS,
  fastMs: null,
  tieOrder: (id) => {
    const d = parseEarId(id)
    return d === null ? 0 : (SEMIS.get(d) as number)
  },
  buildQuestion,
  judge,
}
