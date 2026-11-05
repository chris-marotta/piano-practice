import type { Question } from '../../drill/engine'
import { keyName } from '../../theory/keyNames'
import type { DrillUi } from './drillUi'
import {
  DRILL_HIGH,
  DRILL_LOW,
  answerMarks,
  givenMidi,
  promptText,
  whyText,
  type AnswerState,
} from './drillView'
import { Keyboard, type KeyMark } from './Keyboard'

/** Room for the black keys to be tapped on a two-octave keyboard (white keys up to 72 px). */
const DRILL_KEY_PX = 72

/** The prompt with the key's name in the accent colour ("Tap **A**"). */
function Prompt({ q }: { q: Question }) {
  const text = promptText(q)
  const name = keyName(q.pc)
  const at = q.format === 'name' ? -1 : text.indexOf(name)
  return (
    <h1 class="drill__prompt">
      {at < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <span class="drill__name">{name}</span>
          {text.slice(at + name.length)}
        </>
      )}
    </h1>
  )
}

function Board({ q, ans, onKey }: { q: Question; ans: AnswerState; onKey?: (midi: number) => void }) {
  const marks: KeyMark[] = ans.answered
    ? answerMarks(q, givenMidi(ans.given), ans.correct)
    : q.format === 'name'
      ? [{ midi: q.midi, hand: 'none' }]
      : []
  return (
    <Keyboard
      low={DRILL_LOW}
      high={DRILL_HIGH}
      marks={marks}
      maxKeyPx={DRILL_KEY_PX}
      {...(onKey ? { onKeyTap: onKey } : {})}
    />
  )
}

/** The Keys drill's rendering: the prompt with the key name lit, and the two-octave keyboard (spec §6.2). */
export const KEYS_UI: DrillUi = {
  kicker: 'NAME THAT KEY',
  promptText,
  Ask: Prompt,
  Board,
  whyText: (q, ans) => whyText(q, ans),
}
