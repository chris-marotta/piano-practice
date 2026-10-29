import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectMidi, disconnectMidi, midiStatus, statusFromInputs } from '../../src/midi/access'
import { clearKeyboard, emitKeyboard, heldNotes, onKeyboard } from '../../src/midi/input'
import type { MidiEvent } from '../../src/midi/parse'

describe('statusFromInputs', () => {
  it('no inputs is no-device', () => {
    expect(statusFromInputs([])).toEqual({ kind: 'no-device' })
  })
  it('prefers the ROLI input, case-insensitive', () => {
    expect(statusFromInputs(['IAC Bus 1', 'ROLI Piano M'])).toEqual({ kind: 'connected', name: 'ROLI Piano M' })
    expect(statusFromInputs(['IAC Bus 1', 'my roli keys'])).toEqual({ kind: 'connected', name: 'my roli keys' })
  })
  it('otherwise uses the first input', () => {
    expect(statusFromInputs(['Some Keys'])).toEqual({ kind: 'connected', name: 'Some Keys' })
    expect(statusFromInputs(['A', 'B'])).toEqual({ kind: 'connected', name: 'A' })
  })
})

type FakeInput = { name: string; state: string; onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null }
const fakeInput = (name: string): FakeInput => ({ name, state: 'connected', onmidimessage: null })
function fakeAccess(list: FakeInput[]) {
  const inputs = new Map<string, FakeInput>(list.map((i, n) => [String(n), i]))
  return { inputs, onstatechange: null as null | (() => void) }
}

const g = globalThis as unknown as { navigator?: unknown }
const realNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
function stubNavigator(requestMIDIAccess?: (o: unknown) => Promise<unknown>) {
  Object.defineProperty(globalThis, 'navigator', {
    value: requestMIDIAccess ? { requestMIDIAccess } : {},
    configurable: true,
    writable: true,
  })
}

beforeEach(() => clearKeyboard())
afterEach(() => {
  disconnectMidi()
  if (realNav) Object.defineProperty(globalThis, 'navigator', realNav)
  else delete g.navigator
})

describe('connectMidi', () => {
  it('connects, requests sysex:false, and routes messages to the keyboard stream', async () => {
    const input = fakeInput('ROLI Piano')
    const access = fakeAccess([input])
    let opts: unknown
    stubNavigator(async (o) => ((opts = o), access))
    let connected = 0
    await connectMidi({ onConnected: () => connected++ })
    expect(opts).toEqual({ sysex: false })
    expect(midiStatus.value).toEqual({ kind: 'connected', name: 'ROLI Piano' })
    expect(connected).toBe(1)
    const seen: MidiEvent[] = []
    const unsub = onKeyboard((e) => seen.push(e))
    input.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]), timeStamp: 123 })
    input.onmidimessage!({ data: new Uint8Array([0xe0, 0, 64]), timeStamp: 124 }) // pitch bend: dropped
    unsub()
    expect(seen).toEqual([{ type: 'on', midi: 60, velocity: 90, t: 123 }])
  })

  it('one keyboard on two ports: a duplicate note-on and its off are dropped (P17)', async () => {
    const a = fakeInput('ROLI Piano')
    const b = fakeInput('ROLI Piano Bluetooth')
    stubNavigator(async () => fakeAccess([a, b]))
    await connectMidi()
    const seen: MidiEvent[] = []
    const unsub = onKeyboard((e) => seen.push(e))
    a.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]), timeStamp: 100 })
    b.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]), timeStamp: 102 })
    b.onmidimessage!({ data: new Uint8Array([0x80, 60, 0]), timeStamp: 300 })
    a.onmidimessage!({ data: new Uint8Array([0x80, 60, 0]), timeStamp: 301 })
    // Same port, fast repeat: both kept.
    a.onmidimessage!({ data: new Uint8Array([0x90, 62, 90]), timeStamp: 400 })
    a.onmidimessage!({ data: new Uint8Array([0x90, 62, 90]), timeStamp: 401 })
    unsub()
    expect(seen).toEqual([
      { type: 'on', midi: 60, velocity: 90, t: 100 },
      { type: 'off', midi: 60, t: 301 },
      { type: 'on', midi: 62, velocity: 90, t: 400 },
      { type: 'on', midi: 62, velocity: 90, t: 401 },
    ])
  })

  it('rejection is denied and does not call onConnected', async () => {
    stubNavigator(async () => {
      throw new Error('NotAllowedError')
    })
    let connected = 0
    await connectMidi({ onConnected: () => connected++ })
    expect(midiStatus.value).toEqual({ kind: 'denied' })
    expect(connected).toBe(0)
  })

  it('no requestMIDIAccess is unsupported', async () => {
    stubNavigator()
    await connectMidi()
    expect(midiStatus.value).toEqual({ kind: 'unsupported' })
  })

  it('no inputs at connect time is no-device; hot-plug attaches the new input', async () => {
    const access = fakeAccess([])
    stubNavigator(async () => access)
    await connectMidi()
    expect(midiStatus.value).toEqual({ kind: 'no-device' })
    const input = fakeInput('Roli')
    access.inputs.set('x', input)
    access.onstatechange!()
    expect(midiStatus.value).toEqual({ kind: 'connected', name: 'Roli' })
    const seen: MidiEvent[] = []
    const unsub = onKeyboard((e) => seen.push(e))
    input.onmidimessage!({ data: new Uint8Array([0x90, 61, 70]), timeStamp: 1 })
    unsub()
    expect(seen).toHaveLength(1)
  })

  it('statechange removing the input is no-device and clears held notes', async () => {
    const input = fakeInput('ROLI Piano')
    const access = fakeAccess([input])
    stubNavigator(async () => access)
    await connectMidi()
    emitKeyboard({ type: 'on', midi: 60, velocity: 80, t: 0 })
    expect([...heldNotes.value.held]).toContain(60)
    access.inputs.clear()
    access.onstatechange!()
    expect(midiStatus.value).toEqual({ kind: 'no-device' })
    expect(heldNotes.value.held.size).toBe(0)
    expect(heldNotes.value.sounding.size).toBe(0)
  })

  it('a disconnected-state input is ignored', async () => {
    const input = fakeInput('ROLI Piano')
    const access = fakeAccess([input])
    stubNavigator(async () => access)
    await connectMidi()
    emitKeyboard({ type: 'on', midi: 60, velocity: 80, t: 0 })
    input.state = 'disconnected'
    access.onstatechange!()
    expect(midiStatus.value).toEqual({ kind: 'no-device' })
    expect(heldNotes.value.held.size).toBe(0)
  })

  it('swapping to a different device keeps connected status without clearing held when a device remains', async () => {
    const a = fakeInput('A')
    const access = fakeAccess([a])
    stubNavigator(async () => access)
    await connectMidi()
    const b = fakeInput('ROLI B')
    access.inputs.set('b', b)
    access.onstatechange!()
    expect(midiStatus.value).toEqual({ kind: 'connected', name: 'ROLI B' })
  })
})

describe('disconnectMidi', () => {
  it('detaches handlers, goes off, and clears held notes', async () => {
    const input = fakeInput('ROLI Piano')
    const access = fakeAccess([input])
    stubNavigator(async () => access)
    await connectMidi()
    emitKeyboard({ type: 'on', midi: 60, velocity: 80, t: 0 })
    disconnectMidi()
    expect(midiStatus.value).toEqual({ kind: 'off' })
    expect(heldNotes.value.held.size).toBe(0)
    expect(input.onmidimessage).toBeNull()
    expect(access.onstatechange).toBeNull()
  })
})
