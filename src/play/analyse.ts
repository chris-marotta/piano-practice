import { formatNote } from '../theory/format'
import { midiToName } from '../theory/scales'
import { PAIR_WINDOW_MS } from './thresholds'
import type { Expected } from './sequence'

export interface PlayedNote {
  midi: number
  /** Onset in ms. */
  t: number
}

export interface RunIssue {
  kind: 'wrong' | 'missed' | 'extra'
  /** Index of the expected note (for an extra: the next expected note, expected.length at the end). */
  index: number
  expected?: Expected
  /** The real MIDI number played (not offset-adjusted). */
  played?: number
  direction: 'up' | 'down'
}

export interface RunAnalysis {
  wrong: RunIssue[]
  missed: RunIssue[]
  extra: RunIssue[]
  slips: number
  evenness: number | null
  tempo: number | null
  notes: number
  /** Octave shift (semitones, multiple of 12) that best lines the played run up with the expected one. */
  offset: number
}

const OFFSETS = [-36, -24, -12, 0, 12, 24, 36]
const MIN_INTERVALS = 4

/**
 * Together mode: an exact-octave pair (12 semitones, within PAIR_WINDOW_MS) becomes one note. The upper note is kept,
 * stamped with the earlier onset of the two. Each note joins at most one pair; unpaired notes pass through.
 */
export function collapsePairs(played: PlayedNote[]): PlayedNote[] {
  const sorted = [...played].sort((a, b) => a.t - b.t)
  const used = new Array<boolean>(sorted.length).fill(false)
  const out: PlayedNote[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue
    const a = sorted[i] as PlayedNote
    let partner = -1
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j] as PlayedNote
      if (b.t - a.t > PAIR_WINDOW_MS) break
      if (!used[j] && Math.abs(b.midi - a.midi) === 12) {
        partner = j
        break
      }
    }
    used[i] = true
    if (partner === -1) {
      out.push(a)
      continue
    }
    used[partner] = true
    const b = sorted[partner] as PlayedNote
    out.push({ midi: Math.max(a.midi, b.midi), t: Math.min(a.t, b.t) })
  }
  return out
}

type Step = 'match' | 'wrong' | 'missed' | 'extra'

interface Alignment {
  cost: number
  /** Steps in order; each carries the expected index (i) and played index (j) it concerns. */
  steps: { step: Step; i: number; j: number }[]
}

/** Levenshtein of expected vs played-minus-offset. Backtrace tie-break: substitution, then deletion (missed), then insertion (extra). */
function align(expected: number[], played: number[]): Alignment {
  const n = expected.length
  const m = played.length
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = 1; i <= n; i++) (d[i] as number[])[0] = i
  for (let j = 1; j <= m; j++) (d[0] as number[])[j] = j
  const cell = (i: number, j: number): number => (d[i] as number[])[j] as number
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = cell(i - 1, j - 1) + (expected[i - 1] === played[j - 1] ? 0 : 1)
      ;(d[i] as number[])[j] = Math.min(sub, cell(i - 1, j) + 1, cell(i, j - 1) + 1)
    }
  }
  const steps: Alignment['steps'] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const same = expected[i - 1] === played[j - 1]
      if (cell(i, j) === cell(i - 1, j - 1) + (same ? 0 : 1)) {
        steps.push({ step: same ? 'match' : 'wrong', i: i - 1, j: j - 1 })
        i--
        j--
        continue
      }
    }
    if (i > 0 && cell(i, j) === cell(i - 1, j) + 1) {
      steps.push({ step: 'missed', i: i - 1, j: -1 })
      i--
      continue
    }
    steps.push({ step: 'extra', i, j: j - 1 })
    j--
  }
  return { cost: cell(n, m), steps: steps.reverse() }
}

function intervals(onsets: number[]): number[] {
  const out: number[] = []
  for (let k = 1; k < onsets.length; k++) out.push((onsets[k] as number) - (onsets[k - 1] as number))
  return out
}

/** 1 - stdev/mean of the gaps between onsets (population stdev), clamped to 0..1. Null under 4 gaps. */
export function evenness(onsets: number[]): number | null {
  const iois = intervals(onsets)
  if (iois.length < MIN_INTERVALS) return null
  const mean = iois.reduce((s, x) => s + x, 0) / iois.length
  if (mean <= 0) return null
  const variance = iois.reduce((s, x) => s + (x - mean) ** 2, 0) / iois.length
  return Math.min(1, Math.max(0, 1 - Math.sqrt(variance) / mean))
}

/** round(30 / median gap in seconds). Null under 4 gaps (ASSUMED: same floor as evenness). */
export function tempoFromOnsets(onsets: number[]): number | null {
  const iois = intervals(onsets).sort((a, b) => a - b)
  if (iois.length < MIN_INTERVALS) return null
  const mid = iois.length >> 1
  const median = iois.length % 2 ? (iois[mid] as number) : ((iois[mid - 1] as number) + (iois[mid] as number)) / 2
  if (median <= 0) return null
  return Math.round(30 / (median / 1000))
}

/**
 * Compare what was played against the expected run. Tries each whole-octave shift of the played notes (-36..+36)
 * and keeps the cheapest alignment; ties go to the shift closest to 0 (then the upward one).
 */
export function analyseRun(
  expected: Expected[],
  played: PlayedNote[],
  opts: { together: boolean; prefer: '#' | 'b' },
): RunAnalysis {
  const notes = (opts.together ? collapsePairs(played) : [...played]).sort((a, b) => a.t - b.t)
  const expMidi = expected.map((e) => e.midi)
  const ordered = [...OFFSETS].sort((a, b) => Math.abs(a) - Math.abs(b) || b - a)
  let best: { offset: number; alignment: Alignment } | null = null
  for (const offset of ordered) {
    const alignment = align(expMidi, notes.map((p) => p.midi - offset))
    if (!best || alignment.cost < best.alignment.cost) best = { offset, alignment }
  }
  const { offset, alignment } = best as { offset: number; alignment: Alignment }

  const top = expMidi.indexOf(Math.max(...expMidi))
  const direction = (index: number): 'up' | 'down' => (index <= top ? 'up' : 'down')
  const wrong: RunIssue[] = []
  const missed: RunIssue[] = []
  const extra: RunIssue[] = []
  for (const { step, i, j } of alignment.steps) {
    if (step === 'wrong') {
      wrong.push({ kind: 'wrong', index: i, expected: expected[i], played: (notes[j] as PlayedNote).midi, direction: direction(i) })
    } else if (step === 'missed') {
      missed.push({ kind: 'missed', index: i, expected: expected[i], direction: direction(i) })
    } else if (step === 'extra') {
      extra.push({ kind: 'extra', index: i, played: (notes[j] as PlayedNote).midi, direction: direction(i) })
    }
  }
  const onsets = notes.map((p) => p.t)
  return {
    wrong,
    missed,
    extra,
    slips: wrong.length + missed.length + extra.length,
    evenness: evenness(onsets),
    tempo: tempoFromOnsets(onsets),
    notes: notes.length,
    offset,
  }
}

/** Note name without octave, display symbols: 'F#4' -> 'F♯'. */
function plain(name: string): string {
  return formatNote(name.replace(/-?\d+$/, ''))
}

export function describeIssue(i: RunIssue, prefer: '#' | 'b'): string {
  const played = i.played === undefined ? '' : plain(midiToName(i.played, prefer))
  const expected = i.expected ? plain(i.expected.name) : ''
  if (i.kind === 'wrong') return `Played ${played} instead of ${expected} going ${i.direction}`
  if (i.kind === 'missed') return `Missed ${expected} going ${i.direction}`
  return `Extra ${played} going ${i.direction}`
}
