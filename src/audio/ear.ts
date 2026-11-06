import * as Tone from 'tone'
import { walkEvents, compareEvents, homeEvents, promptEvents, createEarVoices, type EarEvent } from './earSchedule'
import type { EarDegree } from '../theory/ear'
import { getSampler } from './piano'

const LOOKAHEAD_S = 0.2
const TICK_MS = 50
const LEAD_S = 0.05

const voices = createEarVoices()
let timer: ReturnType<typeof setInterval> | null = null

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
 * Idempotent; never throws.
 */
export function stopEar(): void {
  clearTimer()
  const owned = voices.clear()
  if (owned.length === 0) return
  try {
    const s = getSampler()
    if (!s) return
    const now = Tone.now()
    for (const m of owned) s.triggerRelease(noteName(m), now)
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
    let i = 0
    const ends: { midi: number; at: number }[] = []
    const pump = () => {
      try {
        const now = Tone.now()
        while (i < events.length && start + (events[i] as EarEvent).time < now + LOOKAHEAD_S) {
          const e = events[i] as EarEvent
          const at = start + e.time
          s.triggerAttack(noteName(e.midi), at)
          s.triggerRelease(noteName(e.midi), at + e.dur)
          voices.start(e.midi)
          ends.push({ midi: e.midi, at: at + e.dur })
          i += 1
        }
        for (let k = ends.length - 1; k >= 0; k--) {
          const en = ends[k] as { midi: number; at: number }
          if (en.at <= now) {
            voices.end(en.midi)
            ends.splice(k, 1)
          }
        }
      } catch {
        i = events.length
        ends.length = 0
      }
      if (i >= events.length && ends.length === 0) clearTimer()
    }
    pump()
    if (i < events.length || ends.length > 0) timer = setInterval(pump, TICK_MS)
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
