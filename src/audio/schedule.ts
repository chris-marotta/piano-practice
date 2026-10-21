// Pure scheduling helpers: no Tone.js, no browser APIs, safe to import in node tests.
import { scaleSequence, type ScaleRef } from '../theory/scales'

export interface NoteEvent {
  note: string
  /** Seconds from the start of playback. */
  time: number
}

/** Space notes at eighth-note intervals: one eighth note = 30 / bpm seconds. */
export function scaleEvents(notes: string[], bpm: number): NoteEvent[] {
  const eighth = 30 / bpm
  return notes.map((note, i) => ({ note, time: i * eighth }))
}

/** Right-hand register (starts at octave 4): ascending then descending, top note not repeated. */
export function scalePlaybackNotes(ref: ScaleRef, octaves: 1 | 2): string[] {
  const { ascending, descending } = scaleSequence(ref, octaves, 4)
  return [...ascending, ...descending.slice(1)]
}
