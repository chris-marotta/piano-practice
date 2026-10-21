import * as Tone from 'tone'
import { audioReady } from './unlock'

interface Running {
  accent: Tone.Synth
  tick: Tone.Synth
  loop: Tone.Loop
}

let running: Running | null = null

function makeClick(volume: number): Tone.Synth {
  return new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume,
  }).toDestination()
}

/** 4/4 click with beat 1 accented. Restarting replaces any running metronome. Silent no-op before unlock. */
export function startMetronome(bpm: number): void {
  stopMetronome()
  if (!audioReady.value || !(bpm > 0)) return
  try {
    const transport = Tone.getTransport()
    transport.bpm.value = bpm
    const accent = makeClick(-4)
    const tick = makeClick(-12)
    let beat = 0
    const loop = new Tone.Loop((time) => {
      if (beat % 4 === 0) accent.triggerAttackRelease('A5', '32n', time)
      else tick.triggerAttackRelease('E5', '32n', time)
      beat += 1
    }, '4n')
    loop.start(0)
    transport.start('+0.05')
    running = { accent, tick, loop }
  } catch {
    stopMetronome()
  }
}

export function stopMetronome(): void {
  const r = running
  running = null
  if (!r) return
  try {
    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel(0)
    r.loop.dispose()
    r.accent.dispose()
    r.tick.dispose()
  } catch {
    // audio teardown must never throw into the UI
  }
}
