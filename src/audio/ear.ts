import * as Tone from 'tone'
import { walkEvents, compareEvents, homeEvents, promptEvents, createEarVoices, type EarEvent } from './earSchedule'
import type { EarDegree } from '../theory/ear'
import { createEarPump, type EarPump, type EarSamplerLike } from './earPump'
import { getSampler } from './piano'

const LOOKAHEAD_S = 0.2
const TICK_MS = 50
const LEAD_S = 0.05

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
    const start = Tone.now() + LEAD_S
    const io: EarSamplerLike = {
      triggerAttack: (m, t) => s.triggerAttack(noteName(m), t),
      triggerRelease: (m, t) => s.triggerRelease(noteName(m), t),
    }
    const p = createEarPump(io, () => Tone.now(), events, start, voices, LOOKAHEAD_S)
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
    return performance.now() + (startAudio + onset - Tone.now()) * 1000
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
