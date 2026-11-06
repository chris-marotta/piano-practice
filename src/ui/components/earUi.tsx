import { useEffect, useRef, useState } from 'preact/hooks'
import { playCompare, playEarPrompt, playHome, playWalk, stopEar } from '../../audio/ear'
import { loadPiano } from '../../audio/piano'
import { audioReady, unlockAudio } from '../../audio/unlock'
import type { Question } from '../../drill/engine'
import { isEarDegree } from '../../theory/ear'
import type { DrillUi } from './drillUi'
import type { AnswerState, PromptState } from './drillView'
import { contextLine, earAnswerMarks, earBoard, earGiven, earPromptText, earWhyText } from './earDrillView'
import { Keyboard } from './Keyboard'

/** One octave (8 white keys): let the keys grow big on the iPad; the drill board's height cap binds first. */
const EAR_KEY_PX = 96

export const HEAR_AGAIN_LABEL = '▶ Hear it again'
export const HEAR_HOME_LABEL = 'Hear home'
export const TAP_TO_HEAR_LABEL = 'Tap to hear'
export const COMPARE_LABEL = 'Compare'
export const RETRY_LABEL = 'Retry'
export const NOT_READY_TEXT = "The piano sound isn't ready."

/**
 * The question's own prompt again (tonic and note at L1–5, the note alone at L6; never "This is home").
 * `current` says whether `q` is still on screen: Next (or the round's end) inside the unlock's await drops the replay,
 * so the old question's prompt never plays over the new one.
 */
function replay(q: Question, current: () => boolean): void {
  const ear = q.ear
  if (!ear) return
  void (async () => {
    try {
      if (!audioReady.value) await unlockAudio() // an iPad interruption suspended the context: this tap brings it back
      if (!current()) return
      await playEarPrompt({ tonic: ear.tonic, target: ear.target, withTonic: ear.withTonic, home: false })
    } catch {
      // ear audio never throws into the UI
    }
  })()
}

function hearHome(q: Question, current: () => boolean): void {
  const ear = q.ear
  if (!ear) return
  void (async () => {
    try {
      if (!audioReady.value) await unlockAudio()
      if (!current()) return
      playHome(ear.tonic)
    } catch {
      // never throws into the UI
    }
  })()
}

interface AskProps {
  q: Question
  ans: AnswerState
  prompt: PromptState
  retry: () => void
  first: boolean
  level: number
}

/** The sound buttons, the key and what plays, and the question line (spec §4.1, §4.6). */
function Ask({ q, ans, prompt, retry, first, level }: AskProps) {
  // Between the "Tap to hear" tap and the new prompt: keep the button (not the not-ready line) while the piano loads.
  const [starting, setStarting] = useState(false)
  // Silent because audio was locked: "Tap to hear" stays until it is tapped. The pointerdown of that very tap can unlock
  // audio first (the app-wide unlock listener, with a keyboard connected), and the button must not turn into the
  // not-ready line under the finger before its click lands. Cleared once the prompt runs again.
  const locked = useRef(false)
  // The question on screen (null once the round is gone), for the replays that await an unlock first.
  const shown = useRef<Question | null>(q)
  shown.current = q
  useEffect(
    () => () => {
      shown.current = null
    },
    [],
  )
  const isShown = () => shown.current === q
  const ready = audioReady.value
  if (prompt !== 'silent') locked.current = false
  else if (!ready) locked.current = true
  const ear = q.ear
  if (!ear) return null

  const tapToHear = async () => {
    if (starting) return
    setStarting(true)
    try {
      await unlockAudio()
      await loadPiano()
    } finally {
      setStarting(false)
      retry()
    }
  }
  const retryLoad = async () => {
    await loadPiano()
    retry()
  }
  const hearAgain = () => {
    if (prompt === 'waiting') retry()
    else replay(q, isShown)
  }
  const given = earGiven(q, ans)
  const compare = ans.answered && !ans.correct && given !== null

  let sound
  if (prompt === 'silent' && (locked.current || starting)) {
    sound = (
      <button type="button" class="btn btn--primary btn--lg ear-ask__hear" aria-disabled={starting} onClick={tapToHear}>
        {TAP_TO_HEAR_LABEL}
      </button>
    )
  } else if (prompt === 'silent') {
    sound = (
      <>
        <p class="ear-ask__notready" role="status">
          {NOT_READY_TEXT}
        </p>
        <button type="button" class="btn btn--lg" onClick={retryLoad}>
          {RETRY_LABEL}
        </button>
      </>
    )
  } else {
    sound = (
      <>
        <button type="button" class="btn btn--primary btn--lg ear-ask__hear" onClick={hearAgain}>
          {HEAR_AGAIN_LABEL}
        </button>
        {/* Only from the onset: before it, playing home would cut the prompt's note while the clock still starts there. */}
        {level === 6 && (
          <button
            type="button"
            class="btn btn--lg ear-ask__home"
            aria-disabled={prompt !== 'ready'}
            onClick={() => {
              if (prompt === 'ready') hearHome(q, isShown)
            }}
          >
            {HEAR_HOME_LABEL}
          </button>
        )}
        {compare && (
          <button type="button" class="btn btn--lg" onClick={() => playCompare(ear.tonic, ear.target, given)}>
            {COMPARE_LABEL}
          </button>
        )}
      </>
    )
  }

  return (
    <div class="ear-ask">
      <div class="ear-ask__sound">{sound}</div>
      <div class="ear-ask__text">
        <p class="ear-ask__context">{contextLine(q, first)}</p>
        <h1 class="drill__prompt">{earPromptText(q)}</h1>
      </div>
    </div>
  )
}

function Board({ q, ans, onKey }: { q: Question; ans: AnswerState; onKey?: (midi: number) => void }) {
  const { low, high } = earBoard(q)
  return (
    <div class="ear-board">
      <Keyboard
        low={low}
        high={high}
        marks={earAnswerMarks(q, ans)}
        maxKeyPx={EAR_KEY_PX}
        {...(onKey ? { onKeyTap: onKey } : {})}
      />
    </div>
  )
}

/**
 * Plays the question and resolves to the note's onset, or null: no audio unlocked yet (a fresh tab shows "Tap to hear"
 * rather than scheduling notes into a suspended context), no sampler, or any failure. Never throws.
 */
async function startQuestion(q: Question, { first, level }: { first: boolean; level: number }): Promise<number | null> {
  try {
    const ear = q.ear
    if (!ear || !audioReady.value) return null
    return await playEarPrompt({ tonic: ear.tonic, target: ear.target, withTonic: ear.withTonic, home: level === 6 && first })
  } catch {
    return null
  }
}

/** The Ear drill's rendering: the sound prompt and its buttons, and the one-octave board (spec §4, §7.3). */
export const EAR_UI: DrillUi = {
  kicker: 'FIND THE NOTE',
  promptText: earPromptText,
  Ask,
  choicesInAsk: false,
  Board,
  whyText: earWhyText,
  startQuestion,
  onAnswered: (q) => {
    try {
      if (q.ear && isEarDegree(q.ear.degree)) playWalk(q.ear.tonic, q.ear.degree)
    } catch {
      // never throws into the UI
    }
  },
  onLeave: () => stopEar(),
}
