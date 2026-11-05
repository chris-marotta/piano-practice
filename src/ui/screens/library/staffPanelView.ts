// The Library's "On the staff" block: a scale as written on the grand staff. Pure; reads no fingering data.
import { formatNote } from '../../../theory/format'
import { keySignature, scaleSequence, type ScaleRef } from '../../../theory/scales'
import { staffOctaves, writtenAccidental } from '../../../theory/staff'
import type { StaffNote } from '../../components/Staff'

export const STAFF_CAPTION = 'Written where it reads easiest. Play it in any octave.'

function andList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function signatureText(sig: ReturnType<typeof keySignature>): string {
  if (sig.accidental === '') return 'No sharps or flats in the key signature.'
  const word = sig.accidental === '#' ? 'sharps' : 'flats'
  const names = sig.notes.map(formatNote).join(' ')
  const letters = andList(sig.notes.map((n) => n[0] as string))
  return `The key signature's ${word} (${names}) apply to every ${letters}.`
}

export function staffPanel(ref: ScaleRef): {
  keySignature?: { accidental: '#' | 'b'; count: number }
  notes: StaffNote[]
  caption: string
  signatureText: string
} {
  const sig = keySignature(ref)
  const hand = (clef: 'treble' | 'bass', octave: number): StaffNote[] => {
    const { ascending, descending } = scaleSequence(ref, 1, octave)
    const tonic = (ascending[0] as string).replace(/-?\d+$/, '')
    const line = [...ascending, ...descending.slice(1)]
    return line.map((note, beat) => ({
      note,
      clef,
      beat,
      mark: note.replace(/-?\d+$/, '') === tonic ? 'landmark' : 'plain',
      accidental: writtenAccidental(note, sig),
    }))
  }
  const oct = staffOctaves(ref)
  return {
    keySignature: sig.accidental === '' ? undefined : { accidental: sig.accidental, count: sig.count },
    notes: [...hand('treble', oct.rh), ...hand('bass', oct.lh)],
    caption: STAFF_CAPTION,
    signatureText: signatureText(sig),
  }
}
