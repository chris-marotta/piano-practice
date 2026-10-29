import { signal } from '@preact/signals'
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

function onMessage(e: MIDIMessageEvent): void {
  if (!e.data) return
  const ev = parseMidi(e.data, e.timeStamp)
  if (ev) emitKeyboard(ev)
}

function detachAll(): void {
  for (const input of attached) input.onmidimessage = null
  attached = new Set()
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
  for (const input of current) input.onmidimessage = onMessage
  attached = current

  midiStatus.value = statusFromInputs([...current].map((i) => i.name ?? ''))
  // A device that vanished mid-note can never send its note-off.
  if (removed) clearKeyboard()
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
