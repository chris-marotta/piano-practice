import { thumbNotes } from '../data/fingerings'
import { formatNote, formatScale } from './format'
import { keySignature, relativeKey, scaleNotes } from './scales'
import type { ScaleRef } from './scales'

export type RecallType = 'keysig' | 'spell' | 'relative' | 'thumb'

export const RECALL_TYPES: RecallType[] = ['keysig', 'spell', 'relative', 'thumb']

export interface RecallCard {
  type: RecallType
  prompt: string
  answer: string
}

const spaced = (notes: string[]): string => notes.map(formatNote).join(' ')

/** Relative prompts and answers call every minor form just "minor". */
function plainName(ref: ScaleRef): string {
  return `${formatNote(ref.root)} ${ref.form === 'major' ? 'major' : 'minor'}`
}

function keysigCard(ref: ScaleRef): RecallCard {
  const sig = keySignature(ref)
  let answer = 'No sharps or flats'
  if (sig.count > 0) {
    const word = sig.accidental === '#' ? 'sharp' : 'flat'
    answer = `${sig.count} ${word}${sig.count > 1 ? 's' : ''}: ${spaced(sig.notes)}`
  }
  return {
    type: 'keysig',
    prompt: `${formatScale(ref)} — how many sharps or flats? Name them in order.`,
    answer,
  }
}

function spellCard(ref: ScaleRef): RecallCard {
  const up = [...scaleNotes(ref), ref.root]
  let answer: string
  if (ref.form === 'melodic') {
    // Descending melodic minor is natural minor: tonic, 7th, 6th ... 2nd, tonic.
    const down = [ref.root, ...scaleNotes({ root: ref.root, form: 'natural' }).slice(1).reverse(), ref.root]
    answer = `Up: ${spaced(up)} · Down: ${spaced(down)}`
  } else {
    answer = spaced(up)
  }
  return { type: 'spell', prompt: `${formatScale(ref)} — spell the scale.`, answer }
}

function relativeCard(ref: ScaleRef): RecallCard {
  const rel = relativeKey(ref)
  return {
    type: 'relative',
    prompt: `Relative ${rel.form === 'major' ? 'major' : 'minor'} of ${plainName(ref)}?`,
    answer: plainName(rel),
  }
}

function thumbCard(ref: ScaleRef): RecallCard {
  return {
    type: 'thumb',
    prompt: `${formatScale(ref)} — which notes does the right-hand thumb play?`,
    answer: thumbNotes(ref, 'rh').map(formatNote).join(', '),
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
