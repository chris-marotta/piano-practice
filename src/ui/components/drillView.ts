// Pure view helpers for the name-that-key round (DrillRound), shared by the session and Play. No Preact, no window.
import type { Question } from '../../drill/engine'
import { KEYS_DEF } from '../../drill/keys'
import { keyName, landmarkRoute, routeText } from '../../theory/keyNames'
import type { KeyMark } from './keyboardLayout'

/** The drill keyboard: C3 to B4, two octaves (spec §6.2). */
export const DRILL_LOW = 48
export const DRILL_HIGH = 71

/** The line under each ladder step's name (copy from the plan's globals). */
export const LEVEL_HINTS = KEYS_DEF.levelHints as Record<1 | 2 | 3 | 4, string>

export const NEXT_LABEL = 'Next'

const pcOf = (midi: number): number => ((midi % 12) + 12) % 12
const isLandmark = (midi: number): boolean => pcOf(midi) === 0 || pcOf(midi) === 5

/**
 * One question's answer. Only the first answer counts: `answer` leaves an answered state as it is.
 * `pc` is what was given (null on a timeout); `midi` the key tapped or played (null for a name pick or a timeout).
 */
export type AnswerState =
  | { answered: false }
  | { answered: true; correct: boolean; pc: number | null; midi: number | null; ms: number }

/** What a level-4 timeout gives: no key, never right. */
export const TIMED_OUT = { pc: null, midi: null } as const

/**
 * Every tap, name pick, note and timeout goes through here. Any octave of the asked pitch class is right.
 * Once answered, the same state comes back (a double tap, keys tapped after answering, a late MIDI note).
 */
export function answer(
  s: AnswerState,
  q: Question,
  given: { pc: number | null; midi: number | null },
  ms: number,
): AnswerState {
  if (s.answered) return s
  return { answered: true, correct: given.pc === q.pc, pc: given.pc, midi: given.midi, ms }
}

/** The octave of `midi` that falls on the drill keyboard (a Roli has more keys than the screen shows). */
function onBoard(midi: number): number {
  let m = midi
  while (m < DRILL_LOW) m += 12
  while (m > DRILL_HIGH) m -= 12
  return m
}

/** Where to show the right key: the key itself when right, else the asked key's octave nearest the wrong pick. */
function shownTarget(q: Question, picked: number | null, correct: boolean): number {
  if (picked === null) return q.midi
  if (correct) return picked
  const low = DRILL_LOW + pcOf(q.pc - DRILL_LOW)
  const options = [low, low + 12]
  return options.reduce((best, m) => (Math.abs(m - picked) < Math.abs(best - picked) ? m : best))
}

/**
 * The keyboard after an answer: the right key green, a wrong pick red, and the landmark route lit (neutral, labelled),
 * with the root dot on the landmark when the route starts at C or F (ASSUMED: a black key's white neighbour is not a
 * landmark, so it gets no dot). `answeredMidi` is null for a name pick or a timeout.
 */
/**
 * True when an event (stamped `at`, in the performance.now() timebase) happened at or after the current question
 * began (`startedAt`). One stamped earlier belongs to the previous question and must not answer this one.
 */
export function belongsToQuestion(at: number, startedAt: number): boolean {
  return at >= startedAt
}

export function answerMarks(q: Question, answeredMidi: number | null, correct: boolean): KeyMark[] {
  const picked = answeredMidi === null ? null : onBoard(answeredMidi)
  const target = shownTarget(q, picked, correct)
  const name = (midi: number): string => keyName(pcOf(midi))
  const marks: KeyMark[] = [{ midi: target, hand: 'none', state: 'good', label: name(target) }]
  if (picked !== null && !correct) marks.push({ midi: picked, hand: 'none', state: 'bad', label: name(picked) })
  const route = landmarkRoute(target)
  for (const midi of route) if (midi !== target) marks.push({ midi, hand: 'none', label: name(midi) })
  const start = route[0]
  if (start !== undefined && isLandmark(start)) marks.push({ midi: start, hand: 'none', root: true })
  return marks
}

/** The question line (copy verbatim from the plan's globals). */
export function promptText(q: Question): string {
  if (q.format === 'name') return 'Which key is this?'
  if (q.format === 'tap') return `Tap ${keyName(q.pc)}`
  return `Play ${keyName(q.pc)} on your piano`
}

/** The chip beside a 'play' prompt. */
export function listeningText(device: string): string {
  return `● Listening: ${device}`
}

/** The why line after an answer; a wrong 'play' first names what was played. */
export function whyText(q: Question, s: AnswerState): string {
  const route = routeText(q.pc)
  if (q.format === 'play' && s.answered && !s.correct && s.pc !== null) return `You played ${keyName(s.pc)}. ${route}`
  return route
}

/**
 * "Level {n} unlocked" shows when the level is above the highest one reached before. drillLevel never returns less
 * than that, so this is true exactly when the boxes alone have unlocked a new level.
 */
export function levelRose(level: number, lastLevel: number): boolean {
  return level > lastLevel
}

/** The highest level reached, to store as `lastDrillLevel`: it only ever rises. */
export function raisedLevel(level: 1 | 2 | 3 | 4, lastLevel: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  return Math.max(level, lastLevel) as 1 | 2 | 3 | 4
}

/** The button under an answer: Next, and on the last question the caller's finish label. */
export function nextLabel(index: number, total: number, finishLabel: string): string {
  return index >= total - 1 ? finishLabel : NEXT_LABEL
}
