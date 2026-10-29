import { signal } from '@preact/signals'
import { createDeduper } from './dedupe'
import { clearKeyboard, emitKeyboard } from './input'
import { parseMidi } from './parse'

/** Browser Web MIDI connection. Knows nothing about app state; callers learn of success via onConnected. */

export type MidiStatus =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'denied' }
  | { kind: 'no-device' }
  | { kind: 'connected'; name: string }

/** Pure. The first input named like a ROLI wins, else the first input. */
export function statusFromInputs(names: string[]): MidiStatus {
  if (names.length === 0) return { kind: 'no-device' }
  const name = names.find((n) => n.toLowerCase().includes('roli')) ?? names[0]!
  return { kind: 'connected', name }
}

const supported = (): boolean =>
  typeof navigator !== 'undefined' && typeof (navigator as Navigator).requestMIDIAccess === 'function'

export const midiStatus = signal<MidiStatus>(supported() ? { kind: 'off' } : { kind: 'unsupported' })

let access: MIDIAccess | null = null
let attached = new Set<MIDIInput>()
let generation = 0
// P17: one keyboard showing up on two ports would sound and count every note twice.
const dedupe = createDeduper()

function onMessage(input: MIDIInput, e: MIDIMessageEvent): void {
  if (!e.data) return
  const ev = parseMidi(e.data, e.timeStamp)
  if (ev && dedupe.accept(input, ev)) emitKeyboard(ev)
}

/** One handler per input, so a message knows its port. */
const handlers = new WeakMap<MIDIInput, (e: MIDIMessageEvent) => void>()
function handlerFor(input: MIDIInput): (e: MIDIMessageEvent) => void {
  let h = handlers.get(input)
  if (!h) handlers.set(input, (h = (e) => onMessage(input, e)))
  return h
}

function detachAll(): void {
  for (const input of attached) input.onmidimessage = null
  attached = new Set()
  dedupe.reset()
}

/** Re-scan inputs: attach new ones, drop gone ones, update status. */
function refresh(): void {
  if (!access) return
  const current = new Set<MIDIInput>()
  for (const input of access.inputs.values()) if (input.state !== 'disconnected') current.add(input)

  let removed = false
  for (const input of attached) {
    if (!current.has(input)) {
      input.onmidimessage = null
      removed = true
    }
  }
  for (const input of current) input.onmidimessage = handlerFor(input)
  attached = current

  midiStatus.value = statusFromInputs([...current].map((i) => i.name ?? ''))
  // A device that vanished mid-note can never send its note-off.
  if (removed) {
    dedupe.reset()
    clearKeyboard()
  }
}

export async function connectMidi(opts?: { onConnected?: () => void }): Promise<void> {
  if (!supported()) {
    midiStatus.value = { kind: 'unsupported' }
    return
  }
  const gen = ++generation
  let granted: MIDIAccess
  try {
    granted = await navigator.requestMIDIAccess({ sysex: false })
  } catch {
    if (gen === generation) midiStatus.value = { kind: 'denied' }
    return
  }
  if (gen !== generation) return // disconnected (or reconnected) while the prompt was open
  detachAll()
  if (access) access.onstatechange = null
  access = granted
  access.onstatechange = () => refresh()
  refresh()
  opts?.onConnected?.()
}

export function disconnectMidi(): void {
  generation++
  detachAll()
  if (access) access.onstatechange = null
  access = null
  midiStatus.value = { kind: 'off' }
  clearKeyboard()
}

// ---- dev hook ----

// DEV only: the preview browser has no keyboard, so midiStatus never reaches 'connected'. fakeConnected() pretends one
// is plugged in (no MIDIAccess), so session auto-check can be driven with __keyboard.inject (input.ts).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const w = window as unknown as { __keyboard?: Record<string, unknown> }
  w.__keyboard = {
    ...w.__keyboard,
    fakeConnected() {
      midiStatus.value = { kind: 'connected', name: 'Dev keyboard' }
    },
  }
}
