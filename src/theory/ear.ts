// Ear training: the 12 scale degrees, tonic placement, spelling, routes, choices, walk home. Pure.
import { Note, transpose } from '@tonaljs/tonal'

export type EarDegree = '1' | 'b2' | '2' | 'b3' | '3' | '4' | '#4' | '5' | 'b6' | '6' | 'b7' | '7'

export interface EarDegreeInfo {
  degree: EarDegree
  semis: number
  interval: string
  label: string
  whyName: string
  feel: string
  walk: number[]
}

export const EAR_DEGREES: EarDegreeInfo[] = [
  { degree: '1', semis: 0, interval: '1P', label: '1', whyName: 'home', feel: 'Home: everything settles here.', walk: [] },
  { degree: 'b2', semis: 1, interval: '2m', label: '♭2', whyName: '♭2', feel: 'Tense and dark: it slides down ♭2–1.', walk: [1, 0] },
  { degree: '2', semis: 2, interval: '2M', label: '2', whyName: '2nd', feel: 'Unsettled: it steps down 2–1 home.', walk: [2, 0] },
  { degree: 'b3', semis: 3, interval: '3m', label: '♭3', whyName: '♭3', feel: 'The minor colour: it slides down ♭3–2–1.', walk: [3, 2, 0] },
  { degree: '3', semis: 4, interval: '3M', label: '3', whyName: '3rd', feel: 'Bright and settled: it steps down 3–2–1.', walk: [4, 2, 0] },
  { degree: '4', semis: 5, interval: '4P', label: '4', whyName: '4th', feel: 'It wants to fall: 4–3–2–1.', walk: [5, 4, 2, 0] },
  { degree: '#4', semis: 6, interval: '4A', label: '♯4', whyName: '♯4', feel: 'The odd one out: it leans up into 5, then 6–7–8.', walk: [6, 7, 9, 11, 12] },
  { degree: '5', semis: 7, interval: '5P', label: '5', whyName: '5th', feel: 'Stable: it walks up 5–6–7–8 home.', walk: [7, 9, 11, 12] },
  { degree: 'b6', semis: 8, interval: '6m', label: '♭6', whyName: '♭6', feel: 'Dark: it sinks into 5, then 6–7–8.', walk: [8, 7, 9, 11, 12] },
  { degree: '6', semis: 9, interval: '6M', label: '6', whyName: '6th', feel: 'Warm: it walks up 6–7–8.', walk: [9, 11, 12] },
  { degree: 'b7', semis: 10, interval: '7m', label: '♭7', whyName: '♭7', feel: 'Bluesy: it drops to 6, then 7–8.', walk: [10, 9, 11, 12] },
  { degree: '7', semis: 11, interval: '7M', label: '7', whyName: '7th', feel: 'It leans up into home.', walk: [11, 12] },
]

export const EAR_LEVEL_DEGREES: Record<1 | 2 | 3 | 4 | 5, EarDegree[]> = {
  1: ['1', '5'],
  2: ['3', '4'],
  3: ['2', '6', '7'],
  4: ['b3', 'b6', 'b7'],
  5: ['b2', '#4'],
}

/** Below this level the key is C; from it on, the round's tonic. */
export const EAR_KEY_LEVEL = 4

const INFO = new Map<EarDegree, EarDegreeInfo>(EAR_DEGREES.map((d) => [d.degree, d]))
const info = (d: EarDegree): EarDegreeInfo => INFO.get(d) as EarDegreeInfo

export function isEarDegree(s: string): s is EarDegree {
  return INFO.has(s as EarDegree)
}

/** The tonic sits in 55-66 (G3..F#4). */
export function earTonicMidi(root: string): number {
  const chroma = Note.chroma(root) as number
  return 55 + ((((chroma - 55) % 12) + 12) % 12)
}

/** Degree 1 sounds an octave above the tonic. */
export function earTarget(tonic: number, degree: EarDegree): number {
  const s = info(degree).semis
  return tonic + (s === 0 ? 12 : s)
}

export function degreeOf(tonic: number, midi: number): EarDegree {
  const pc = (((midi - tonic) % 12) + 12) % 12
  return EAR_DEGREES[pc]!.degree
}

/** ASCII pitch class, no octave. Simplified only when it would carry a double accidental. */
export function earSpelling(root: string, degree: EarDegree): string {
  const raw = Note.pitchClass(transpose(root + '4', info(degree).interval))
  return /##|bb/.test(raw) ? Note.pitchClass(Note.simplify(raw)) : raw
}

const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11]

/** Tonic plus the major-degree steps below the target. */
export function earRoute(tonic: number, degree: EarDegree): number[] {
  const s = info(degree).semis
  return [tonic, ...MAJOR_OFFSETS.filter((o) => o > 0 && o < s).map((o) => tonic + o)]
}

export function walkHome(degree: EarDegree): number[] {
  return [...info(degree).walk]
}

const CONFUSIONS: Record<EarDegree, EarDegree[]> = {
  '1': ['7'], b2: [], '2': ['b3'], b3: ['3', '2'], '3': ['b3'], '4': ['5'], '#4': [],
  '5': ['4'], b6: ['6'], '6': ['b6'], b7: ['7'], '7': ['1', 'b7'],
}
const MAJOR_FILL: EarDegree[] = ['3', '4', '2', '6', '7', '5', '1']
const MAJORS: EarDegree[] = ['1', '2', '3', '4', '5', '6', '7']

/** Four distinct choices, the target included, shuffled with `rng`. */
export function earChoices(degree: EarDegree, pool: EarDegree[], rng: () => number): EarDegree[] {
  const allowed = new Set<EarDegree>([...pool, ...MAJORS])
  const s = info(degree).semis
  const dist = (d: EarDegree): number => {
    const x = Math.abs(info(d).semis - s)
    return Math.min(x, 12 - x)
  }
  const neighbours = [EAR_DEGREES[(s + 11) % 12]!.degree, EAR_DEGREES[(s + 1) % 12]!.degree]
  const sortedPool = [...pool].sort((a, b) => dist(a) - dist(b) || info(a).semis - info(b).semis)
  const taken: EarDegree[] = []
  for (const c of [...CONFUSIONS[degree], ...neighbours, ...sortedPool, ...MAJOR_FILL]) {
    if (taken.length === 3) break
    if (allowed.has(c) && c !== degree && !taken.includes(c)) taken.push(c)
  }
  const out = [...taken, degree]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
