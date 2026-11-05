// The UI side of a drill: what DrillRound shows around the shared round logic. A DrillDef says what to ask and how to
// judge; a DrillUi says how to draw it (Keys: a lit key and a keyboard; Staff: a staff and a keyboard).
import type { ComponentChildren } from 'preact'
import type { Question } from '../../drill/engine'
import type { AnswerState } from './drillView'

export interface DrillUi {
  /** The small label above the question ("NAME THAT KEY"). */
  kicker: string
  /** The question line as plain text. */
  promptText(q: Question): string
  /**
   * The question itself: the prompt for Keys, the staff and prompt for Staff. With `choicesInAsk`, a name question's
   * answer buttons arrive here as `choices` and the Ask places them; otherwise DrillRound puts them under the keyboard.
   */
  Ask(p: { q: Question; ans: AnswerState; choices?: ComponentChildren }): ComponentChildren
  /** Staff: the name choices go in the ask row beside the staff, so a name question fits the iPad screen. */
  choicesInAsk?: boolean
  /** The keyboard with its marks; `onKey` is set when keys can answer (tap and play questions). */
  Board(p: { q: Question; ans: AnswerState; onKey?: (midi: number) => void }): ComponentChildren
  /** The why line after an answer. Keys ignores `exactOctave`. */
  whyText(q: Question, ans: AnswerState, exactOctave: boolean): string
}
