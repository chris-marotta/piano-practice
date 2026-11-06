import { useMemo } from 'preact/hooks'
import { sessionChanges } from '../../session/changes'
import { EAR_IDS, KEY_IDS, STAFF_IDS } from '../../srs/items'
import { streak } from '../../store/streak'
import { BackupLine } from '../components/BackupLine'
import { app, currentSession, route, today, type CurrentSession } from '../state'
import { streakLabel } from './todayView'

interface Props {
  session: CurrentSession
}

const backToToday = (): void => {
  currentSession.value = null
  route.value = 'today'
}

/** Minutes, streak (the session is already logged), and every box or support move. */
export function Done({ session }: Props) {
  const { items, log, settings } = app.value
  const day = today()
  const changes = useMemo(() => {
    const ids = session.steps.flatMap((s) =>
      s.kind === 'freeplay'
        ? []
        : s.kind === 'drill'
          ? KEY_IDS // the round is built on the step, so any key may have moved; unmoved keys list nothing
          : s.kind === 'staff'
            ? STAFF_IDS // likewise: only the notes that moved are listed
            : s.kind === 'ear'
              ? EAR_IDS // likewise: only the degrees that moved are listed
              : s.kind === 'deck'
                ? s.cards.map((c) => c.itemId)
                : [s.itemId],
    )
    return sessionChanges(ids, session.before, items, day, settings)
  }, [session, items, day, settings])
  const days = streak(log, day)
  const minutes = session.minutes ?? 1

  return (
    <section class="screen done">
      <div class="done__main">
        <p class={`today__streak${days > 0 ? ' today__streak--on' : ''}`}>{streakLabel(days)}</p>
        <h1 class="today__title">Session done</h1>
        <p class="done__minutes">
          {minutes} {minutes === 1 ? 'minute' : 'minutes'} practiced
        </p>
        <button type="button" class="btn btn--primary btn--start" onClick={backToToday}>
          Back to Today
        </button>
        <BackupLine where="done" />
      </div>
      <div class="today__plan done__changes">
        <h2 class="today__label">What moved</h2>
        {changes.length === 0 ? (
          <p class="muted">No boxes or support levels changed this time. Shaky keeps an item where it is.</p>
        ) : (
          <ul class="changes">
            {changes.map((c) => (
              <li key={`${c.id}-${c.what}`} class={`change change--${c.direction}`}>
                <span class="change__arrow" aria-label={c.direction === 'up' ? 'up' : 'down'}>
                  {c.direction === 'up' ? '↑' : '↓'}
                </span>
                <span class="change__name">{c.name}</span>
                <span class="change__what">{c.what}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
