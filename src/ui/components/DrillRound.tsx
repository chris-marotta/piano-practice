import { useEffect, useRef, useState } from 'preact/hooks'
import { withRepeat, type Question } from '../../drill/engine'
import { LEVEL_NAMES } from '../../drill/keys'
import { midiStatus } from '../../midi/access'
import { onKeyboard } from '../../midi/input'
import { DRILL_FAST_MS } from '../../play/thresholds'
import { PC_ASCII, keyName } from '../../theory/keyNames'
import {
  DRILL_HIGH,
  DRILL_LOW,
  LEVEL_HINTS,
  TIMED_OUT,
  answer,
  answerMarks,
  belongsToQuestion,
  listeningText,
  nextLabel,
  promptText,
  whyText,
  type AnswerState,
} from './drillView'
import { Keyboard, type KeyMark } from './Keyboard'

interface Props {
  /** The round as built; DrillRound appends each missed key's practice repeat itself (withRepeat). Key it per round. */
  questions: Question[]
  level: 1 | 2 | 3 | 4
  /** Once per question, on its first answer (repeats included: the caller decides what to grade). */
  onAnswer: (q: Question, correct: boolean, ms: number) => void
  /** Next on the last question. */
  onFinish: () => void
  /** The last question's button ("Next" in a session, "Next round" in Play). */
  finishLabel: string
  /** Show "Level {level} unlocked" above the ladder (the level rose since the last round). */
  unlocked?: boolean
}

const LEVELS = [1, 2, 3, 4] as const

/** Room for the black keys to be tapped on a two-octave keyboard (white keys up to 72 px). */
const DRILL_KEY_PX = 72

const UNANSWERED: AnswerState = { answered: false }

function Ladder({ level }: { level: 1 | 2 | 3 | 4 }) {
  return (
    <ol class="drill-ladder" aria-label={`Level ${level} of 4`}>
      {LEVELS.map((n) => (
        <li
          key={n}
          class={`drill-ladder__step${n === level ? ' drill-ladder__step--current' : n < level ? ' drill-ladder__step--done' : ''}`}
          aria-current={n === level ? 'step' : undefined}
        >
          <span class="drill-ladder__num">Level {n}</span>
          <span class="drill-ladder__name">{LEVEL_NAMES[n]}</span>
          <span class="drill-ladder__hint">{LEVEL_HINTS[n]}</span>
        </li>
      ))}
    </ol>
  )
}

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

/**
 * One name-that-key round (spec §6.2): see a key and pick its name, tap a named key, or play it on the keyboard.
 * Only the first answer to a question counts: every pick, tap, note and timeout goes through `answer`, which
 * ignores anything after the first, and nothing moves on until Next. A miss gets one practice repeat at the end.
 */
export function DrillRound({ questions, level, onAnswer, onFinish, finishLabel, unlocked = false }: Props) {
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

  const give = (given: { pc: number | null; midi: number | null }, at = performance.now()) => {
    const i = indexRef.current
    const q = roundRef.current[i]
    if (!q) return
    // A note stamped before this question began (the last one's late press) isn't an answer to it.
    if (!belongsToQuestion(at, startRef.current)) return
    const s = answer(ansRef.current, q, given, Math.round(at - startRef.current))
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
        giveRef.current({ pc: ((e.midi % 12) + 12) % 12, midi: e.midi }, e.t)
      }),
    [],
  )

  // Level 4: 3 seconds a key, then it counts as wrong.
  useEffect(() => {
    if (level !== 4 || ans.answered) return
    const t = setTimeout(() => giveRef.current(TIMED_OUT, startRef.current + DRILL_FAST_MS), DRILL_FAST_MS)
    return () => clearTimeout(t)
  }, [level, index, ans.answered])

  // After an answer, Next takes the focus so Enter / Space moves on.
  useEffect(() => {
    if (ans.answered) nextBtn.current?.focus()
  }, [ans.answered])

  const q = round[index]
  if (!q) return null
  const status = midiStatus.value
  const marks: KeyMark[] = ans.answered
    ? answerMarks(q, ans.midi, ans.correct)
    : q.format === 'name'
      ? [{ midi: q.midi, hand: 'none' }]
      : []
  const tappable = q.format !== 'name'

  const choiceClass = (pc: number): string => {
    if (!ans.answered) return 'drill-choice'
    if (pc === q.pc) return 'drill-choice drill-choice--right'
    if (pc === ans.pc) return 'drill-choice drill-choice--wrong'
    return 'drill-choice drill-choice--other'
  }

  return (
    <div class="drill">
      {index === 0 && (
        <div class="drill__intro">
          {unlocked && (
            <p class="drill__unlocked" role="status">
              Level {level} unlocked
            </p>
          )}
          <Ladder level={level} />
        </div>
      )}
      <header class="drill__head">
        <span class="drill__kicker">NAME THAT KEY</span>
        <span class="drill__count">
          {index + 1} / {round.length}
        </span>
      </header>
      <div class="drill__ask">
        <Prompt q={q} />
        {q.format === 'play' && status.kind === 'connected' && (
          <p class="drill__listening">{listeningText(status.name)}</p>
        )}
      </div>
      {level === 4 && (
        <div class="drill__timer" aria-hidden="true">
          <span
            key={index}
            style={{ animationDuration: `${DRILL_FAST_MS}ms` }}
            class={`drill__timer-fill${!ans.answered ? '' : ans.pc === null ? ' is-out' : ' is-stopped'}`}
          />
        </div>
      )}
      <div class={`drill__board${!ans.answered && q.format === 'name' ? ' drill__board--ask' : ''}`}>
        <Keyboard
          low={DRILL_LOW}
          high={DRILL_HIGH}
          marks={marks}
          maxKeyPx={DRILL_KEY_PX}
          {...(tappable ? { onKeyTap: (midi: number) => give({ pc: midi % 12, midi }) } : {})}
        />
      </div>
      {q.format === 'name' && q.choices && (
        <div class="drill-choices">
          {q.choices.map((c) => {
            const pc = PC_ASCII.indexOf(c.value)
            return (
              <button
                key={c.value}
                type="button"
                class={choiceClass(pc)}
                aria-disabled={ans.answered}
                onClick={() => give({ pc, midi: null })}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      )}
      {/* Always there, so the why line arrives without moving the keyboard. */}
      <div class="drill__after">
        {ans.answered && (
          <>
            <p class={`drill__why${ans.correct ? ' drill__why--right' : ' drill__why--wrong'}`} role="status">
              <b>Why:</b> {whyText(q, ans)}
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
