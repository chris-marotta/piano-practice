// Names and landmarks for the 12 piano keys, by pitch class (0 = C). Pure, no tonal needed.
import { formatNote } from './format'

/** The 12 pitch classes in tonal's ASCII spelling, sharps only. */
export const PC_ASCII: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const FLAT_ASCII: string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
const BLACK_PCS = [1, 3, 6, 8, 10]

const isBlackPc = (pc: number): boolean => BLACK_PCS.includes(pc)
const pcOf = (midi: number): number => ((midi % 12) + 12) % 12

/** Display label: "E" for a white key, "G♯ / A♭" (sharp first) for a black key. */
export function keyLabel(pc: number): string {
  const sharp = formatNote(PC_ASCII[pc] as string)
  return isBlackPc(pc) ? `${sharp} / ${formatNote(FLAT_ASCII[pc] as string)}` : sharp
}

/** The sharp name only, for prompts like "Tap G♯". */
export function keyName(pc: number): string {
  return formatNote(PC_ASCII[pc] as string)
}

/**
 * The route a learner follows to find a key. White keys: from the nearest C or F at or below,
 * up the white keys to `midi` (E -> C, D, E; B -> F, G, A, B; C -> C). Black keys: the white key
 * just below, then the key.
 */
export function landmarkRoute(midi: number): number[] {
  if (isBlackPc(pcOf(midi))) return [midi - 1, midi]
  let start = midi
  while (pcOf(start) !== 0 && pcOf(start) !== 5) start--
  const route: number[] = []
  for (let m = start; m <= midi; m++) if (WHITE_PCS.includes(pcOf(m))) route.push(m)
  return route
}

/** One sentence that tells you where to find the key. */
export function routeText(pc: number): string {
  if (pc === 0) return 'C is just left of the two black keys.'
  if (pc === 5) return 'F is just left of the three black keys.'
  // Octave 4 (60+pc) is an arbitrary representative; only pitch classes matter here.
  const route = landmarkRoute(60 + pc)
  if (isBlackPc(pc)) {
    const below = formatNote(PC_ASCII[pcOf(route[0] as number)] as string)
    return `${keyName(pc)} is the black key just right of ${below}. Also called ${formatNote(FLAT_ASCII[pc] as string)}.`
  }
  const names = route.map((m) => formatNote(PC_ASCII[pcOf(m)] as string)).join(', ')
  const start = route[0] === undefined || pcOf(route[0]) === 0 ? 'C (left of the two black keys)' : 'F (left of the three black keys)'
  return `From ${start}: ${names}.`
}

/**
 * Four distinct pitch classes for a multiple-choice question: the target plus its 3 nearest
 * same-colour keys, counted by position among the white keys (or the black keys) within one
 * octave, no wrap-around (ASSUMED). Ties in distance are broken by `rng`; the four come back shuffled.
 */
export function nearbyChoices(pc: number, rng: () => number): number[] {
  const group = isBlackPc(pc) ? BLACK_PCS : WHITE_PCS
  const at = group.indexOf(pc)
  const others = group
    .filter((p) => p !== pc)
    .map((p) => ({ p, d: Math.abs(group.indexOf(p) - at), tie: rng() }))
    .sort((a, b) => a.d - b.d || a.tie - b.tie)
    .slice(0, 3)
    .map((o) => o.p)
  return shuffle([pc, ...others], rng)
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}
