import { useEffect } from 'preact/hooks'
import { stopAll } from '../../audio/piano'
import { logCompletedSession, rateItem, sessionDate, sessionMinutes } from '../../session/record'
import type { Rating } from '../../srs/scheduler'
import { app, currentSession, route, today, update } from '../state'
import { useWakeLock } from '../useWakeLock'
import { Done } from './Done'
import { ChordStep } from './steps/ChordStep'
import { FreeplayStep } from './steps/FreeplayStep'
import { RecallStep } from './steps/RecallStep'
import { ScaleStep } from './steps/ScaleStep'
import { progressLabel } from './steps/stepView'

/** Move past step `from` (ignored if the session has already moved on: a double tap). The last step logs the session. */
function advance(from: number): void {
  const s = currentSession.peek()
  if (!s || s.index !== from) return
  const next = from + 1
  if (next < s.steps.length) {
    currentSession.value = { ...s, index: next }
    return
  }
  const minutes = sessionMinutes(s.startedAt, Date.now())
  update((st) => logCompletedSession(st, minutes, sessionDate(s.startedAt)))
  currentSession.value = { ...s, index: next, minutes }
}

/** Every rating is saved at once, so a session closed part-way keeps what was rated (spec §4.7). */
function rate(from: number, id: string, rating: Rating, opts?: { peeked?: boolean }): void {
  const s = currentSession.peek()
  if (!s || s.index !== from) return
  update((st) => rateItem(st, id, rating, today(), opts))
  advance(from)
}

/** Leave without finishing: ratings are already saved; no log entry (a partial session doesn't count the day). */
function endSession(): void {
  stopAll()
  currentSession.value = null
  route.value = 'today'
}

export function Session() {
  const s = currentSession.value
  const missing = s === null
  useWakeLock() // keep the screen on for the whole session, Done screen included

  // Nothing in progress (e.g. after a reload): back to Today, without a history entry.
  useEffect(() => {
    if (missing) route.value = 'today'
  }, [missing])

  // Left by browser back (or any route change other than End session / Back to Today): drop the
  // session so it can't be resumed half-way. Ratings are already saved; step unmounts stop audio.
  useEffect(
    () => () => {
      if (route.peek() !== 'session') currentSession.value = null
    },
    [],
  )

  if (!s) return null
  if (s.index >= s.steps.length) return <Done session={s} />

  const step = s.steps[s.index]
  if (!step) return null
  const i = s.index
  const total = s.steps.length
  const settings = app.value.settings

  let body
  if (step.kind === 'recall') body = <RecallStep key={i} step={step} onRate={(r) => rate(i, step.itemId, r)} />
  else if (step.kind === 'scale')
    body = <ScaleStep key={i} step={step} settings={settings} onRate={(r, o) => rate(i, step.itemId, r, o)} />
  else if (step.kind === 'chords') body = <ChordStep key={i} step={step} onRate={(r) => rate(i, step.itemId, r)} />
  else body = <FreeplayStep key={i} step={step} settings={settings} onDone={() => advance(i)} />

  return (
    <section class="screen session">
      <div class="session__bar">
        <span class="session__progress-label">{progressLabel(i, total)}</span>
        <div
          class="session__progress"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={i}
        >
          <span class="session__progress-fill" style={{ width: `${(i / total) * 100}%` }} />
        </div>
        <button type="button" class="btn btn--quiet session__end" onClick={endSession}>
          End session
        </button>
      </div>
      {body}
    </section>
  )
}
