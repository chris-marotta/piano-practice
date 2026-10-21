import * as Tone from 'tone'
import type { ScaleRef } from '../theory/scales'
import { stopDrone } from './drone'
import { stopMetronome } from './metronome'
import { scaleEvents, scalePlaybackNotes, type NoteEvent } from './schedule'
import { audioReady } from './unlock'

export { scaleEvents, scalePlaybackNotes }

const SAMPLE_FILES = ['C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6']
const LOAD_TIMEOUT_MS = 10_000
const LOOKAHEAD_S = 0.2
const TICK_MS = 50
const BROKEN_CHORD_BPM = 80

let sampler: Tone.Sampler | null = null
let loadPromise: Promise<boolean> | null = null
let playbackTimer: ReturnType<typeof setInterval> | null = null

/** File names use 's' for sharp (Ds2.mp3); the Sampler wants 'D#2'. */
function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {}
  for (const f of SAMPLE_FILES) urls[f.replace('s', '#')] = `${f}.mp3`
  return urls
}

/** Resolves true when the sampler is loaded, false on error or after 10 s. Never rejects; idempotent. */
export function loadPiano(): Promise<boolean> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!ok) sampler = null
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), LOAD_TIMEOUT_MS)
    try {
      const s = new Tone.Sampler({
        urls: sampleUrls(),
        baseUrl: import.meta.env.BASE_URL + 'samples/salamander/',
        release: 1,
        onload: () => {
          sampler = s
          finish(true)
        },
        onerror: () => finish(false),
      }).toDestination()
    } catch {
      finish(false)
    }
  })
  return loadPromise
}

function ready(): Tone.Sampler | null {
  return audioReady.value && sampler && sampler.loaded ? sampler : null
}

function clearPlayback(): void {
  if (playbackTimer !== null) {
    clearInterval(playbackTimer)
    playbackTimer = null
  }
}

/**
 * Lookahead scheduler: a short interval hands notes to the audio clock a fraction of a second ahead,
 * so timing is sample-accurate and stopAll() can cancel everything not yet handed over.
 */
function playEvents(s: Tone.Sampler, events: NoteEvent[], holdSeconds: number): void {
  clearPlayback()
  const start = Tone.now() + 0.05
  let i = 0
  const pump = () => {
    try {
      while (i < events.length && start + (events[i] as NoteEvent).time < Tone.now() + LOOKAHEAD_S) {
        const e = events[i] as NoteEvent
        s.triggerAttackRelease(e.note, holdSeconds, start + e.time)
        i += 1
      }
    } catch {
      i = events.length
    }
    if (i >= events.length) clearPlayback()
  }
  pump()
  if (i < events.length) playbackTimer = setInterval(pump, TICK_MS)
}

/** Right-hand register, ascending then descending, eighth notes at bpm. */
export function playScale(ref: ScaleRef, octaves: 1 | 2, bpm: number): void {
  const s = ready()
  if (!s || !(bpm > 0)) return
  try {
    s.releaseAll()
    const events = scaleEvents(scalePlaybackNotes(ref, octaves), bpm)
    playEvents(s, events, (30 / bpm) * 1.1)
  } catch {
    // never throw into the UI
  }
}

/** Block: all notes at once. Broken: ascending in eighth notes at 80 BPM. */
export function playChord(notes: string[], mode: 'block' | 'broken'): void {
  const s = ready()
  if (!s || notes.length === 0) return
  try {
    clearPlayback()
    s.releaseAll()
    if (mode === 'block') {
      s.triggerAttackRelease(notes, 2.5, Tone.now() + 0.02)
    } else {
      playEvents(s, scaleEvents(notes, BROKEN_CHORD_BPM), 2)
    }
  } catch {
    // never throw into the UI
  }
}

/** Stops piano playback, the drone and the metronome. */
export function stopAll(): void {
  clearPlayback()
  try {
    sampler?.releaseAll()
  } catch {
    // ignore
  }
  stopDrone()
  stopMetronome()
}
