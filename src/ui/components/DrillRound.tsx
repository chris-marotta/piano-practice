import { useEffect, useRef, useState } from 'preact/hooks'
import { withRepeat, type DrillDef, type Given, type Question } from '../../drill/engine'
import { midiStatus } from '../../midi/access'
import { onKeyboard } from '../../midi/input'
import type { DrillUi } from './drillUi'
import {
  TIMED_OUT,
  answer,
  belongsToQuestion,
  listeningText,
  nextLabel,
  timeLimit,
  type AnswerState,
} from './drillView'

interface Props {
  def: DrillDef
  ui: DrillUi
  /** The round as built; DrillRound appends each missed key's practice repeat itself (withRepeat). Key it per round. */
  questions: Question[]
  level: number
  /** Once per question, on its first answer (repeats included: the caller decides what to grade). */
  onAnswer: (q: Question, correct: boolean, ms: number) => void
  /** Next on the last question. */
  onFinish: () => void
  /** The last question's button ("Next" in a session, "Next round" in Play). */
  finishLabel: string
  /** Show "Level {level} unlocked" above the ladder (the level rose since the last round). */
  unlocked?: boolean
  /** Count a right letter in the wrong octave as wrong (Staff's setting; Keys has none). */
  exactOctave?: boolean
  /** A short line in the head row between the kicker and the count (Play Staff's "Staff · Level n"). */
  headNote?: string
}

const UNANSWERED: AnswerState = { answered: false }

function Ladder({ def, level }: { def: DrillDef; level: number }) {
  const levels = Array.from({ length: def.levelCount }, (_, i) => i + 1)
  return (
    <ol
      class={`drill-ladder${def.levelCount > 4 ? ' drill-ladder--many' : ''}`}
      style={{ '--levels': def.levelCount }}
      aria-label={`Level ${level} of ${def.levelCount}`}
    >
      {levels.map((n) => (
        <li
          key={n}
          class={`drill-ladder__step${n === level ? ' drill-ladder__step--current' : n < level ? ' drill-ladder__step--done' : ''}`}
          aria-current={n === level ? 'step' : undefined}
          title={def.levelHints[n]}
        >
          <span class="drill-ladder__num">Level {n}</span>
          <span class="drill-ladder__name">{def.levelNames[n]}</span>
          <span class="drill-ladder__hint">{def.levelHints[n]}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * One name-that-key round (spec §6.2): see a key and pick its name, tap a named key, or play it on the keyboard.
 * Only the first answer to a question counts: every pick, tap, note and timeout goes through `answer`, which
 * ignores anything after the first, and nothing moves on until Next. A miss gets one practice repeat at the end.
 */
export function DrillRound({ def, ui, questions, level, onAnswer, onFinish, finishLabel, unlocked = false, exactOctave = false, headNote }: Props) {
  const [round, setRound] = useState(questions)
  const [index, setIndex] = useState(0)
  const [ans, setAns] = useState<AnswerState>(UNANSWERED)
  // Refs carry the truth between renders, so two events in one frame (a double tap, a tap and a note) see the first.
  const roundRef = useRef(round)
  const indexRef = useRef(0)
  const ansRef = useRef<AnswerState>(UNANSWERED)
  const startRef = useRef(performance.now())
  const finished = useRef(false)
  const onAnswerRef = useRef(onAnswer)
  onAnswerRef.current = onAnswer
  const nextBtn = useRef<HTMLButtonElement>(null)

  const give = (given: Given, at = performance.now()) => {
    const i = indexRef.current
    const q = roundRef.current[i]
    if (!q) return
    // A note stamped before this question began (the last one's late press) isn't an answer to it.
    if (!belongsToQuestion(at, startRef.current)) return
    const s = answer(ansRef.current, q, given, Math.round(at - startRef.current), def, exactOctave)
    if (s === ansRef.current || !s.answered) return
    ansRef.current = s
    setAns(s)
    if (!s.correct) {
      roundRef.current = withRepeat(roundRef.current, i)
      setRound(roundRef.current)
    }
    onAnswerRef.current(q, s.correct, s.ms)
  }
  const giveRef = useRef(give)
  giveRef.current = give

  const next = () => {
    if (!ansRef.current.answered) return
    const i = indexRef.current
    if (i + 1 >= roundRef.current.length) {
      if (finished.current) return
      finished.current = true
      onFinish()
      return
    }
    indexRef.current = i + 1
    ansRef.current = UNANSWERED
    // The new question's clock starts now, not after the render: a note in between must not read the old start.
    startRef.current = performance.now()
    setIndex(i + 1)
    setAns(UNANSWERED)
  }

  // The first question's clock starts once it is on screen; later ones start in `next`.
  useEffect(() => {
    if (index === 0) startRef.current = performance.now()
  }, [index])

  // Keyboard notes answer 'tap' and 'play' questions: the first note-on, any octave.
  useEffect(
    () =>
      onKeyboard((e) => {
        if (e.type !== 'on') return
        const q = roundRef.current[indexRef.current]
        if (!q || q.format === 'name') return
        giveRef.current({ kind: 'key', midi: e.midi }, e.t)
      }),
    [],
  )

  // The speed level: the def's fastMs a question, then it counts as wrong.
  const limit = timeLimit(def, level)
  useEffect(() => {
    if (limit === null || ans.answered) return
    const t = setTimeout(() => giveRef.current(TIMED_OUT, startRef.current + limit), limit)
    return () => clearTimeout(t)
  }, [limit, index, ans.answered])

  // After an answer, Next takes the focus so Enter / Space moves on.
  useEffect(() => {
    if (ans.answered) nextBtn.current?.focus()
  }, [ans.answered])

  const q = round[index]
  if (!q) return null
  const status = midiStatus.value
  const tappable = q.format !== 'name'

  const choiceClass = (value: string): string => {
    if (!ans.answered) return 'drill-choice'
    if (value === q.answer) return 'drill-choice drill-choice--right'
    if (ans.given.kind === 'choice' && ans.given.value === value) return 'drill-choice drill-choice--wrong'
    return 'drill-choice drill-choice--other'
  }

  const choices = q.format === 'name' && q.choices && (
    <div class="drill-choices">
      {q.choices.map((c) => (
        <button
          key={c.value}
          type="button"
          class={choiceClass(c.value)}
          aria-disabled={ans.answered}
          onClick={() => give({ kind: 'choice', value: c.value })}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
  const choicesInAsk = ui.choicesInAsk === true

  return (
    <div class="drill">
      {index === 0 && (
        <div class="drill__intro">
          {unlocked && (
            <p class="drill__unlocked" role="status">
              Level {level} unlocked
            </p>
          )}
          <Ladder def={def} level={level} />
        </div>
      )}
      <header class="drill__head">
        <span class="drill__kicker">{ui.kicker}</span>
        {headNote && <span class="drill__note">{headNote}</span>}
        <span class="drill__count">
          {index + 1} / {round.length}
        </span>
      </header>
      <div class="drill__ask">
        <ui.Ask q={q} ans={ans} {...(choicesInAsk && choices ? { choices } : {})} />
        {q.format === 'play' && status.kind === 'connected' && (
          <p class="drill__listening">{listeningText(status.name)}</p>
        )}
      </div>
      {limit !== null && (
        <div class="drill__timer" aria-hidden="true">
          <span
            key={index}
            style={{ animationDuration: `${limit}ms` }}
            class={`drill__timer-fill${!ans.answered ? '' : ans.given.kind === 'timeout' ? ' is-out' : ' is-stopped'}`}
          />
        </div>
      )}
      <div class={`drill__board${!ans.answered && q.format === 'name' ? ' drill__board--ask' : ''}`}>
        <ui.Board q={q} ans={ans} {...(tappable ? { onKey: (midi: number) => give({ kind: 'key', midi }) } : {})} />
      </div>
      {!choicesInAsk && choices}
      {/* Always there, so the why line arrives without moving the keyboard. */}
      <div class="drill__after">
        {ans.answered && (
          <>
            <p class={`drill__why${ans.correct ? ' drill__why--right' : ' drill__why--wrong'}`} role="status">
              <b>Why:</b> {ui.whyText(q, ans)}
            </p>
            <button ref={nextBtn} type="button" class="btn btn--primary btn--lg drill__next" onClick={next}>
              {nextLabel(index, round.length, finishLabel)}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
