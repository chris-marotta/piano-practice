// Pure view helpers for the Ear drill: the one-octave board, its marks, the context line, the prompt and the why line. No Preact.
import type { Question } from '../../drill/engine'
import { EAR_DEGREES, degreeOf, earRoute, earSpelling, earTarget, isEarDegree, type EarDegree } from '../../theory/ear'
import { formatNote } from '../../theory/format'
import { givenMidi, type AnswerState } from './drillView'
import type { KeyMark } from './keyboardLayout'

const INFO = new Map(EAR_DEGREES.map((d) => [d.degree, d]))
const info = (d: EarDegree) => INFO.get(d) as (typeof EAR_DEGREES)[number]

/** The question's degree; an ear question always carries one (`1` keeps a malformed one from throwing). */
const degreeOfQ = (q: Question): EarDegree => (q.ear && isEarDegree(q.ear.degree) ? q.ear.degree : '1')

/** The tap board: the tonic to the tonic above, 13 keys (spec §4.3). */
export function earBoard(q: Question): { low: number; high: number } {
  const tonic = q.ear?.tonic ?? 60
  return { low: tonic, high: tonic + 12 }
}

/**
 * The octave of `midi` on the board nearest to it (a Roli shifted to C1 or C7 still lands on the 13 keys). `avoid`
 * (the green target) stays free when another octave of the same note is on the board: only the tonic has two.
 */
function fold(midi: number, board: { low: number; high: number }, avoid: number): number {
  const options: number[] = []
  for (let m = board.low; m <= board.high; m++) if ((((m - midi) % 12) + 12) % 12 === 0) options.push(m)
  const free = options.filter((m) => m !== avoid)
  const pool = free.length > 0 ? free : options
  return pool.reduce((best, m) => (Math.abs(m - midi) < Math.abs(best - midi) ? m : best), pool[0] as number)
}

/**
 * The board's marks. Before an answer: only the two root dots. After it: the route (the major steps from the tonic up
 * to the note) neutral, both tonics with the root dot, the target green, and a wrong key red, folded onto the board.
 * Separate marks per key (as in Keys), so a route tonic keeps its neutral fill under the dot.
 */
export function earAnswerMarks(q: Question, ans: AnswerState): KeyMark[] {
  const ear = q.ear
  if (!ear) return []
  const board = earBoard(q)
  const roots: KeyMark[] = [
    { midi: board.low, hand: 'none', root: true },
    { midi: board.high, hand: 'none', root: true },
  ]
  if (!ans.answered) return roots
  const marks: KeyMark[] = earRoute(ear.tonic, degreeOfQ(q)).map((midi) => ({ midi, hand: 'none' }))
  marks.push({ midi: ear.target, hand: 'none', state: 'good' })
  const played = givenMidi(ans.given)
  if (played !== null && !ans.correct) {
    const shown = fold(played, board, ear.target)
    if (shown !== ear.target) marks.push({ midi: shown, hand: 'none', state: 'bad' })
  }
  return [...marks, ...roots]
}

/** The line above the question: the key, and what the prompt plays (copy verbatim, plan globals). */
export function contextLine(q: Question, first: boolean): string {
  const root = formatNote(q.ear?.root ?? 'C')
  if (q.ear && !q.ear.withTonic) return first ? `This is home: ${root} · then the note` : `Key of ${root} · the note`
  return `Key of ${root} · tonic, then the note`
}

export function earPromptText(q: Question): string {
  if (q.format === 'name') return 'Which degree?'
  if (q.format === 'tap') return 'Find it on the keys'
  return 'Play it on your piano'
}

const COUNT_WORDS = ['', 'one', 'two', 'three']

/** "one octave", "two octaves" (the number past three). */
function octaves(k: number): string {
  return `${COUNT_WORDS[k] ?? String(k)} octave${k === 1 ? '' : 's'}`
}

/**
 * The why line: degree and note, the half-steps, and how it feels; on a miss, what was given first; in another octave,
 * how far (its lead follows the exact-octave setting the answer was judged with).
 */
export function earWhyText(q: Question, ans: AnswerState): string {
  const ear = q.ear
  if (!ear) return ''
  const degree = degreeOfQ(q)
  const d = info(degree)
  const root = formatNote(ear.root)
  const note = formatNote(earSpelling(ear.root, degree))
  const steps = d.semis === 1 ? '1 half-step up' : `${d.semis} half-steps up`
  const base = degree === '1' ? `${root} is home, an octave up. ${d.feel}` : `${note} is the ${d.whyName} of ${root}: ${steps}. ${d.feel}`
  if (!ans.answered) return base
  const played = givenMidi(ans.given)
  if (ans.verdict === 'otherOctave' && played !== null) {
    const k = Math.round(Math.abs(played - ear.target) / 12)
    const where = `${octaves(k)} ${played < ear.target ? 'below' : 'above'} the one asked. `
    return `${ans.exactOctave ? 'Wrong octave: ' : 'Right note, '}${where}${base}`
  }
  if (ans.verdict === 'wrong' && played !== null) {
    const g = degreeOf(ear.tonic, played)
    return `You played ${formatNote(earSpelling(ear.root, g))} (the ${info(g).label}). ${base}`
  }
  if (ans.verdict === 'wrong' && ans.given.kind === 'choice' && isEarDegree(ans.given.value)) {
    return `You picked ${info(ans.given.value).label}. ${base}`
  }
  return base
}

/** The note Compare plays as "yours": the key given, or for a wrong name pick that degree's note; else null. */
export function earGiven(q: Question, ans: AnswerState): number | null {
  if (!ans.answered || !q.ear) return null
  const played = givenMidi(ans.given)
  if (played !== null) return played
  if (ans.given.kind === 'choice' && isEarDegree(ans.given.value)) return earTarget(q.ear.tonic, ans.given.value)
  return null
}
