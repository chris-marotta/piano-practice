// Pure view helpers for the name-that-key round (DrillRound), shared by the session and Play. No Preact, no window.
import { isCorrect, type DrillDef, type Given, type Question, type Verdict } from '../../drill/engine'
import { DRILL_ADVANCE_GUARD_MS } from '../../play/thresholds'
import { keyName, landmarkRoute, routeText } from '../../theory/keyNames'
import type { KeyMark } from './keyboardLayout'

/** The drill keyboard: C3 to B4, two octaves (spec §6.2). */
export const DRILL_LOW = 48
export const DRILL_HIGH = 71

export const NEXT_LABEL = 'Next'
/** Beside Next on a played question: the key moves on too (advancesOnKey). */
export const AGAIN_HINT = 'or play it again'

const pcOf = (midi: number): number => ((midi % 12) + 12) % 12
const isLandmark = (midi: number): boolean => pcOf(midi) === 0 || pcOf(midi) === 5

/**
 * One question's answer. Only the first answer counts: `answer` leaves an answered state as it is.
 * `given` is what the player gave; `verdict` is the def's judgement of it, `correct` that verdict under the
 * exact-octave setting, which is kept (`exactOctave`) so the why line agrees with the verdict even if the toggle changes.
 */
export type AnswerState =
  | { answered: false }
  | { answered: true; verdict: Verdict; correct: boolean; given: Given; ms: number; exactOctave: boolean }

/** What a speed-level timeout gives: nothing, never right. */
export const TIMED_OUT: Given = { kind: 'timeout' }

/**
 * Every tap, name pick, note and timeout goes through here, judged by the def.
 * Once answered, the same state comes back (a double tap, keys tapped after answering, a late MIDI note).
 */
export function answer(
  s: AnswerState,
  q: Question,
  given: Given,
  ms: number,
  def: DrillDef,
  exactOctave: boolean,
): AnswerState {
  if (s.answered) return s
  const verdict = def.judge(q, given)
  return { answered: true, verdict, correct: isCorrect(verdict, exactOctave), given, ms, exactOctave }
}

/** The speed level's per-question limit in ms (the def's fastMs), or null below it (and null throughout when the def is untimed, fastMs null). DrillRound's timer reads this. */
export function timeLimit(def: DrillDef, level: number): number | null {
  return level === def.levelCount ? def.fastMs : null
}

/** The key a tap or note gave (null for a name pick or a timeout). */
export function givenMidi(given: Given): number | null {
  return given.kind === 'key' ? given.midi : null
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
/**
 * Play it again for Next: once a key question is answered, the key you played (or, after a miss or a timeout, the
 * right key), in any octave, moves on, so your hands stay on the keys. Not inside the guard right after the answer,
 * so a doubled note-on doesn't skip the why line. Name questions are answered on screen and keep the button.
 */
export function advancesOnKey(q: Question, s: AnswerState, midi: number, msSinceAnswer: number): boolean {
  if (!s.answered || q.format === 'name' || msSinceAnswer < DRILL_ADVANCE_GUARD_MS) return false
  const played = givenMidi(s.given)
  return pcOf(midi) === q.pc || (played !== null && pcOf(played) === pcOf(midi))
}

export function belongsToQuestion(at: number, startedAt: number): boolean {
  return at >= startedAt
}

/**
 * Where a sound prompt stands (DrillRound with `ui.startQuestion`): 'waiting' until the note's onset, 'ready' from it,
 * 'silent' when no sound played. 'none' is a UI without `startQuestion` (Keys, Staff): the clock starts as before.
 */
export type PromptState = 'none' | 'waiting' | 'ready' | 'silent'

/** A sound question's clock starts at the note's onset; with no sound it never starts, so nothing answers it. */
export function clockStart(onset: number | null): number {
  return onset ?? Infinity
}

/** A prompt's promise counts only for the call it was made for: an older token (Next or a retry since) is dropped. */
export function acceptsPrompt(token: number, current: number): boolean {
  return token === current
}

/** The wait from `now` until `at` (both performance.now() ms), never negative: an onset already past is ready at once. */
export function msUntil(at: number, now: number): number {
  return Math.max(0, at - now)
}

/** Waiting for the sound or no sound: the name buttons wait (aria-disabled) and the prompt can be re-run (retry). */
export function promptPending(p: PromptState): boolean {
  return p === 'waiting' || p === 'silent'
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

/** The Keys question line (copy verbatim from the plan's globals). */
export function promptText(q: Question): string {
  if (q.format === 'name') return 'Which key is this?'
  if (q.format === 'tap') return `Tap ${keyName(q.pc)}`
  return `Play ${keyName(q.pc)} on your piano`
}

/** The chip beside a 'play' prompt. */
export function listeningText(device: string): string {
  return `● Listening: ${device}`
}

/** The Keys why line after an answer; a wrong 'play' first names what was played. */
export function whyText(q: Question, s: AnswerState): string {
  const route = routeText(q.pc)
  if (q.format === 'play' && s.answered && !s.correct && s.given.kind === 'key') {
    return `You played ${keyName(((s.given.midi % 12) + 12) % 12)}. ${route}`
  }
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
export function raisedLevel(level: number, lastLevel: number): number {
  return Math.max(level, lastLevel)
}

/** The button under an answer: Next, and on the last question the caller's finish label. */
export function nextLabel(index: number, total: number, finishLabel: string): string {
  return index >= total - 1 ? finishLabel : NEXT_LABEL
}
