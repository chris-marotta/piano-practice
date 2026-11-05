// C1 (final review): every drawn mark stays inside the svg box, for every drill item and every Library scale.
import { describe, expect, it } from 'vitest'
import { STAFF_DEF } from '../../src/drill/staff'
import { STAFF_IDS, parseStaffId } from '../../src/srs/items'
import type { ScaleForm } from '../../src/theory/scales'
import { staffLayout, type Glyph, type StaffLayout } from '../../src/ui/components/staffLayout'
import { staffNotes } from '../../src/ui/components/staffDrillView'
import { staffPanel } from '../../src/ui/screens/library/staffPanelView'

// Noto Music ink extents as a share of the font size, measured in the browser with canvas measureText
// (actualBoundingBoxAscent / Descent) on the bundled font (2026-11-05). Negative descent: the ink ends above the baseline.
const INK: Record<string, { ascent: number; descent: number }> = {
  '\u{1D11E}': { ascent: 1.334, descent: 0.398 }, // G clef
  '\u{1D122}': { ascent: 0.9, descent: -0.101 }, // F clef
  '♯': { ascent: 0.509, descent: 0.247 },
  '♭': { ascent: 0.615, descent: 0.055 },
  '♮': { ascent: 0.486, descent: 0.221 },
  '𝄪': { ascent: 0.262, descent: 0 },
  '𝄫': { ascent: 0.615, descent: 0.055 },
}

function inkBox(g: Glyph): { top: number; bottom: number } {
  const ink = INK[g.text]
  if (!ink) throw new Error(`no ink metrics for ${g.text}`)
  return { top: g.y - ink.ascent * g.size, bottom: g.y + ink.descent * g.size }
}

/** Every vertical extent that leaves the box, as readable strings (empty = all inside). */
function outside(l: StaffLayout): string[] {
  const out: string[] = []
  const check = (what: string, top: number, bottom: number) => {
    if (top < 0 || bottom > l.height) out.push(`${what} ${top.toFixed(1)}..${bottom.toFixed(1)} of ${l.height}`)
  }
  for (const h of l.heads) {
    check(`head ${h.note}`, h.y - h.ry, h.y + h.ry)
    if (h.x - h.rx < 0 || h.x + h.rx > l.width) out.push(`head ${h.note} x ${h.x} of ${l.width}`)
  }
  for (const g of l.ledgers) check('ledger', g.y, g.y)
  for (const g of [...l.clefs, ...l.sigs, ...l.accidentals]) {
    const b = inkBox(g)
    check(`${g.kind} ${g.text}`, b.top, b.bottom)
  }
  return out
}

describe('staff containment (gap 20, drill)', () => {
  it('all 54 items, asked and answered (route ghosts drawn), stay inside the box', () => {
    expect(STAFF_IDS).toHaveLength(54)
    for (const id of STAFF_IDS) {
      const { clef } = parseStaffId(id)!
      const q = STAFF_DEF.buildQuestion(id, 'tap', () => 0.5)
      for (const ans of [
        { answered: false } as const,
        { answered: true, verdict: 'right', correct: true, given: { kind: 'key', midi: q.midi }, ms: 500 } as const,
      ]) {
        const l = staffLayout({ clef, notes: staffNotes(q, ans), gap: 20 })
        expect(outside(l), id).toEqual([])
      }
    }
  })
})

describe('staff containment (gap 12, Library grand staff)', () => {
  const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B', 'Cb']
  const FORMS: ScaleForm[] = ['major', 'natural', 'harmonic', 'melodic']
  it('every root spelling in every form stays inside the box', () => {
    let drawn = 0
    for (const form of FORMS) {
      for (const root of ROOTS) {
        let panel: ReturnType<typeof staffPanel>
        try {
          panel = staffPanel({ root, form })
        } catch {
          continue // a spelling tonal can't build (none the picker offers)
        }
        const l = staffLayout({ clef: 'grand', notes: panel.notes, keySignature: panel.keySignature, gap: 12, barlinesAfterBeat: [7] })
        expect(outside(l), `${root} ${form}`).toEqual([])
        drawn++
      }
    }
    // the 12 session spellings per form at least
    expect(drawn).toBeGreaterThanOrEqual(48)
  })
})
