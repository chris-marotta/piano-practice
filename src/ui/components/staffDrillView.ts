// Pure view helpers for the Staff drill: the keyboard windows, the key marks, the staff marks and the why line. No Preact.
import type { Question } from '../../drill/engine'
import { formatNote } from '../../theory/format'
import { midiToName, noteMidi } from '../../theory/scales'
import { octaveHint, routeText, staffRoute, type Clef } from '../../theory/staff'
import { givenMidi, type AnswerState } from './drillView'
import type { KeyMark } from './keyboardLayout'
import type { StaffNote } from './Staff'

/** The keyboard per clef, starting on a landmark: treble F3–C6, bass C2–E4 (spec §4.2). */
export const STAFF_WINDOWS: Record<Clef, { low: number; high: number }> = {
  treble: { low: 53, high: 84 },
  bass: { low: 36, high: 64 },
}

const MIDDLE_C = 60

/**
 * The octave of `midi` that falls inside the window and is nearest to it (a Roli has more keys than the screen shows).
 * `avoid` is a key that must stay free (the green target) when another octave of the same note is in the window.
 */
function fold(midi: number, win: { low: number; high: number }, avoid?: number): number {
  const options: number[] = []
  for (let m = win.low; m <= win.high; m++) if ((((m - midi) % 12) + 12) % 12 === 0) options.push(m)
  const free = options.filter((m) => m !== avoid)
  const pool = free.length > 0 ? free : options
  return pool.reduce((best, m) => (Math.abs(m - midi) < Math.abs(best - midi) ? m : best), pool[0] as number)
}

const letterOf = (note: string): string => note.replace(/-?\d+$/, '')

/**
 * The keyboard: before an answer only the middle C dot; after it, the target green, a wrong key red (folded into the
 * window), and the route from the landmark lit as labelled white keys. Middle C always keeps `root`.
 */
export function staffAnswerMarks(q: Question, ans: AnswerState): KeyMark[] {
  const marks = new Map<number, KeyMark>()
  const put = (m: KeyMark): void => {
    marks.set(m.midi, { ...marks.get(m.midi), ...m })
  }
  const staff = q.staff
  if (ans.answered && staff) {
    const win = STAFF_WINDOWS[staff.clef]
    const { steps } = staffRoute(staff.note, staff.clef)
    for (const step of steps.slice(0, -1)) {
      const midi = noteMidi(step)
      if (midi >= win.low && midi <= win.high) put({ midi, hand: 'none', label: letterOf(step) })
    }
    const lastStep = steps[steps.length - 1]
    if (lastStep && q.midi !== noteMidi(lastStep)) {
      // An accidental target: its natural letter is a route key too, beside the black key.
      put({ midi: noteMidi(lastStep), hand: 'none', label: letterOf(lastStep) })
    }
    put({ midi: q.midi, hand: 'none', state: 'good', label: formatNote(letterOf(staff.note)) })
    const played = givenMidi(ans.given)
    if (played !== null && !ans.correct) {
      const shown = fold(played, win, q.midi)
      if (shown !== q.midi) put({ midi: shown, hand: 'none', state: 'bad', label: formatNote(letterOf(midiToName(played, '#'))) })
    }
  }
  put({ midi: MIDDLE_C, hand: 'none', root: true })
  return [...marks.values()]
}

/**
 * The staff's notes: the target alone before an answer; after it the route (ghost), the landmark and the target.
 * The route runs left to right, one beat per step (neighbouring noteheads would overlap in one column), and the target
 * waits at the route's last beat from the start, so it does not move when the answer arrives.
 */
export function staffNotes(q: Question, ans: AnswerState): StaffNote[] {
  const staff = q.staff
  if (!staff) return []
  const accidental = /^[A-G](#{1,2}|b{1,2})/.exec(staff.note)?.[1]
  const { steps } = staffRoute(staff.note, staff.clef)
  const last = steps.length - 1
  const target = (mark: StaffNote['mark']): StaffNote => ({
    note: staff.note,
    clef: staff.clef,
    mark,
    ...(last > 0 ? { beat: last } : {}),
    ...(accidental ? { accidental: accidental as StaffNote['accidental'] } : {}),
  })
  if (!ans.answered) return [target('plain')]
  const lead: StaffNote[] = steps.slice(0, -1).map((note, i) => ({
    note,
    clef: staff.clef,
    mark: i === 0 ? 'landmark' : 'ghost',
    beat: i,
  }))
  return [...lead, target(ans.correct ? 'right' : 'wrong')]
}

/** The why line: "You played D4." first for a wrong key, the octave hint for the right letter in another octave, then the route. */
export function staffWhyText(q: Question, ans: AnswerState, exactOctave: boolean): string {
  const staff = q.staff
  if (!staff) return ''
  const route = routeText(staff.note, staff.clef)
  if (!ans.answered) return route
  const played = givenMidi(ans.given)
  if (ans.verdict === 'otherOctave' && played !== null) return `${octaveHint(staff.note, played, exactOctave)} ${route}`
  if (ans.verdict === 'wrong' && played !== null) return `You played ${formatNote(midiToName(played, '#'))}. ${route}`
  return route
}
