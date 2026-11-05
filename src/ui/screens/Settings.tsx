import type { ComponentChildren } from 'preact'
import { useRef, useState } from 'preact/hooks'
import { disconnectMidi, midiStatus } from '../../midi/access'
import { exportState, parseImport, type AppState } from '../../store/storage'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MidiChip } from '../components/MidiChip'
import { Segmented } from '../components/Segmented'
import { app, currentSession, navigate, today, update } from '../state'
import {
  DRONE_DB_MAX,
  DRONE_DB_MIN,
  LENGTH_OPTIONS,
  MINOR_FORM_OPTIONS,
  REDO_MESSAGE,
  SHARE_TITLE,
  TEMPO_MAX,
  TEMPO_MIN,
  TEMPO_STEP,
  canShareFile,
  exportFilename,
  isShareAbort,
  importSummary,
  resetPlacement,
  routeAfterImport,
  withMinorForm,
  withSettings,
  type SettingsPatch,
} from './settingsView'
import { Toggle } from './steps/Toggle'

const set = (patch: SettingsPatch) => update((s) => withSettings(s, patch))

const dbLabel = (db: number): string => (db < 0 ? `−${Math.abs(db)} dB` : `${db} dB`)

const ON_OFF: { value: 'on' | 'off'; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
]
const onOff = (on: boolean): 'on' | 'off' => (on ? 'on' : 'off')

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** A range input that shows its value while dragging but commits only on change (release / key step). */
function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? value
  return (
    <div class="slider">
      <input
        type="range"
        class="slider__input"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        aria-valuetext={format(shown)}
        onInput={(e) => setDraft(Number(e.currentTarget.value))}
        onChange={(e) => {
          setDraft(null)
          onCommit(Number(e.currentTarget.value))
        }}
      />
      <output class="slider__value">{format(shown)}</output>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <div class="srow">
      <div class="srow__text">
        <span class="srow__label">{label}</span>
        {hint && <span class="srow__hint">{hint}</span>}
      </div>
      <div class="srow__control">{children}</div>
    </div>
  )
}

type Pending = { kind: 'redo' } | { kind: 'import'; state: AppState }

/** Session preferences, redo placement, export / import, and credits. */
export function Settings() {
  const { settings } = app.value
  const midiKind = midiStatus.value.kind
  const [pending, setPending] = useState<Pending | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Openers of the two confirms, so focus can return to them (Safari doesn't focus clicked buttons).
  const importBtnRef = useRef<HTMLButtonElement>(null)
  const redoBtnRef = useRef<HTMLButtonElement>(null)

  const redo = () => {
    setPending(null)
    // Order matters (R14): placement is only reachable once placedAt is cleared.
    currentSession.value = null
    update(resetPlacement)
    navigate('placement')
  }

  const exportProgress = async () => {
    const name = exportFilename(today())
    const json = exportState(app.value)
    // Share sheet first (Save to Files): a standalone home-screen app may ignore <a download>.
    const file = new File([json], name, { type: 'application/json' })
    if (canShareFile(navigator, file)) {
      try {
        await navigator.share({ files: [file], title: SHARE_TITLE })
        setExported(name)
        return
      } catch (err) {
        if (isShareAbort(err)) return // closed the sheet: nothing saved, nothing to say
        // Any other failure: fall through to the download.
      }
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke after the click has handed the blob to the download (Safari needs a moment).
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExported(name)
  }

  const chooseFile = () => {
    setImportError(null)
    fileRef.current?.click()
  }

  const readFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = '' // choosing the same file again still fires change
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      setImportError("That file couldn't be read.")
      return
    }
    const result = parseImport(text)
    if (!result.ok) {
      setImportError(result.error)
      return
    }
    setImportError(null)
    setPending({ kind: 'import', state: result.state })
  }

  const applyImport = (state: AppState) => {
    setPending(null)
    currentSession.value = null
    update(() => state)
    navigate(routeAfterImport(state))
  }

  const disconnect = () => {
    disconnectMidi()
    set({ midiEnabled: false })
  }

  const summary = pending?.kind === 'import' ? importSummary(pending.state) : null

  return (
    <section class="screen settings">
      <h1 class="screen__title">Settings</h1>

      <div class="settings__cols">
        <div class="settings__group">
          <h2 class="settings__heading">Practice</h2>
          <Row label="Session length">
            <Segmented
              options={LENGTH_OPTIONS}
              value={settings.sessionMinutes}
              onChange={(v) => set({ sessionMinutes: v })}
              label="Session length"
            />
          </Row>
          <Row label="Minor forms" hint="Majors are always on. A form you turn off keeps its progress.">
            <div class="settings__forms" role="group" aria-label="Minor forms">
              {MINOR_FORM_OPTIONS.map(({ form, label }) => (
                <Toggle
                  key={form}
                  label={label}
                  on={settings.minorForms[form]}
                  onChange={(on) => update((s) => withMinorForm(s, form, on))}
                />
              ))}
            </div>
          </Row>
          <Row label="Start tempo" hint="Applies to scales you haven't practiced yet. Each scale then keeps its own tempo.">
            <div class="stepper">
              <button
                type="button"
                class="btn stepper__btn"
                aria-label="Slower"
                disabled={settings.startTempo <= TEMPO_MIN}
                onClick={() => set({ startTempo: settings.startTempo - TEMPO_STEP })}
              >
                −
              </button>
              <Slider
                label="Start tempo"
                value={settings.startTempo}
                min={TEMPO_MIN}
                max={TEMPO_MAX}
                step={TEMPO_STEP}
                format={(v) => `♩ = ${v}`}
                onCommit={(v) => set({ startTempo: v })}
              />
              <button
                type="button"
                class="btn stepper__btn"
                aria-label="Faster"
                disabled={settings.startTempo >= TEMPO_MAX}
                onClick={() => set({ startTempo: settings.startTempo + TEMPO_STEP })}
              >
                +
              </button>
            </div>
          </Row>

          <Row label="Exact octave" hint="Tap or play the exact key the staff shows, not just the right letter.">
            <Segmented
              options={ON_OFF}
              value={onOff(settings.staffExactOctave)}
              onChange={(v) => set({ staffExactOctave: v === 'on' })}
              label="Exact octave"
            />
          </Row>

          <h2 class="settings__heading">Keyboard</h2>
          <Row label="MIDI keyboard">
            <div class="settings__midi">
              <MidiChip />
              {(midiKind === 'connected' || midiKind === 'no-device') && (
                <button type="button" class="btn" onClick={disconnect}>
                  Disconnect
                </button>
              )}
            </div>
          </Row>
          <Row label="Keyboard sound" hint="Plays the piano as you play the keyboard.">
            <Segmented
              options={ON_OFF}
              value={onOff(settings.keyboardSound)}
              onChange={(v) => set({ keyboardSound: v === 'on' })}
              label="Keyboard sound"
            />
          </Row>
        </div>

        <div class="settings__group">
          <h2 class="settings__heading">Sound</h2>
          <Row label="Drone" hint="Plays under each scale. You can also switch it during a scale.">
            <Segmented
              options={ON_OFF}
              value={onOff(settings.droneOn)}
              onChange={(v) => set({ droneOn: v === 'on' })}
              label="Drone"
            />
          </Row>
          <Row label="Drone volume">
            <Slider
              label="Drone volume"
              value={settings.droneVolumeDb}
              min={DRONE_DB_MIN}
              max={DRONE_DB_MAX}
              step={1}
              format={dbLabel}
              onCommit={(v) => set({ droneVolumeDb: v })}
            />
          </Row>
          <Row label="Metronome" hint="Clicks at the scale's tempo.">
            <Segmented
              options={ON_OFF}
              value={onOff(settings.metronomeOn)}
              onChange={(v) => set({ metronomeOn: v === 'on' })}
              label="Metronome"
            />
          </Row>

          <h2 class="settings__heading">Your progress</h2>
          <Row label="Back up" hint="Progress lives only on this device. Save a copy now and then.">
            <div class="settings__actions">
              <button type="button" class="btn" onClick={exportProgress}>
                Export
              </button>
              <button ref={importBtnRef} type="button" class="btn" onClick={chooseFile}>
                Import…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                class="settings__file"
                tabIndex={-1}
                aria-hidden="true"
                onChange={readFile}
              />
            </div>
          </Row>
          {exported && !importError && (
            <p class="settings__note" role="status">
              Saved {exported}
            </p>
          )}
          {importError && (
            <p class="settings__error" role="alert">
              Import failed: {importError}
            </p>
          )}
          <Row label="Redo placement" hint="Mark every scale Solid, Shaky or Don't know again.">
            <button
              ref={redoBtnRef}
              type="button"
              class="btn btn--danger-quiet"
              onClick={() => setPending({ kind: 'redo' })}
            >
              Redo placement…
            </button>
          </Row>
        </div>
      </div>

      <footer class="about">
        <h2 class="settings__heading">About</h2>
        <p>
          Piano sound: Salamander Grand Piano by Alexander Holm,{' '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">
            CC-BY 3.0
          </a>
          , via{' '}
          <a href="https://tonejs.github.io/audio/salamander/" target="_blank" rel="noopener noreferrer">
            tonejs.github.io/audio/salamander
          </a>
          .
        </p>
        <p>
          Type: Atkinson Hyperlegible by the Braille Institute; Noto Music by Google. Both SIL Open Font License.
        </p>
        <p class="muted">Source: available once published.</p>
      </footer>

      {pending?.kind === 'redo' && (
        <ConfirmDialog
          title="Redo placement?"
          confirmLabel="Reset and redo"
          danger
          returnFocus={redoBtnRef}
          onConfirm={redo}
          onCancel={() => setPending(null)}
        >
          <p>{REDO_MESSAGE}</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'import' && summary && (
        <ConfirmDialog
          title="Replace your progress?"
          confirmLabel="Replace progress"
          danger
          returnFocus={importBtnRef}
          onConfirm={() => applyImport(pending.state)}
          onCancel={() => setPending(null)}
        >
          <p>
            {summary.placed ? `This backup was placed on ${summary.placed}.` : "This backup hasn't been placed yet."}{' '}
            It holds {plural(summary.items, 'item', 'items')} and{' '}
            {plural(summary.sessions, 'completed session', 'completed sessions')}.
          </p>
          <p>Everything on this device (scale progress, practice log and settings) is replaced.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}
