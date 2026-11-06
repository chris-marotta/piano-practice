import * as Tone from 'tone'
import { walkEvents, compareEvents, homeEvents, promptEvents, createEarVoices, type EarEvent } from './earSchedule'
import type { EarDegree } from '../theory/ear'
import { createEarPump, type EarPump, type EarSamplerLike } from './earPump'
import { getSampler } from './piano'

const LOOKAHEAD_S = 0.2
const TICK_MS = 50
/**
 * How far ahead of the raw context clock a schedule starts: the 0.05 s lead plus the 0.1 s headroom Tone.now()'s
 * lookAhead used to add, so the notes sound when they did before M1 (start = currentTime + 0.15 s).
 */
const LEAD_S = 0.15

/**
 * The raw audio context clock (currentTime, no Tone lookAhead): the clock the Sampler's attacks play on. Tone.now() is
 * currentTime + 0.1 s, so converting with it put the answer clock ~100 ms before the note sounded (M1). Every time in
 * this module, the schedule start, the pump's clock and the onset conversion, is on this clock.
 */
const audioNow = (): number => Tone.immediate()

const voices = createEarVoices()
let timer: ReturnType<typeof setInterval> | null = null
let pump: EarPump | null = null

function clearTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

const noteName = (midi: number): string => Tone.Frequency(midi, 'midi').toNote()

/**
 * Cancels ear audio's pending notes and releases only the notes it started.
 * Never releaseAll: a key Chris is holding with Keyboard sound on keeps sounding.
 * Known limit (R-C11): Tone's Sampler has no per-voice release, so releasing an ear note also cuts a held key
 * of the same pitch. Idempotent; never throws.
 */
export function stopEar(): void {
  clearTimer()
  const p = pump
  pump = null
  try {
    if (p) p.stop()
    else voices.clear()
  } catch {
    // never throw into the UI
  }
}

/** Own lookahead pump (separate from piano.ts). Returns the audio-clock start, or null if it cannot play. */
function schedule(events: EarEvent[]): number | null {
  const s = getSampler()
  if (!s || events.length === 0) return null
  try {
    stopEar()
    const start = audioNow() + LEAD_S
    const io: EarSamplerLike = {
      triggerAttack: (m, t) => s.triggerAttack(noteName(m), t),
      triggerRelease: (m, t) => s.triggerRelease(noteName(m), t),
    }
    const p = createEarPump(io, audioNow, events, start, voices, LOOKAHEAD_S)
    pump = p
    if (!p.tick()) {
      timer = setInterval(() => {
        if (p.tick()) {
          clearTimer()
          if (pump === p) pump = null
        }
      }, TICK_MS)
    } else if (pump === p) pump = null
    return start
  } catch {
    return null
  }
}

/** Plays the prompt; resolves with the note's onset in the performance.now() timebase, or null. */
export async function playEarPrompt(o: {
  tonic: number
  target: number
  withTonic: boolean
  home: boolean
}): Promise<number | null> {
  try {
    const { events, onset } = promptEvents(o)
    const startAudio = schedule(events)
    if (startAudio === null) return null
    return performance.now() + (startAudio + onset - audioNow()) * 1000
  } catch {
    return null
  }
}

export function playWalk(tonic: number, degree: EarDegree): void {
  schedule(walkEvents(tonic, degree))
}

export function playCompare(tonic: number, target: number, given: number): void {
  schedule(compareEvents(tonic, target, given))
}

export function playHome(tonic: number): void {
  stopEar()
  schedule(homeEvents(tonic))
}
