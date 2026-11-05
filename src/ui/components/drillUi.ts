// The UI side of a drill: what DrillRound shows around the shared round logic. A DrillDef says what to ask and how to
// judge; a DrillUi says how to draw it (Keys: a lit key and a keyboard; Staff: a staff and a keyboard).
import type { ComponentChildren } from 'preact'
import type { Question } from '../../drill/engine'
import type { AnswerState, PromptState } from './drillView'

export interface DrillUi {
  /** The small label above the question ("NAME THAT KEY"). */
  kicker: string
  /** The question line as plain text. */
  promptText(q: Question): string
  /**
   * The question itself: the prompt for Keys, the staff and prompt for Staff. With `choicesInAsk`, a name question's
   * answer buttons arrive here as `choices` and the Ask places them; otherwise DrillRound puts them under the keyboard.
   */
  Ask(p: {
    q: Question
    ans: AnswerState
    choices?: ComponentChildren
    /** Where the sound prompt stands ('none' without `startQuestion`). Keys and Staff ignore it. */
    prompt: PromptState
    /** Re-run the prompt (new sound, clock from its onset), only while it is 'waiting' or 'silent'; else nothing. */
    retry: () => void
    /** The round's first question (Ear level 6 says "This is home" only then). */
    first: boolean
    /** The drilled level. */
    level: number
  }): ComponentChildren
  /** Staff: the name choices go in the ask row beside the staff, so a name question fits the iPad screen. */
  choicesInAsk?: boolean
  /** The keyboard with its marks; `onKey` is set when keys can answer (tap and play questions). */
  Board(p: { q: Question; ans: AnswerState; onKey?: (midi: number) => void }): ComponentChildren
  /** The why line after an answer (Staff reads the exact-octave setting the answer was judged with, from `ans`). */
  whyText(q: Question, ans: AnswerState): string
  /**
   * A sound prompt (Ear): plays the question and resolves to its note's onset in performance.now() ms, or null when
   * no sound played. With it, the question's clock starts at the onset, and nothing answers before it.
   */
  startQuestion?(q: Question, opts: { first: boolean; level: number }): Promise<number | null>
  /** Once per question, right after its first answer is set. */
  onAnswered?(q: Question, ans: AnswerState): void
  /** On Next and on unmount (may come twice at the end of a round): stop what the question is playing. */
  onLeave?(): void
}
