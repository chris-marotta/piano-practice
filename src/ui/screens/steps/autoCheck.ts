// Session auto-check (spec §6), pure: rep tile assignment, chord matching, and the per-step run checker. No Preact,
// no window: time comes in on the notes and through tick(now), so it is unit tested in node.
import type { PlayedNote } from '../../../play/analyse'
import { createRunDetector, type RunHand } from '../../../play/runDetect'
import { expectedRun } from '../../../play/sequence'
import { chordNotes, type DiatonicChord } from '../../../theory/chords'
import { chroma, type ScaleRef } from '../../../theory/scales'
import { judgeRun, type RunOutcome } from '../play/playRun'
import { preferFor } from '../play/playView'

export type RepKind = RunHand

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
 * One run detector for a scale step. A finished run is judged against the RH run (octave 4) or, for a LH run, the LH
 * run (octave 3); Together uses RH. The analyser's octave-offset search absorbs whichever octave was actually played.
 */
export function createStepChecker(ref: ScaleRef, octaves: 1 | 2): StepChecker {
  const rh = expectedRun(ref, octaves, 4)
  const lh = expectedRun(ref, octaves, 3)
  const prefer = preferFor(ref)
  const detector = createRunDetector({ tonicPc: chroma(ref.root), expectedLength: rh.length })
  const judge = (run: ReturnType<typeof detector.push>): StepRun | null =>
    run ? { hand: run.hand, outcome: judgeRun(run.hand === 'lh' ? lh : rh, run, prefer) } : null
  return {
    push: (n) => judge(detector.push(n)),
    tick: (now) => judge(detector.tick(now)),
    reset: () => detector.reset(),
  }
}
