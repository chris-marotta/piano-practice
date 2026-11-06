import { useEffect, useRef, useState } from 'preact/hooks'
import { withRepeat, type DrillDef, type Given, type Question } from '../../drill/engine'
import { midiStatus } from '../../midi/access'
import { onKeyboard } from '../../midi/input'
import type { DrillUi } from './drillUi'
import {
  AGAIN_HINT,
  TIMED_OUT,
  acceptsPrompt,
  advancesOnKey,
  answer,
  belongsToQuestion,
  clockStart,
  listeningText,
  msUntil,
  nextLabel,
  promptPending,
  timeLimit,
  type AnswerState,
  type PromptState,
} from './drillView'

interface Props {
  def: DrillDef
  ui: DrillUi
  /** The round as built; DrillRound appends each missed key's practice repeat itself (withRepeat). Key it per round. */
  questions: Question[]
  level: number
  /** The highest level unlocked, when it differs from `level` (a picked level); defaults to `level`. */
  reached?: number
  /** Makes the ladder a picker (Play): every level, locked or not. */
  onPickLevel?: (level: number) => void
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
  /** With a sound prompt that played nothing ('silent'), a Skip button moves on (the session's next step). */
  onSkip?: () => void
}

export const SKIP_LABEL = 'Skip'

const UNANSWERED: AnswerState = { answered: false }

/**
 * The level ladder: the current level outlined, the unlocked ones up to `reached` in full text, locked ones muted.
 * With `onPick` (Play) every step is a button, locked ones too.
 */
function Ladder({ def, level, reached, onPick }: { def: DrillDef; level: number; reached: number; onPick?: (n: number) => void }) {
  const levels = Array.from({ length: def.levelCount }, (_, i) => i + 1)
  return (
    <ol
      class={`drill-ladder${def.levelCount > 4 ? ' drill-ladder--many' : ''}${onPick ? ' drill-ladder--pick' : ''}`}
      style={{ '--levels': def.levelCount }}
      aria-label={`Level ${level} of ${def.levelCount}`}
    >
      {levels.map((n) => {
        const body = (
          <>
            <span class="drill-ladder__num">Level {n}</span>
            <span class="drill-ladder__name">{def.levelNames[n]}</span>
            <span class="drill-ladder__hint">{def.levelHints[n]}</span>
          </>
        )
        return (
          <li
            key={n}
            class={`drill-ladder__step${n === level ? ' drill-ladder__step--current' : n <= reached ? ' drill-ladder__step--done' : ''}`}
            aria-current={n === level ? 'step' : undefined}
            title={def.levelHints[n]}
          >
            {onPick ? (
              <button type="button" class="drill-ladder__pick" aria-pressed={n === level} onClick={() => onPick(n)}>
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One name-that-key round (spec §6.2): see a key and pick its name, tap a named key, or play it on the keyboard.
 * Only the first answer to a question counts: every pick, tap, note and timeout goes through `answer`, which
 * ignores anything after the first, and nothing moves on until Next. A miss gets one practice repeat at the end.
 */
export function DrillRound({
  def,
  ui,
  questions,
  level,
  reached = level,
  onPickLevel,
  onAnswer,
  onFinish,
  finishLabel,
  unlocked = false,
  exactOctave = false,
  headNote,
  onSkip,
}: Props) {
  const [round, setRound] = useState(questions)
  const [index, setIndex] = useState(0)
  const [ans, setAns] = useState<AnswerState>(UNANSWERED)
  // Refs carry the truth between renders, so two events in one frame (a double tap, a tap and a note) see the first.
  const roundRef = useRef(round)
  const indexRef = useRef(0)
  const ansRef = useRef<AnswerState>(UNANSWERED)
  // With a sound prompt the clock waits for the note's onset (Infinity until then: nothing answers before it).
  const startRef = useRef(ui.startQuestion ? Infinity : performance.now())
  const [prompt, setPrompt] = useState<PromptState>(ui.startQuestion ? 'waiting' : 'none')
  const promptRef = useRef(prompt)
  // Each startQuestion call gets a token; a promise (or its ready timer) from an older call is dropped.
  const tokenRef = useRef(0)
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const uiRef = useRef(ui)
  uiRef.current = ui
  const answeredAtRef = useRef(0)
  const finished = useRef(false)
  const onAnswerRef = useRef(onAnswer)
  onAnswerRef.current = onAnswer
  const nextBtn = useRef<HTMLButtonElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)
  const skipBtn = useRef<HTMLButtonElement>(null)

  const give = (given: Given, at = performance.now()) => {
    const i = indexRef.current
    const q = roundRef.current[i]
    if (!q) return
    // A note stamped before this question began (the last one's late press) isn't an answer to it.
    if (!belongsToQuestion(at, startRef.current)) return
    const s = answer(ansRef.current, q, given, Math.round(at - startRef.current), def, exactOctave)
    if (s === ansRef.current || !s.answered) return
    ansRef.current = s
    answeredAtRef.current = at
    setAns(s)
    ui.onAnswered?.(q, s)
    if (!s.correct) {
      roundRef.current = withRepeat(roundRef.current, i)
      setRound(roundRef.current)
    }
    onAnswerRef.current(q, s.correct, s.ms)
  }
  const giveRef = useRef(give)
  giveRef.current = give

  const setPromptNow = (p: PromptState) => {
    promptRef.current = p
    setPrompt(p)
  }
  const clearReady = () => {
    if (readyTimer.current !== null) clearTimeout(readyTimer.current)
    readyTimer.current = null
  }

  /**
   * Play question `i`'s sound prompt. The clock and the state are written here, synchronously, before any render: the
   * clock stops (Infinity) until the onset comes back; then it starts at the onset, and 'ready' shows when the onset
   * arrives. A null onset is 'silent'. A resolve after Next, a retry or unmount carries an old token and is dropped.
   */
  const runPrompt = (i: number) => {
    const start = ui.startQuestion
    const q = roundRef.current[i]
    if (!start || !q) return
    clearReady()
    const token = ++tokenRef.current
    startRef.current = Infinity
    setPromptNow('waiting')
    const settle = (onset: number | null) => {
      if (!acceptsPrompt(token, tokenRef.current)) return
      startRef.current = clockStart(onset)
      if (onset === null) {
        setPromptNow('silent')
        return
      }
      readyTimer.current = setTimeout(() => {
        if (!acceptsPrompt(token, tokenRef.current)) return
        readyTimer.current = null
        setPromptNow('ready')
      }, msUntil(onset, performance.now()))
    }
    // A prompt that fails is treated as no sound (ASSUMED): 'silent', with retry and Skip.
    start(q, { first: i === 0, level }).then(settle, () => settle(null))
  }
  const runPromptRef = useRef(runPrompt)
  runPromptRef.current = runPrompt

  /** Hear it again before the onset or after no sound: a fresh prompt. After the onset a replay is the Ask's own. */
  const retry = () => {
    if (promptPending(promptRef.current)) runPrompt(indexRef.current)
  }

  const next = () => {
    if (!ansRef.current.answered) return
    const i = indexRef.current
    if (i + 1 >= roundRef.current.length) {
      if (finished.current) return
      finished.current = true
      ui.onLeave?.()
      onFinish()
      return
    }
    ui.onLeave?.()
    indexRef.current = i + 1
    ansRef.current = UNANSWERED
    // The new question's clock starts now, not after the render: a note in between must not read the old start.
    // With a sound prompt it waits for the new note's onset (runPrompt writes the clock and the state at once).
    if (ui.startQuestion) runPrompt(i + 1)
    else startRef.current = performance.now()
    setIndex(i + 1)
    setAns(UNANSWERED)
  }
  const nextRef = useRef(next)
  nextRef.current = next

  // The first question's clock starts once it is on screen; later ones start in `next`.
  useEffect(() => {
    if (index !== 0) return
    if (uiRef.current.startQuestion) runPromptRef.current(0)
    else startRef.current = performance.now()
  }, [index])

  // On unmount: drop any pending prompt or ready timer, and let the UI stop its sound.
  useEffect(
    () => () => {
      tokenRef.current++
      if (readyTimer.current !== null) clearTimeout(readyTimer.current)
      uiRef.current.onLeave?.()
    },
    [],
  )

  // Keyboard notes answer 'tap' and 'play' questions: the first note-on, any octave. Once answered, playing the
  // key again is Next (advancesOnKey).
  useEffect(
    () =>
      onKeyboard((e) => {
        if (e.type !== 'on') return
        const q = roundRef.current[indexRef.current]
        if (!q || q.format === 'name') return
        const s = ansRef.current
        if (s.answered) {
          if (advancesOnKey(q, s, e.midi, e.t - answeredAtRef.current)) nextRef.current()
          return
        }
        giveRef.current({ kind: 'key', midi: e.midi }, e.t)
      }),
    [],
  )

  // The speed level: the def's fastMs a question, then it counts as wrong.
  // With a sound prompt it runs from the onset, once the prompt is ready.
  const limit = timeLimit(def, level)
  useEffect(() => {
    if (limit === null || ans.answered || promptPending(prompt)) return
    const delay = prompt === 'none' ? limit : msUntil(startRef.current + limit, performance.now())
    const t = setTimeout(() => giveRef.current(TIMED_OUT, startRef.current + limit), delay)
    return () => clearTimeout(t)
  }, [limit, index, ans.answered, prompt])

  // After an answer, Next takes the focus so Enter / Space moves on, and the why line and Next scroll clear of the
  // tab bar (I2: Play's first question at 1280 x 760). 'nearest' leaves the page still when they already show.
  useEffect(() => {
    if (!ans.answered) return
    nextBtn.current?.focus({ preventScroll: true })
    afterRef.current?.scrollIntoView({ block: 'nearest' })
  }, [ans.answered])

  // No sound played and Skip is offered (the session's not-ready state): bring Skip into view too.
  useEffect(() => {
    if (prompt === 'silent' && skipBtn.current) afterRef.current?.scrollIntoView({ block: 'nearest' })
  }, [prompt])

  const q = round[index]
  if (!q) return null
  const status = midiStatus.value
  const tappable = q.format !== 'name'
  // Waiting for the sound (or none played): the name buttons are inactive, and a pick is dropped (the clock hasn't started).
  const waiting = promptPending(prompt)

  const choiceClass = (value: string): string => {
    if (!ans.answered) return waiting ? 'drill-choice drill-choice--waiting' : 'drill-choice'
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
          aria-disabled={ans.answered || waiting}
          onClick={() => give({ kind: 'choice', value: c.value })}
        >
          {c.label}
          {c.sub && <span class="drill-choice__sub">{c.sub}</span>}
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
          <Ladder def={def} level={level} reached={reached} {...(onPickLevel ? { onPick: onPickLevel } : {})} />
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
        <ui.Ask
          q={q}
          ans={ans}
          prompt={prompt}
          retry={retry}
          first={index === 0}
          level={level}
          {...(choicesInAsk && choices ? { choices } : {})}
        />
        {q.format === 'play' && status.kind === 'connected' && (
          <p class="drill__listening">{listeningText(status.name)}</p>
        )}
      </div>
      {limit !== null && !waiting && (
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
      <div class="drill__after" ref={afterRef}>
        {!ans.answered && prompt === 'silent' && onSkip && (
          <button ref={skipBtn} type="button" class="btn btn--lg drill__skip" onClick={onSkip}>
            {SKIP_LABEL}
          </button>
        )}
        {ans.answered && (
          <>
            <p class={`drill__why${ans.correct ? ' drill__why--right' : ' drill__why--wrong'}`} role="status">
              <b>Why:</b> {ui.whyText(q, ans)}
            </p>
            <button ref={nextBtn} type="button" class="btn btn--primary btn--lg drill__next" onClick={next}>
              {nextLabel(index, round.length, finishLabel)}
              {q.format === 'play' && status.kind === 'connected' && <span class="drill__again">{AGAIN_HINT}</span>}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
