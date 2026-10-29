// Session auto-check (spec §6), pure: rep tile assignment, chord matching, and the per-step run checker. No Preact,
// no window: time comes in on the notes and through tick(now), so it is unit tested in node.
import { analyseRun, type PlayedNote } from '../../../play/analyse'
import { createRunDetector, type FinishedRun } from '../../../play/runDetect'
import { expectedRun } from '../../../play/sequence'
import { chordNotes, type DiatonicChord } from '../../../theory/chords'
import { chroma, type ScaleRef } from '../../../theory/scales'
import { outcomeOf, type RunOutcome } from '../play/playRun'
import { preferFor } from '../play/playView'

/** A rep tile's hand. The detector only says Together or single; P15 splits single into RH / LH by octave offset. */
export type RepKind = 'rh' | 'lh' | 'together'

/** P15: a one-hand run this many semitones (or more) below the RH run from octave 4 is the left hand. */
const LH_OFFSET = 12

/** The six rep tiles, in order: Right hand ×2, Left hand ×2, Together ×2. */
export const REP_KINDS: RepKind[] = ['rh', 'rh', 'lh', 'lh', 'together', 'together']

/** The first unticked tile of that kind, else the first unticked tile of any kind, else null (all ticked). */
export function assignRun(ticked: boolean[], hand: RepKind): number | null {
  const own = REP_KINDS.findIndex((k, i) => k === hand && !ticked[i])
  if (own !== -1) return own
  const any = REP_KINDS.findIndex((_k, i) => !ticked[i])
  return any === -1 ? null : any
}

/** Held keys spell the chord: pitch-class set equality, any inversion, doublings allowed. */
export function chordMatched(held: ReadonlySet<number>, chordRoot: string, type: DiatonicChord['type']): boolean {
  const want = new Set(chordNotes(chordRoot, type, 0).map(chroma))
  const have = new Set([...held].map((m) => ((m % 12) + 12) % 12))
  return have.size === want.size && [...have].every((pc) => want.has(pc))
}

// ---- rep tiles ----

/** A rep tile: ticked by hand (result null) or by a detected run (its result). */
export interface Tile {
  ticked: boolean
  result: RunOutcome | null
}

export const emptyTiles = (): Tile[] => REP_KINDS.map(() => ({ ticked: false, result: null }))

/** A detected run ticks the tile assignRun picks. All six ticked: the run is dropped (same tiles returned). */
export function placeRun(tiles: Tile[], hand: RepKind, result: RunOutcome): Tile[] {
  const i = assignRun(
    tiles.map((t) => t.ticked),
    hand,
  )
  if (i === null) return tiles
  return tiles.map((t, j) => (j === i ? { ticked: true, result } : t))
}

/** v1 hand toggle (for a tile with no detected result). */
export const toggleTile = (tiles: Tile[], i: number): Tile[] =>
  tiles.map((t, j) => (j === i ? { ticked: !t.ticked, result: null } : t))

/** "Untick" on a detected tile's result card: the tile is free again and its run no longer counts. */
export const untick = (tiles: Tile[], i: number): Tile[] =>
  tiles.map((t, j) => (j === i ? { ticked: false, result: null } : t))

/** Tile result line: "✓" when clean, else "{n} slip(s)"; evenness as a whole percent, null when unknown. */
export function tileResult(r: RunOutcome): { clean: boolean; slips: string; evenness: string | null } {
  return {
    clean: r.slips === 0,
    slips: r.slips === 0 ? '✓' : `${r.slips} slip${r.slips === 1 ? '' : 's'}`,
    evenness: r.evenness === null ? null : `${Math.round(r.evenness * 100)}%`,
  }
}

// ---- run checker ----

export interface StepRun {
  hand: RepKind
  outcome: RunOutcome
}

export interface StepChecker {
  /** Feed one note-on. Returns the run this note finished, if any. */
  push(n: PlayedNote): StepRun | null
  /** Call every 250 ms; finishes a run after its silence windows. */
  tick(now: number): StepRun | null
  /** Abandon the run in progress (unplug, Reset keys). */
  reset(): void
}

/**
 * One run detector for a scale step. Every run is analysed against the RH run from octave 4; the analyser's
 * octave-offset search absorbs whichever octave was actually played. Hand (P15): Together comes from the detector's
 * pair ratio; a single-hand run is LH when its offset is an octave or more below (≤ −12), else RH. (A pitch-median
 * split read LH runs from G3, A3 or B3 as RH, so the detector no longer guesses the hand.)
 */
export function createStepChecker(ref: ScaleRef, octaves: 1 | 2): StepChecker {
  const rh = expectedRun(ref, octaves, 4)
  const prefer = preferFor(ref)
  const detector = createRunDetector({ tonicPc: chroma(ref.root), expectedLength: rh.length })
  const judge = (run: FinishedRun | null): StepRun | null => {
    if (!run) return null
    const together = run.hand === 'together'
    const a = analyseRun(rh, run.notes, { together, prefer })
    const hand: RepKind = together ? 'together' : a.offset <= -LH_OFFSET ? 'lh' : 'rh'
    return { hand, outcome: outcomeOf(a, prefer) }
  }
  return {
    push: (n) => judge(detector.push(n)),
    tick: (now) => judge(detector.tick(now)),
    reset: () => detector.reset(),
  }
}
