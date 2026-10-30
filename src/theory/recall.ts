import { thumbNotes } from '../data/fingerings'
import { formatNote, formatScale } from './format'
import { chroma, keySignature, relativeKey, scaleNotes } from './scales'
import type { ScaleRef } from './scales'

export type RecallType = 'keysig' | 'spell' | 'relative' | 'thumb'

export const RECALL_TYPES: RecallType[] = ['keysig', 'spell', 'relative', 'thumb']

/** What the card's "why" picture draws. Note names are tonal ASCII; the UI formats them. */
export type RecallWhy =
  | { kind: 'steps'; from: string; path: string[]; direction: 'down' | 'up' }
  | { kind: 'wheel'; key: string; minor: boolean; steps: number; accidental: '#' | 'b' | ''; notes: string[] }
  | { kind: 'scale'; notes: string[]; accidentals: string[]; descending?: string[] }
  | { kind: 'thumbs'; notes: string[]; thumbs: string[] }

export interface RecallCard {
  type: RecallType
  prompt: string
  answer: string
  why: RecallWhy
  whyText: string
}

const spaced = (notes: string[]): string => notes.map(formatNote).join(' ')

/** "A", "A and D", "A, D and E". */
function listed(notes: string[]): string {
  const names = notes.map(formatNote)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] as string}`
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Relative prompts and answers call every minor form just "minor". */
function plainName(ref: ScaleRef): string {
  return `${formatNote(ref.root)} ${ref.form === 'major' ? 'major' : 'minor'}`
}

const FORM_NOTE: Partial<Record<ScaleRef['form'], string>> = {
  harmonic: " Harmonic minor raises the 7th as an accidental; it isn't in the key signature.",
  melodic: " Melodic minor raises the 6th and 7th going up; they aren't in the key signature.",
}

function keysigCard(ref: ScaleRef): RecallCard {
  const sig = keySignature(ref)
  const minor = ref.form !== 'major'
  let answer = 'No sharps or flats'
  let whyText = `${plainName(ref)} is at the top of the circle: no sharps or flats.`
  if (sig.count > 0) {
    const word = sig.accidental === '#' ? 'sharp' : 'flat'
    const way = sig.accidental === '#' ? 'clockwise' : 'anticlockwise'
    answer = `${sig.count} ${word}${sig.count > 1 ? 's' : ''}: ${spaced(sig.notes)}`
    whyText = `${plainName(ref)} is ${plural(sig.count, 'step')} ${way} from ${minor ? 'A minor' : 'C major'}, `
      + `so ${plural(sig.count, word)}: ${spaced(sig.notes)}.`
  }
  return {
    type: 'keysig',
    prompt: `${formatScale(ref)} — how many sharps or flats? Name them in order.`,
    answer,
    why: { kind: 'wheel', key: ref.root, minor, steps: sig.count, accidental: sig.accidental, notes: sig.notes },
    whyText: whyText + (FORM_NOTE[ref.form] ?? ''),
  }
}

/** The scale's own sharps and flats: those in the key signature first, in signature order, then the rest (raised 6th/7th). */
function scaleAccidentals(ref: ScaleRef): string[] {
  const own = scaleNotes(ref).filter((n) => /[#b]/.test(n))
  const inSig = keySignature(ref).notes.filter((n) => own.includes(n))
  return [...inSig, ...own.filter((n) => !inSig.includes(n))]
}

/** "the sharps are F♯ C♯ G♯; …", "the flat is B♭; …". Lowercase so it can follow "Going up, ". A scale with both names each group in turn. */
function accidentalsClause(accidentals: string[]): string {
  if (accidentals.length === 0) return 'no sharps or flats: all natural notes.'
  const groups: { word: string; notes: string[] }[] = []
  for (const n of accidentals) {
    const word = n.includes('#') ? 'sharp' : 'flat'
    const group = groups.find((g) => g.word === word)
    if (group) group.notes.push(n)
    else groups.push({ word, notes: [n] })
  }
  const parts = groups.map((g) => (g.notes.length === 1 ? `the ${g.word} is` : `the ${g.word}s are`) + ` ${spaced(g.notes)}`)
  return `${parts.join(' and ')}; every other note is natural.`
}

const capitalised = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`

function spellCard(ref: ScaleRef): RecallCard {
  const up = [...scaleNotes(ref), ref.root]
  const accidentals = scaleAccidentals(ref)
  let answer: string
  let why: RecallWhy
  let whyText: string
  if (ref.form === 'melodic') {
    // Descending melodic minor is natural minor: tonic, 7th, 6th ... 2nd, tonic.
    const down = [ref.root, ...scaleNotes({ root: ref.root, form: 'natural' }).slice(1).reverse(), ref.root]
    answer = `Up: ${spaced(up)} · Down: ${spaced(down)}`
    why = { kind: 'scale', notes: up, accidentals, descending: down }
    // The down line is natural minor, so its accidentals are the natural minor's.
    const downAccidentals = scaleAccidentals({ root: ref.root, form: 'natural' })
    whyText = `Going up, ${accidentalsClause(accidentals)} Coming down, ${accidentalsClause(downAccidentals)}`
  } else {
    answer = spaced(up)
    why = { kind: 'scale', notes: up, accidentals }
    whyText = capitalised(accidentalsClause(accidentals))
  }
  return { type: 'spell', prompt: `${formatScale(ref)} — spell the scale.`, answer, why, whyText }
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

/**
 * Tonic, two chromatic half-steps, then the relative root as relativeKey spells it.
 * Middle notes use sharps in sharp keys and flats in flat keys; with no accidentals
 * (C major, A minor) they use flats going down and sharps going up.
 */
function stepsPath(ref: ScaleRef, direction: 'down' | 'up'): string[] {
  const { accidental } = keySignature(ref)
  const useSharps = accidental === '#' || (accidental === '' && direction === 'up')
  const names = useSharps ? SHARP_NAMES : FLAT_NAMES
  const sign = direction === 'up' ? 1 : -1
  const start = chroma(ref.root)
  const middle = [1, 2].map((k) => names[(start + sign * k + 12) % 12] as string)
  return [ref.root, ...middle, relativeKey(ref).root]
}

function relativeCard(ref: ScaleRef): RecallCard {
  const rel = relativeKey(ref)
  const direction = ref.form === 'major' ? 'down' : 'up'
  const path = stepsPath(ref, direction)
  return {
    type: 'relative',
    prompt: `Relative ${rel.form === 'major' ? 'major' : 'minor'} of ${plainName(ref)}?`,
    answer: plainName(rel),
    why: { kind: 'steps', from: ref.root, path, direction },
    whyText: `From ${formatNote(ref.root)}, step ${direction} 3 half-steps: ${path.map(formatNote).join(' → ')}.`,
  }
}

function thumbCard(ref: ScaleRef): RecallCard {
  const thumbs = thumbNotes(ref, 'rh')
  return {
    type: 'thumb',
    prompt: `${formatScale(ref)} — which notes does the right-hand thumb play?`,
    answer: thumbs.map(formatNote).join(', '),
    why: { kind: 'thumbs', notes: scaleNotes(ref), thumbs },
    whyText: `Right-hand thumb on ${listed(thumbs)}.`,
  }
}

export function recallCard(type: RecallType, ref: ScaleRef): RecallCard {
  switch (type) {
    case 'keysig': return keysigCard(ref)
    case 'spell': return spellCard(ref)
    case 'relative': return relativeCard(ref)
    case 'thumb': return thumbCard(ref)
  }
}
