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
