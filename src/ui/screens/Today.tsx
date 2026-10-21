import { useRef, useState } from 'preact/hooks'
import { loadPiano } from '../../audio/piano'
import { unlockAudio } from '../../audio/unlock'
import { buildSession } from '../../session/builder'
import type { Settings } from '../../srs/items'
import { Segmented } from '../components/Segmented'
import { app, currentSession, navigate, notice, resumed, route, today, update } from '../state'
import { LENGTH_OPTIONS } from './settingsView'
import { todaySummary } from './todayView'

const PIANO_FAILED = "Piano sound didn't load. The session works without it."

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export function Today() {
  const { items, settings, log } = app.value
  void resumed.value // re-derive when the app returns to the foreground (the date may have changed)
  // Derived on every render from app state; never cached.
  const s = todaySummary(items, settings, today(), log)
  const [starting, setStarting] = useState(false)

  // Synchronous guard: a second tap in the same frame sees it before `starting` re-renders.
  const busy = useRef(false)

  const start = async () => {
    if (busy.current) return
    busy.current = true
    setStarting(true)
    try {
      await unlockAudio() // first thing in the tap: the iOS audio unlock needs the user gesture
      if (!(await loadPiano())) notice.value = PIANO_FAILED
      // Chris may have switched tabs during "Loading piano…": don't yank him into a session.
      if (route.peek() !== 'today') return
      const state = app.value
      const steps = buildSession(state.items, state.settings, today())
      if (steps.length === 0) return // the day's work finished in the meantime; the screen now shows Done
      currentSession.value = { steps, index: 0, startedAt: Date.now(), before: structuredClone(state.items) }
      navigate('session')
    } finally {
      busy.current = false
      setStarting(false) // harmless if already unmounted
    }
  }

  const setLength = (m: Settings['sessionMinutes']) =>
    update((st) => ({ ...st, settings: { ...st.settings, sessionMinutes: m } }))

  const streakClass = `today__streak${s.streak > 0 ? ' today__streak--on' : ''}`

  if (s.done) {
    return (
      <section class="screen today today--done">
        <p class={streakClass}>{s.streakLabel}</p>
        <h1 class="today__title">Done for today</h1>
        <p class="today__lede">Everything's practiced for today. Come back tomorrow.</p>
      </section>
    )
  }

  return (
    <section class="screen today">
      <div class="today__main">
        <p class={streakClass}>{s.streakLabel}</p>
        {s.doneToday ? (
          <>
            <h1 class="today__title">Today's practice is done</h1>
            <p class="today__lede">Want more? About {plural(s.minutes, 'minute', 'minutes')}.</p>
          </>
        ) : (
          <h1 class="today__title">About {plural(s.minutes, 'minute', 'minutes')}</h1>
        )}
        <div class="today__length">
          <span class="today__label">Session length</span>
          <Segmented
            options={LENGTH_OPTIONS}
            value={settings.sessionMinutes}
            onChange={setLength}
            label="Session length"
            size="lg"
            disabled={starting}
          />
        </div>
        <button
          type="button"
          class={`btn btn--start${s.doneToday ? '' : ' btn--primary'}`}
          onClick={start}
          disabled={starting}
        >
          {starting ? 'Loading piano…' : s.doneToday ? 'Practice more' : 'Start'}
        </button>
      </div>

      <div class="today__plan">
        <h2 class="today__label">{s.doneToday ? 'Next up' : "Today's scales"}</h2>
        <ul class="today__scales">
          {s.scales.map((sc) => (
            <li key={sc.label} class="today__scale">
              <span class="today__scale-name">{sc.label}</span>
              {sc.isNew && <span class="tag">First time</span>}
              {sc.withChords && <span class="today__scale-extra">with chords</span>}
            </li>
          ))}
        </ul>
        <ul class="today__extras">
          {s.recallCards > 0 && <li>Warm-up: {plural(s.recallCards, 'recall card', 'recall cards')}</li>}
          {s.chordSets > 0 && <li>Chords: {plural(s.chordSets, 'set', 'sets')}</li>}
          {s.freeplayMinutes > 0 && <li>Free play: {s.freeplayMinutes} min over the drone</li>}
        </ul>
      </div>
    </section>
  )
}
