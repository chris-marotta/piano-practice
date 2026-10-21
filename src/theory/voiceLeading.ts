// Voice leading: voice each chord as the inversion closest to the previous chord.
import { chordNotes, maxInversion, type ChordTypeId, type DiatonicChord } from './chords'
import { noteMidi } from './scales'

export interface Voicing {
  notes: string[]
  inversion: number
}

const sortedMidis = (notes: string[]): number[] => notes.map(noteMidi).sort((a, b) => a - b)

/**
 * Total semitone movement from one chord to the next, pairing voices low to high.
 * Chords of different sizes pair only as many voices as the smaller one has.
 */
export function voiceDistance(from: string[], to: string[]): number {
  const a = sortedMidis(from)
  const b = sortedMidis(to)
  let total = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) total += Math.abs((a[i] as number) - (b[i] as number))
  return total
}

/**
 * The first chord in root position at `octave`; each later chord as whichever of its
 * inversions (in the octave below, at, or above `octave`) minimizes voiceDistance to the
 * previous chord. Ties keep the first candidate in the order: lower octave, then lower inversion.
 */
export function voiceLead(chords: { root: string; type: ChordTypeId }[], octave = 4): Voicing[] {
  const out: Voicing[] = []
  for (const c of chords) {
    const prev = out[out.length - 1]
    if (!prev) {
      out.push({ notes: chordNotes(c.root, c.type, 0, octave), inversion: 0 })
      continue
    }
    let best: Voicing | null = null
    let bestDistance = Infinity
    for (const oct of [octave - 1, octave, octave + 1]) {
      for (let inv = 0; inv <= maxInversion(c.type); inv++) {
        const notes = chordNotes(c.root, c.type, inv, oct)
        const d = voiceDistance(prev.notes, notes)
        if (d < bestDistance) {
          bestDistance = d
          best = { notes, inversion: inv }
        }
      }
    }
    out.push(best as Voicing)
  }
  return out
}

export interface CadenceChord extends DiatonicChord, Voicing {}

/** I–IV–I–V–I (or i–iv–i–V|v–i) from a session progression [I, IV, V, vi], voice-led from root position. */
export function voiceLedCadence(progression: DiatonicChord[], octave = 4): CadenceChord[] {
  const [I, IV, V] = progression
  if (!I || !IV || !V) return []
  const seq = [I, IV, I, V, I]
  const voicings = voiceLead(seq, octave)
  return seq.map((c, i) => ({ ...c, ...(voicings[i] as Voicing) }))
}
