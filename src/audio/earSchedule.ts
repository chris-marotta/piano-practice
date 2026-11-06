// Pure ear-training schedules and note bookkeeping: no Tone.js, no browser APIs.
import { walkHome, type EarDegree } from '../theory/ear'

export const EAR_TONIC_S = 0.8
export const EAR_GAP_S = 0.25
export const EAR_NOTE_S = 1.2
export const EAR_HOME_S = 1.5
export const EAR_HOME_GAP_S = 0.5
export const EAR_WALK_STEP_S = 0.35
export const EAR_WALK_LAST_S = 1.0

export interface EarEvent {
  midi: number
  /** Seconds from the start of playback. */
  time: number
  dur: number
}

export function promptEvents(o: { tonic: number; target: number; withTonic: boolean; home: boolean }): {
  events: EarEvent[]
  onset: number
} {
  if (!o.withTonic && !o.home) return { events: [{ midi: o.target, time: 0, dur: EAR_NOTE_S }], onset: 0 }
  const tonicDur = o.home ? EAR_HOME_S : EAR_TONIC_S
  const onset = tonicDur + (o.home ? EAR_HOME_GAP_S : EAR_GAP_S)
  return {
    events: [
      { midi: o.tonic, time: 0, dur: tonicDur },
      { midi: o.target, time: onset, dur: EAR_NOTE_S },
    ],
    onset,
  }
}

/** The asked note, then each step of its walk home. */
export function walkEvents(tonic: number, degree: EarDegree): EarEvent[] {
  const offsets = walkHome(degree)
  return offsets.map((o, i) => ({
    midi: tonic + o,
    time: i * EAR_WALK_STEP_S,
    dur: i === offsets.length - 1 ? EAR_WALK_LAST_S : EAR_WALK_STEP_S,
  }))
}

/** Just the tonic, for a "Hear home" button. */
export function homeEvents(tonic: number): EarEvent[] {
  return [{ midi: tonic, time: 0, dur: EAR_HOME_S }]
}

/** The tonic, the target and the note that was given, one after another. */
export function compareEvents(tonic: number, target: number, given: number): EarEvent[] {
  return [tonic, target, given].map((midi, i) => ({
    midi,
    time: i * (EAR_NOTE_S + EAR_GAP_S),
    dur: EAR_NOTE_S,
  }))
}

export interface EarVoices {
  start(midi: number): void
  end(midi: number): void
  owned(): number[]
  clear(): number[]
}

/** Bookkeeping of the notes ear audio started and has not released (never a note Chris is holding). */
export function createEarVoices(): EarVoices {
  let list: number[] = []
  const unique = () => [...new Set(list)]
  return {
    start(midi) {
      list.push(midi)
    },
    end(midi) {
      const i = list.indexOf(midi)
      if (i >= 0) list.splice(i, 1)
    },
    owned: unique,
    clear() {
      const out = unique()
      list = []
      return out
    },
  }
}
