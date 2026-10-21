import type { ScaleRef } from './scales'

const SYMBOLS: Record<string, string> = { '#': '♯', b: '♭' }

/** Map tonal's ASCII spelling to display symbols: F# -> F♯, Bb -> B♭, F## -> F𝄪, Cbb -> C𝄫. Octave digits pass through. */
export function formatNote(n: string): string {
  const match = /^([A-G])(#{1,2}|b{1,2})?(-?\d+)?$/.exec(n)
  if (!match) return n
  const [, letter, acc = '', octave = ''] = match
  let accidental = ''
  if (acc === '##') accidental = '𝄪'
  else if (acc === 'bb') accidental = '𝄫'
  else if (acc) accidental = SYMBOLS[acc] as string
  return `${letter}${accidental}${octave}`
}

const FORM_LABEL = {
  major: 'major',
  natural: 'natural minor',
  harmonic: 'harmonic minor',
  melodic: 'melodic minor',
} as const

export function formatScale(ref: ScaleRef): string {
  return `${formatNote(ref.root)} ${FORM_LABEL[ref.form]}`
}

const ACCIDENTAL_IN_QUALITY = /([#b])(?=\d)/g

/**
 * Display a tonal chord symbol: 'CM/E' -> 'C/E', 'Cm7b5' -> 'Cm7♭5', 'CMadd9' -> 'Cadd9'.
 * A plain major triad shows as just its root, as on a lead sheet; M7 -> maj7, Mb5 -> (♭5), oM7 -> dim(maj7).
 */
export function formatChordName(name: string): string {
  const [chord = '', bass] = name.split('/')
  const match = /^([A-G](?:#{1,2}|b{1,2})?)(.*)$/.exec(chord)
  if (!match) return name
  const [, root = '', rawQuality = ''] = match
  let quality = rawQuality === 'M' ? '' : rawQuality.replace(/^Madd/, 'add')
  quality = quality.replace(/^oM7/, 'dim(maj7)').replace(/^M(7|9|13)/, 'maj$1').replace(/^Mb5$/, '(b5)')
  quality = quality.replace(ACCIDENTAL_IN_QUALITY, (_, acc: string) => SYMBOLS[acc] as string)
  return `${formatNote(root)}${quality}${bass ? `/${formatNote(bass)}` : ''}`
}
