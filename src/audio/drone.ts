import * as Tone from 'tone'
import { transpose } from '../theory/scales'
import { audioReady } from './unlock'

const FADE_SECONDS = 1.5
const DB_MIN = -40
const DB_MAX = 0

interface Drone {
  synth: Tone.PolySynth
  filter: Tone.Filter
  notes: string[]
}

let current: Drone | null = null

function releaseDrone(d: Drone): void {
  try {
    d.synth.releaseAll()
    // Let the 1.5 s release tail finish before tearing the nodes down.
    setTimeout(() => {
      try {
        d.synth.dispose()
        d.filter.dispose()
      } catch {
        // already disposed
      }
    }, (FADE_SECONDS + 0.3) * 1000)
  } catch {
    // teardown must never throw into the UI
  }
}

/** Tonic at octave 2 plus the fifth above, soft triangle through a ~800 Hz low-pass. Replaces any running drone (crossfade). */
export function startDrone(root: string, volumeDb: number): void {
  if (!audioReady.value) return
  try {
    const db = Math.min(DB_MAX, Math.max(DB_MIN, Number.isFinite(volumeDb) ? volumeDb : DB_MIN))
    const tonic = `${root}2`
    const notes = [tonic, transpose(tonic, '5P')]
    const filter = new Tone.Filter({ frequency: 800, type: 'lowpass', rolloff: -12 }).toDestination()
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: FADE_SECONDS, decay: 0, sustain: 1, release: FADE_SECONDS },
      volume: db,
    }).connect(filter)
    synth.triggerAttack(notes)
    const old = current
    current = { synth, filter, notes }
    if (old) releaseDrone(old)
  } catch {
    // leave any previous drone as it was
  }
}

/** Fades out over 1.5 s, then disposes. Safe to call when nothing is playing. */
export function stopDrone(): void {
  const d = current
  current = null
  if (d) releaseDrone(d)
}
