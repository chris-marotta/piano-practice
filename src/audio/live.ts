import * as Tone from 'tone'
import { EMPTY_HELD, reduceHeld, type HeldState } from '../midi/held'
import { onClear, onKeyboard } from '../midi/input'
import type { MidiEvent } from '../midi/parse'
import { getSampler } from './piano'

/** Quietest key still audible (0.15) up to full gain (1) at velocity 127. */
export function velocityToGain(v: number): number {
  const clamped = Math.min(127, Math.max(1, v))
  return 0.15 + 0.85 * (clamped / 127)
}

export interface LiveIo {
  attack(midi: number, gain: number): void
  release(midi: number): void
}

export interface LiveVoice {
  handle(e: MidiEvent): void
  releaseAll(): void
}

/**
 * Turns the keyboard event stream into attacks and releases. Owns its own held/pedal state.
 * Every 'on' is a fresh attack, even for a note already sounding under the pedal (reduceHeld
 * reports no release for it; the sampler stops all voices of a note on release, so no ghost).
 * io failures are swallowed: a dead audio context must never break the keyboard stream.
 */
export function createLiveVoice(io: LiveIo): LiveVoice {
  let state: HeldState = EMPTY_HELD
  const safeRelease = (midi: number) => {
    try {
      io.release(midi)
    } catch {
      // ignore
    }
  }
  return {
    handle(e) {
      const r = reduceHeld(state, e)
      state = r.state
      if (e.type === 'on') {
        try {
          io.attack(e.midi, velocityToGain(e.velocity))
        } catch {
          // ignore
        }
      }
      for (const m of r.release) safeRelease(m)
    },
    releaseAll() {
      const sounding = [...state.sounding]
      state = EMPTY_HELD
      for (const m of sounding) safeRelease(m)
    },
  }
}

let activeVoice: LiveVoice | null = null

function noteName(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote()
}

/**
 * Plays the keyboard stream through the piano sampler. Sound is skipped (never throws) when the
 * sampler isn't ready (before the first tap or while samples load) or `enabled()` is false.
 * Releases always go through so turning the setting off mid-note doesn't leave a stuck note.
 * Returns an unsubscribe.
 */
export function startLiveSound(enabled: () => boolean): () => void {
  const voice = createLiveVoice({
    attack(midi, gain) {
      if (!enabled()) return
      // immediate(), not now(): now() adds Tone's 100 ms scheduling lookahead, which is audible lag
      // when playing live.
      getSampler()?.triggerAttack(noteName(midi), Tone.getContext().immediate(), gain)
    },
    release(midi) {
      getSampler()?.triggerRelease(noteName(midi), Tone.getContext().immediate())
    },
  })
  activeVoice = voice
  const offKeys = onKeyboard((e) => voice.handle(e))
  const offClear = onClear(() => voice.releaseAll())
  return () => {
    offKeys()
    offClear()
    voice.releaseAll()
    if (activeVoice === voice) activeVoice = null
  }
}

/** Release every note the live voice is holding (used by stopAll). */
export function releaseLive(): void {
  activeVoice?.releaseAll()
}
