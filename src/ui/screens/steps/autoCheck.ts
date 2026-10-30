// Session auto-check (spec §6), pure: the current rep tile, chord matching, and the per-step run checker. No Preact,
// no window: time comes in on the notes and through tick(now), so it is unit tested in node.
import { analyseRun, type PlayedNote } from '../../../play/analyse'
import { createRunDetector, type FinishedRun } from '../../../play/runDetect'
import { expectedRun } from '../../../play/sequence'
import { chordNotes, type DiatonicChord } from '../../../theory/chords'
import { chroma, type ScaleRef } from '../../../theory/scales'
import { outcomeOf, type RunOutcome } from '../play/playRun'
import { preferFor } from '../play/playView'

/** A rep tile's hand. The detector only says Together or single; the current tile says which hand a single run is. */
export type RepKind = 'rh' | 'lh' | 'together'

/** The six rep tiles, in order: Right hand ×2, Left hand ×2, Together ×2. */
export const REP_KINDS: RepKind[] = ['rh', 'rh', 'lh', 'lh', 'together', 'together']

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

/** The tile the next run fills: the picked one if it is empty, else the first empty one, else null (all six filled). */
export function currentTile(tiles: Tile[], picked: number | null): number | null {
  if (picked !== null && tiles[picked] && !tiles[picked].ticked) return picked
  const first = tiles.findIndex((t) => !t.ticked)
  return first === -1 ? null : first
}

/** A detected run fills tile i with its result. */
export const fillTile = (tiles: Tile[], i: number, outcome: RunOutcome): Tile[] =>
  tiles.map((t, j) => (j === i ? { ticked: true, result: outcome } : t))

/**
 * What a finished run does to the rep tiles. A filled run fills the current tile and only it, and clears `picked`.
 * A wrongShape run changes nothing but returns the note to show (for the tile that was current). With all six
 * filled there is no current tile: nothing changes and there is no note.
 */
export function applyRun(
  tiles: Tile[],
  picked: number | null,
  run: StepRun,
): { tiles: Tile[]; picked: number | null; note: string | null } {
  const i = currentTile(tiles, picked)
  if (i === null) return { tiles, picked, note: null }
  if (run.kind === 'wrongShape') return { tiles, picked, note: wrongShapeText(run.heard, REP_KINDS[i] ?? 'rh') }
  return { tiles: fillTile(tiles, i, run.outcome), picked: null, note: null }
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

/** A finished run: filled into the current tile, or the wrong shape for it (it never ticks anything). */
export type StepRun = { kind: 'filled'; outcome: RunOutcome } | { kind: 'wrongShape'; heard: 'one' | 'both' }

/** What the player is told when a run was the wrong shape for the current tile. */
export function wrongShapeText(heard: 'one' | 'both', wanted: RepKind): string {
  const heardText = heard === 'one' ? 'one hand' : 'both hands'
  const wantedText = wanted === 'together' ? 'both hands' : wanted === 'rh' ? 'the right hand' : 'the left hand'
  return `That sounded like ${heardText}. This one's ${wantedText}.`
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
 * One run detector for a scale step. The current tile decides the hand: a finished run is analysed against the
 * one-octave run from octave 3 (LH tile) or 4 (otherwise), and the analyser's octave-offset search absorbs whichever
 * octave was actually played. The detector's Together / single must match the tile's kind, else the run is a
 * wrongShape. `current()` is read when a run finishes; null (all six filled) drops the run.
 */
export function createStepChecker(ref: ScaleRef, current: () => RepKind | null): StepChecker {
  const prefer = preferFor(ref)
  const detector = createRunDetector({ tonicPc: chroma(ref.root), expectedLength: expectedRun(ref, 1, 4).length })
  const judge = (run: FinishedRun | null): StepRun | null => {
    const kind = current()
    if (!run || kind === null) return null
    const together = run.hand === 'together'
    if (together !== (kind === 'together')) return { kind: 'wrongShape', heard: together ? 'both' : 'one' }
    const a = analyseRun(expectedRun(ref, 1, kind === 'lh' ? 3 : 4), run.notes, { together, prefer })
    return { kind: 'filled', outcome: outcomeOf(a, prefer) }
  }
  return {
    push: (n) => judge(detector.push(n)),
    tick: (now) => judge(detector.tick(now)),
    reset: () => detector.reset(),
  }
}
