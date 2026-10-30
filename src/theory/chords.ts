import { Chord, Note } from '@tonaljs/tonal'
import { MAJOR_ROOTS, MINOR_ROOTS, type ScaleRef, scaleNotes } from './scales'

export type ChordTypeId = 'M' | 'm' | 'dim' | 'aug' | 'sus2' | 'sus4' | 'maj7' | '7' | 'm7' | 'm7b5' | 'dim7' | '6' | 'add9' | '9'

export const CHORD_TYPES: { id: ChordTypeId; label: string }[] = [
  { id: 'M', label: 'Major' },
  { id: 'm', label: 'Minor' },
  { id: 'dim', label: 'Diminished' },
  { id: 'aug', label: 'Augmented' },
  { id: 'sus2', label: 'sus2' },
  { id: 'sus4', label: 'sus4' },
  { id: 'maj7', label: 'maj7' },
  { id: '7', label: '7' },
  { id: 'm7', label: 'm7' },
  { id: 'm7b5', label: 'm7♭5' },
  { id: 'dim7', label: 'dim7' },
  { id: '6', label: '6' },
  { id: 'add9', label: 'add9' },
  { id: '9', label: '9' },
]

/** Notes of the chord in root position, with octaves, ascending. */
function rootPositionNotes(root: string, type: ChordTypeId, octave: number): string[] {
  return Chord.getChord(type, `${root}${octave}`).notes
}

/** Each chord tone's number above the root, low to high in root position: 1 3 5 7 for a seventh, 1 2 5 for sus2, 1 3 5 9 for add9. */
export function chordDegrees(type: ChordTypeId): number[] {
  return Chord.getChord(type, 'C4').intervals.map((i) => parseInt(i, 10))
}

/** 3rd inversion only where there is a 7th (spec 3.3); triads, 6 and add9 stop at 2nd. */
const MAX_INVERSION: Record<ChordTypeId, number> = {
  M: 2, m: 2, dim: 2, aug: 2, sus2: 2, sus4: 2,
  maj7: 3, '7': 3, m7: 3, m7b5: 3, dim7: 3, '9': 3,
  '6': 2, add9: 2,
}

export function maxInversion(type: ChordTypeId): number {
  return MAX_INVERSION[type]
}

/** Inversion k moves each of the lowest k notes up whole octaves until it sits above the current top note, so the result always ascends (add9/9 have a 9th already above the octave). */
export function chordNotes(root: string, type: ChordTypeId, inversion: number, octave = 4): string[] {
  const result = rootPositionNotes(root, type, octave)
  for (let i = 0; i < inversion; i++) {
    let moved = Note.transpose(result.shift() as string, '8P')
    const top = Note.midi(result[result.length - 1] as string) as number
    while ((Note.midi(moved) as number) < top) moved = Note.transpose(moved, '8P')
    result.push(moved)
  }
  return result
}

type Hand = 'rh' | 'lh'

/** Triads (incl. dim, aug, sus) share one table by inversion. */
const TRIAD_FINGERING: Record<Hand, number[][]> = {
  rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
  lh: [[5, 3, 1], [5, 3, 1], [5, 2, 1]],
}

/** Four-note chords in root position only. */
const FOUR_NOTE_FINGERING: Record<Hand, number[]> = {
  rh: [1, 2, 3, 5],
  lh: [5, 3, 2, 1],
}

const TRIADS: ChordTypeId[] = ['M', 'm', 'dim', 'aug', 'sus2', 'sus4']
const FOUR_NOTE: ChordTypeId[] = ['maj7', '7', 'm7', 'm7b5', 'dim7', '6']

/** Finger numbers low to high; null where there is no standard fingering (add9, 9, inverted sevenths). */
export function chordFingering(type: ChordTypeId, inversion: number, hand: Hand): number[] | null {
  if (TRIADS.includes(type)) return TRIAD_FINGERING[hand][inversion] ?? null
  if (FOUR_NOTE.includes(type) && inversion === 0) return FOUR_NOTE_FINGERING[hand]
  return null
}

export interface DiatonicChord {
  numeral: string
  root: string
  type: 'M' | 'm' | 'dim' | 'aug'
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

function semitonesUp(from: string, to: string): number {
  return (((Note.chroma(to) as number) - (Note.chroma(from) as number)) % 12 + 12) % 12
}

function classify(third: number, fifth: number): DiatonicChord['type'] {
  if (third === 4 && fifth === 7) return 'M'
  if (third === 3 && fifth === 7) return 'm'
  if (third === 3 && fifth === 6) return 'dim'
  return 'aug'
}

/** Triads stacked on each degree of the scale (ascending form). */
export function diatonicChords(ref: ScaleRef): DiatonicChord[] {
  const notes = scaleNotes(ref)
  return notes.map((root, i) => {
    const third = notes[(i + 2) % 7] as string
    const fifth = notes[(i + 4) % 7] as string
    const type = classify(semitonesUp(root, third), semitonesUp(root, fifth))
    const roman = type === 'M' || type === 'aug' ? (ROMAN[i] as string) : (ROMAN[i] as string).toLowerCase()
    const suffix = type === 'dim' ? '°' : type === 'aug' ? '+' : ''
    return { numeral: roman + suffix, root, type }
  })
}

/** The session chord set: degrees I IV V vi (major) or i iv V|v VI (minor). Melodic uses the harmonic set (ASSUMED). */
export function progression(ref: ScaleRef): DiatonicChord[] {
  const form = ref.form === 'melodic' ? 'harmonic' : ref.form
  const chords = diatonicChords({ root: ref.root, form })
  return [0, 3, 4, 5].map((i) => chords[i] as DiatonicChord)
}

/** Chord names for the given notes, lowest note as bass. Input order does not matter. */
export function detectChord(notes: string[]): string[] {
  const pitchClasses = [...notes]
    .sort((a, b) => (Note.midi(a) as number) - (Note.midi(b) as number))
    .map((n) => Note.pitchClass(n))
  return Chord.detect(pitchClasses)
}

/**
 * Pitch classes spelled from a chord name: 'C#m' -> C# E G#, 'Dbm' -> Db Fb Ab. Slash chords put the
 * bass first ('CM/E' -> E C G); tonal's Chord.get leaves slash names empty, so the bass is split off here.
 */
export function chordNoteNames(name: string): string[] {
  const [chord = '', bass] = name.split('/')
  const notes = Chord.get(chord).notes
  if (!bass) return notes
  return [bass, ...notes.filter((n) => Note.chroma(n) !== Note.chroma(bass))]
}

export interface ChordReading {
  /** tonal symbol, e.g. 'C#m', 'CM/E'. */
  name: string
  /** Its pitch classes spelled from the name. */
  notes: string[]
}

const SHARP_SET = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_SET = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const spellIn = (set: string[], midi: number): string => `${set[midi % 12]}${Math.floor(midi / 12) - 1}`

/** tonal qualities of the app's own chord types: these readings rank ahead of exotic ones (Em#5). */
const COMMON_QUALITIES = new Set(['M', 'm', 'dim', 'aug', 'sus2', 'sus4', 'maj7', '7', 'm7', 'm7b5', 'dim7', '6', 'Madd9', '9'])

function parseChordName(name: string): { root: string; quality: string; bass: string } {
  const [chord = '', bass = ''] = name.split('/')
  const root = /^[A-G](?:#{1,2}|b{1,2})?/.exec(chord)?.[0] ?? ''
  return { root, quality: chord.slice(root.length), bass }
}

const doubles = (notes: string[]): number => notes.filter((n) => /##|bb/.test(n)).length
const accidentals = (notes: string[]): number => notes.reduce((sum, n) => sum + n.replace(/[^#b]/g, '').length, 0)
const UNUSUAL = new Set(['Cb', 'Fb', 'E#', 'B#'])
/** Every note natural or a plain black-key spelling (no doubles, no Cb/Fb/E#/B#). */
const isPlain = (notes: string[]): boolean => notes.every((n) => /^[A-G][#b]?$/.test(n) && !UNUSUAL.has(n))

interface Candidate extends ChordReading {
  /** 0 = sharp set, 1 = flat set. */
  set: number
}

/** Session root for the chord's quality family: minor qualities use MINOR_ROOTS, the rest MAJOR_ROOTS. */
function sessionRank(c: Candidate): number {
  const { root, quality } = parseChordName(c.name)
  const roots = /^m(?!aj)/.test(quality) ? MINOR_ROOTS : MAJOR_ROOTS
  return roots.includes(root) ? 0 : 1
}

/** Best spelling first: no double accidentals, fewest accidentals, session root, then the sharp set. */
function bySpelling(a: Candidate, b: Candidate): number {
  return (
    doubles(a.notes) - doubles(b.notes) ||
    accidentals(a.notes) - accidentals(b.notes) ||
    sessionRank(a) - sessionRank(b) ||
    a.set - b.set
  )
}

/**
 * Name the chord on these keys (R17). Black keys are detected twice, as sharps and as flats, and
 * readings of the same chord (root, quality, bass) are merged. Readings keep tonal's ranking (common
 * chord types first); each reading is spelled the best way, and its notes come from the name itself,
 * so the name and the notes always agree. `alternatives`: the primary's enharmonic when it's a plain
 * spelling, then the other readings (spelled to agree with the primary where they can). Null when nothing matches.
 */
export function nameChord(midis: number[]): { primary: ChordReading; alternatives: ChordReading[] } | null {
  const sorted = [...new Set(midis)].sort((a, b) => a - b)
  const groups = new Map<string, { rank: [number, number]; candidates: Candidate[] }>()
  ;[SHARP_SET, FLAT_SET].forEach((set, setIndex) => {
    const input = sorted.map((m) => spellIn(set, m))
    detectChord(input).forEach((name, i) => {
      const { root, quality, bass } = parseChordName(name)
      const id = `${Note.chroma(root)}|${quality}|${bass ? Note.chroma(bass) : ''}`
      let group = groups.get(id)
      if (!group) {
        group = { rank: [COMMON_QUALITIES.has(quality) ? 0 : 1, i], candidates: [] }
        groups.set(id, group)
      }
      group.rank[1] = Math.min(group.rank[1], i)
      if (group.candidates.some((c) => c.name === name)) return
      const own = chordNoteNames(name)
      const notes = own.length > 0 ? own : input.map((n) => Note.pitchClass(n))
      group.candidates.push({ name, notes, set: setIndex })
    })
  })
  const readings = [...groups.values()]
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1])
    .map((g) => g.candidates.sort(bySpelling))
  const first = readings[0]
  if (!first) return null
  const strip = ({ name, notes }: Candidate): ChordReading => ({ name, notes })
  const [primary, ...enharmonics] = first as [Candidate, ...Candidate[]]
  // Other readings: the spelling that agrees most with the primary's notes, so B reads "Also: D#m#5/B", not Ebm#5/B.
  const mismatches = (c: Candidate): number => c.notes.filter((n) => !primary.notes.includes(n)).length
  const others = readings.slice(1).map((r) => [...r].sort((a, b) => mismatches(a) - mismatches(b) || bySpelling(a, b))[0] as Candidate)
  return {
    primary: strip(primary),
    alternatives: [...enharmonics.filter((c) => isPlain(c.notes)), ...others].map(strip),
  }
}
