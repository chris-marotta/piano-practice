// Lookahead pump for ear audio, behind an injectable sampler and clock. No Tone import, so it is node-testable.
import type { EarEvent, EarVoices } from './earSchedule'

export interface EarSamplerLike {
  triggerAttack(midi: number, time: number): void
  triggerRelease(midi: number, time: number): void
}

export interface EarPump {
  /** Hands over what falls inside the lookahead window. Returns true when everything is attacked and released. */
  tick(): boolean
  /** Releases exactly the notes this pump started and hasn't released, at now(). Never releaseAll. */
  stop(): void
}

/**
 * A note's release is issued only once its end falls inside the lookahead window. Tone's Sampler forgets a
 * pitch's active sources on triggerRelease, so an up-front release would leave stop() nothing to cut.
 */
export function createEarPump(
  sampler: EarSamplerLike,
  now: () => number,
  events: EarEvent[],
  start: number,
  voices: EarVoices,
  lookahead: number,
): EarPump {
  let i = 0
  let releases: { midi: number; at: number }[] = []
  let dead = false
  const stop = () => {
    dead = true
    releases = []
    i = events.length
    try {
      const t = now()
      for (const m of voices.clear()) sampler.triggerRelease(m, t)
    } catch {
      // never throw into the UI
    }
  }
  return {
    stop,
    tick() {
      if (dead) return true
      try {
        const horizon = now() + lookahead
        while (i < events.length && start + (events[i] as EarEvent).time < horizon) {
          const e = events[i] as EarEvent
          sampler.triggerAttack(e.midi, start + e.time)
          voices.start(e.midi)
          releases.push({ midi: e.midi, at: start + e.time + e.dur })
          i += 1
        }
        releases = releases.filter((r) => {
          if (r.at >= horizon) return true
          sampler.triggerRelease(r.midi, r.at)
          voices.end(r.midi)
          return false
        })
      } catch {
        stop()
        return true
      }
      return i >= events.length && releases.length === 0
    },
  }
}
