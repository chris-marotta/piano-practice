// Starting an Ear question's sound, behind injected audio functions (no Tone or Preact import), so it is node-testable.
import type { Question } from '../../drill/engine'

export interface EarPromptArgs {
  tonic: number
  target: number
  withTonic: boolean
  home: boolean
}

export interface EarStartDeps {
  /** Audio unlocked by a user gesture. */
  audioReady(): boolean
  /** The shared, idempotent piano load: true once the sampler exists, false on a failure or the timeout. */
  load(): Promise<boolean>
  /** Plays the prompt; resolves to the note's onset in performance.now() ms, or null. */
  play(o: EarPromptArgs): Promise<number | null>
  /** Stops what ear audio is playing. */
  stop(): void
}

export interface EarStart {
  /**
   * Plays the question and resolves to the note's onset, or null: audio locked ("Tap to hear" rather than scheduling
   * notes into a suspended context), a failed or timed-out load, a newer start or a leave while the piano loaded, or any
   * failure. A load still in flight is waited for, so a normal load never reads as "not ready" (I1). Never throws.
   */
  start(q: Question, o: { first: boolean; level: number }): Promise<number | null>
  /** Next, Skip (the round unmounts) and unmount: a start still waiting for the load never plays. Never throws. */
  leave(): void
}

export function createEarStart(deps: EarStartDeps): EarStart {
  // Bumped by every start and every leave; a start whose number is no longer current after the load drops its prompt.
  let gen = 0
  return {
    async start(q, { first, level }) {
      const mine = ++gen
      try {
        const ear = q.ear
        if (!ear || !deps.audioReady()) return null
        if (!(await deps.load())) return null
        if (mine !== gen) return null
        return await deps.play({ tonic: ear.tonic, target: ear.target, withTonic: ear.withTonic, home: level === 6 && first })
      } catch {
        return null
      }
    },
    leave() {
      gen++
      try {
        deps.stop()
      } catch {
        // never throws into the UI
      }
    },
  }
}
