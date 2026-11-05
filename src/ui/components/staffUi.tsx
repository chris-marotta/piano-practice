import type { ComponentChildren } from 'preact'
import type { Question } from '../../drill/engine'
import type { DrillUi } from './drillUi'
import type { AnswerState } from './drillView'
import { Keyboard } from './Keyboard'
import { Staff } from './Staff'
import { STAFF_WINDOWS, staffAnswerMarks, staffNotes, staffWhyText } from './staffDrillView'

/**
 * The widest a white key may grow. A window is 19 white keys; what binds is the keyboard's height cap in drill.css
 * (measured at 1180x820: 53.5 px white keys in a session, 46.5 px in Play), not this.
 */
const STAFF_KEY_PX = 72

function promptText(q: Question): string {
  if (q.format === 'name') return 'Which note is this?'
  if (q.format === 'tap') return 'Tap this note'
  return 'Play this note on your piano'
}

function Ask({ q, ans, choices }: { q: Question; ans: AnswerState; choices?: ComponentChildren }) {
  if (!q.staff) return null
  return (
    <div class="staff-ask">
      <div class="staff-ask__side">
        <h1 class="drill__prompt">{promptText(q)}</h1>
        {choices}
      </div>
      <Staff
        clef={q.staff.clef}
        size="drill"
        notes={staffNotes(q, ans)}
        label={`One note on the ${q.staff.clef} staff`}
      />
    </div>
  )
}

function Board({ q, ans, onKey }: { q: Question; ans: AnswerState; onKey?: (midi: number) => void }) {
  const win = STAFF_WINDOWS[q.staff?.clef ?? 'treble']
  return (
    <div class="staff-board">
      <Keyboard
        low={win.low}
        high={win.high}
        marks={staffAnswerMarks(q, ans)}
        maxKeyPx={STAFF_KEY_PX}
        {...(onKey ? { onKeyTap: onKey } : {})}
      />
    </div>
  )
}

/** The Staff drill's rendering: the staff with its prompt, and the keyboard window for the clef (spec §4). */
export const STAFF_UI: DrillUi = {
  kicker: 'READ THE NOTE',
  promptText,
  Ask,
  choicesInAsk: true,
  Board,
  whyText: staffWhyText,
}
