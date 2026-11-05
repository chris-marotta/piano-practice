import { describe, expect, it } from 'vitest'
import { ACC_DROP, staffLayout, type StaffNote } from '../../src/ui/components/staffLayout'
import { keySignaturePositions } from '../../src/theory/staff'

const n = (note: string, clef: 'treble' | 'bass' = 'treble', extra: Partial<StaffNote> = {}): StaffNote => ({ note, clef, mark: 'plain', ...extra })

describe('staffLayout', () => {
  it('draws five lines, one gap apart, y growing downward', () => {
    const l = staffLayout({ clef: 'treble', notes: [], gap: 20 })
    expect(l.lines).toHaveLength(5)
    const ys = l.lines.map((x) => x.y)
    for (let i = 1; i < 5; i++) expect(ys[i]! - ys[i - 1]!).toBe(20)
    expect(l.clefs).toHaveLength(1)
    expect(l.clefs[0]!.text).toBe('\u{1D11E}')
    expect(l.height).toBeGreaterThan(ys[4]!)
  })

  it('bass clef baseline is just under the 2nd line from the bottom, so the F clef wraps the F line (not 2 gaps high)', () => {
    const l = staffLayout({ clef: 'bass', notes: [], gap: 20 })
    const secondFromBottom = l.lines[3]!.y
    expect(l.clefs[0]!.y).toBeGreaterThan(secondFromBottom)
    expect(l.clefs[0]!.y).toBeLessThan(secondFromBottom + 20)
  })

  it('bass clef uses the bass glyph', () => {
    expect(staffLayout({ clef: 'bass', notes: [], gap: 20 }).clefs[0]!.text).toBe('\u{1D122}')
  })

  it('treble E4 sits on the bottom line (gap 20)', () => {
    const l = staffLayout({ clef: 'treble', notes: [n('E4')], gap: 20 })
    expect(l.heads).toHaveLength(1)
    expect(l.heads[0]!.y).toBe(Math.max(...l.lines.map((x) => x.y)))
    expect(l.ledgers).toHaveLength(0)
  })

  it('treble A3 has two ledgers and the head sits on the lower one', () => {
    const l = staffLayout({ clef: 'treble', notes: [n('A3')], gap: 20 })
    expect(l.ledgers).toHaveLength(2)
    expect(l.heads[0]!.y).toBe(Math.max(...l.ledgers.map((x) => x.y)))
    // short lines: a bit wider than the head, not the whole staff
    const head = l.heads[0]!
    for (const g of l.ledgers) {
      expect(g.x1).toBeLessThan(head.x - head.rx)
      expect(g.x2).toBeGreaterThan(head.x + head.rx)
      expect(g.x2 - g.x1).toBeLessThan(l.lines[0]!.x2 - l.lines[0]!.x1)
    }
  })

  it('a note inside the staff has no ledger; middle C has one', () => {
    expect(staffLayout({ clef: 'treble', notes: [n('G4')], gap: 12 }).ledgers).toHaveLength(0)
    expect(staffLayout({ clef: 'treble', notes: [n('C4')], gap: 12 }).ledgers).toHaveLength(1)
  })

  it('grand staff: bass top line is 6 gaps below the treble bottom line (R-P3)', () => {
    const l = staffLayout({ clef: 'grand', notes: [], gap: 20 })
    expect(l.lines).toHaveLength(10)
    const treble = l.lines.slice(0, 5).map((x) => x.y)
    const bass = l.lines.slice(5).map((x) => x.y)
    expect(bass[0]! - treble[4]!).toBe(6 * 20)
    expect(l.clefs.map((c) => c.text)).toEqual(['\u{1D11E}', '\u{1D122}'])
    expect(l.brace).toBeDefined()
    expect(l.barlines).toHaveLength(1)
    expect(l.barlines[0]!.y1).toBe(treble[0])
    expect(l.barlines[0]!.y2).toBe(bass[4])
  })

  it('barlinesAfterBeat: a full-height barline between the beats, with extra room', () => {
    const notes = [n('C4', 'treble', { beat: 7 }), n('C4', 'treble', { beat: 8 })]
    const plain = staffLayout({ clef: 'grand', notes, gap: 12 })
    const l = staffLayout({ clef: 'grand', notes, gap: 12, barlinesAfterBeat: [7] })
    expect(l.barlines).toHaveLength(2)
    const bar = l.barlines[1]!
    expect(bar.y1).toBe(l.lines[0]!.y)
    expect(bar.y2).toBe(l.lines[9]!.y)
    expect(bar.x).toBeGreaterThan(l.heads[0]!.x)
    expect(bar.x).toBeLessThan(l.heads[1]!.x)
    expect(l.heads[1]!.x - l.heads[0]!.x).toBeGreaterThan(plain.heads[1]!.x - plain.heads[0]!.x)
    expect(l.heads[0]!.x).toBe(plain.heads[0]!.x)
    expect(plain.barlines).toHaveLength(1)
  })

  it('grand staff: treble C4 and bass C4 each sit on their own ledger, between the staves', () => {
    const l = staffLayout({ clef: 'grand', notes: [n('C4', 'treble', { beat: 0 }), n('C4', 'bass', { beat: 1 })], gap: 20 })
    const trebleBottom = l.lines[4]!.y
    const bassTop = l.lines[5]!.y
    expect(l.heads).toHaveLength(2)
    for (const h of l.heads) {
      expect(h.y).toBeGreaterThan(trebleBottom)
      expect(h.y).toBeLessThan(bassTop)
      expect(l.ledgers.filter((g) => g.y === h.y && g.x1 < h.x && g.x2 > h.x)).toHaveLength(1)
    }
    expect(l.heads[0]!.y).toBe(trebleBottom + 20)
    expect(l.heads[1]!.y).toBe(bassTop - 20)
    expect(l.ledgers).toHaveLength(2)
  })

  it('a 3-sharp signature: 3 glyphs, x increasing, y at F5, C5, G5', () => {
    const l = staffLayout({ clef: 'treble', notes: [], keySignature: { accidental: '#', count: 3 }, gap: 20 })
    expect(l.sigs).toHaveLength(3)
    expect(l.sigs.every((s) => s.text === '♯')).toBe(true)
    for (let i = 1; i < 3; i++) expect(l.sigs[i]!.x).toBeGreaterThan(l.sigs[i - 1]!.x)
    const mid = (l.lines[0]!.y + l.lines[4]!.y) / 2
    const pos = keySignaturePositions('#', 3, 'treble')
    expect(pos).toEqual([4, 1, 5])
    // the baseline drops by the glyph's measured offset, so the ink centre lands on the line or space (I1)
    l.sigs.forEach((s, i) => expect(s.y - (mid - (pos[i]! * 20) / 2)).toBeCloseTo(ACC_DROP['#'] * 20, 6))
  })

  it('grand staff puts the key signature on both staves, with flats as ♭', () => {
    const l = staffLayout({ clef: 'grand', notes: [], keySignature: { accidental: 'b', count: 2 }, gap: 12 })
    expect(l.sigs).toHaveLength(4)
    expect(l.sigs.every((s) => s.text === '♭')).toBe(true)
  })

  it('the first note clears the signature', () => {
    const plain = staffLayout({ clef: 'treble', notes: [n('G4')], gap: 20 })
    const sig = staffLayout({ clef: 'treble', notes: [n('G4')], keySignature: { accidental: '#', count: 4 }, gap: 20 })
    expect(sig.heads[0]!.x).toBeGreaterThan(plain.heads[0]!.x)
    expect(sig.heads[0]!.x - sig.heads[0]!.rx).toBeGreaterThan(Math.max(...sig.sigs.map((s) => s.x)))
  })

  it('heads at beats 0..14 have strictly increasing x; same beat shares x; no beat is beat 0', () => {
    const notes = Array.from({ length: 15 }, (_, i) => n('G4', 'treble', { beat: i }))
    const l = staffLayout({ clef: 'treble', notes, gap: 12 })
    for (let i = 1; i < 15; i++) expect(l.heads[i]!.x).toBeGreaterThan(l.heads[i - 1]!.x)
    expect(l.width).toBeGreaterThan(l.heads[14]!.x + l.heads[14]!.rx)
    const same = staffLayout({ clef: 'grand', notes: [n('C4', 'treble', { beat: 3 }), n('C4', 'bass', { beat: 3 }), n('E4')], gap: 12 })
    expect(same.heads[0]!.x).toBe(same.heads[1]!.x)
    expect(same.heads[2]!.x).toBeLessThan(same.heads[0]!.x)
  })

  it('accidentals sit left of their head and carry the right glyph', () => {
    const l = staffLayout({
      clef: 'treble',
      notes: [n('F#4', 'treble', { accidental: '#', beat: 0 }), n('B4', 'treble', { accidental: 'n', beat: 1 }), n('F4', 'treble', { accidental: '##', beat: 2 }), n('B4', 'treble', { accidental: 'bb', beat: 3 }), n('B4', 'treble', { accidental: 'b', beat: 4 }), n('B4', 'treble', { accidental: '', beat: 5 })],
      gap: 20,
    })
    expect(l.accidentals.map((a) => a.text)).toEqual(['♯', '♮', '𝄪', '𝄫', '♭'])
    const accs = ['#', 'n', '##', 'bb', 'b'] as const
    l.accidentals.forEach((a, i) => {
      expect(a.x).toBeLessThan(l.heads[i]!.x - l.heads[i]!.rx)
      expect(a.y - l.heads[i]!.y).toBeCloseTo(ACC_DROP[accs[i]!] * 20, 6)
    })
  })

  it('keeps the mark and the note on each head', () => {
    const l = staffLayout({ clef: 'bass', notes: [n('D3', 'bass', { mark: 'target' })], gap: 20 })
    expect(l.heads[0]).toMatchObject({ mark: 'target', note: 'D3' })
    const mid = (l.lines[0]!.y + l.lines[4]!.y) / 2
    expect(l.heads[0]!.y).toBe(mid)
  })

  it('library gap scales the whole drawing', () => {
    const a = staffLayout({ clef: 'grand', notes: [n('C4')], gap: 20 })
    const b = staffLayout({ clef: 'grand', notes: [n('C4')], gap: 12 })
    expect(b.height).toBeLessThan(a.height)
    expect(b.heads[0]!.rx).toBeLessThan(a.heads[0]!.rx)
  })
})

describe('staffLayout vertical metrics (C1)', () => {
  it('the five lines sit centred in the box: as much room above the top line as below the bottom one', () => {
    for (const gap of [20, 12]) {
      for (const clef of ['treble', 'bass'] as const) {
        const l = staffLayout({ clef, notes: [], gap })
        expect(l.lines[0]!.y).toBeCloseTo(l.height - l.lines[4]!.y, 6)
      }
      const g = staffLayout({ clef: 'grand', notes: [], gap })
      expect(g.lines[0]!.y).toBeCloseTo(g.height - g.lines[9]!.y, 6)
    }
  })

  it('pads 2.75 gaps above the top line and below the bottom line: a drill box is 190 px tall at gap 20', () => {
    const l = staffLayout({ clef: 'treble', notes: [], gap: 20 })
    expect(l.lines[0]!.y).toBeCloseTo(2.75 * 20, 6)
    expect(l.height).toBeCloseTo(190, 6)
    expect(staffLayout({ clef: 'grand', notes: [], gap: 12 }).height).toBeCloseTo(19.5 * 12, 6)
  })
})

describe('bass clef dots (C1 re-check of BASS_CLEF_DROP)', () => {
  // Noto Music's F clef dots, centres above the baseline as a share of the font size (canvas pixel scan, 2026-11-05).
  const DOTS = [0.755, 0.535]
  it('the two dots sit evenly either side of the F line (4th line), within 0.05 gap', () => {
    for (const gap of [20, 12]) {
      const l = staffLayout({ clef: 'bass', notes: [], gap })
      const clef = l.clefs[0]!
      const fLine = l.lines[1]!.y
      const [up, down] = DOTS.map((d) => clef.y - d * clef.size) as [number, number]
      expect(up).toBeLessThan(fLine)
      expect(down).toBeGreaterThan(fLine)
      expect(Math.abs((up + down) / 2 - fLine) / gap).toBeLessThan(0.05)
    }
  })
})

describe('accidental glyph offsets (I1)', () => {
  // Measured in the browser on the bundled Noto Music (canvas measureText / pixel scan, 2026-11-05), as a share of the
  // font size above the baseline: the ink centre for ♯ ♮ 𝄪, the bowl's centre for ♭ 𝄫.
  const CENTRE = { '#': 0.131, n: 0.1325, '##': 0.131, b: 0.124, bb: 0.124 } as const

  it('pins the per-glyph drops, in gaps', () => {
    expect(ACC_DROP).toEqual({ '#': 0.41, n: 0.41, '##': 0.41, b: 0.38, bb: 0.38 })
  })

  it('puts each glyph\'s ink centre (a flat\'s bowl) on its note, within 0.02 gap, at both sizes', () => {
    for (const gap of [20, 12]) {
      for (const acc of ['#', 'n', '##', 'b', 'bb'] as const) {
        const l = staffLayout({ clef: 'treble', notes: [n('B4', 'treble', { accidental: acc })], gap })
        const a = l.accidentals[0]!
        expect(Math.abs(a.y - CENTRE[acc] * a.size - l.heads[0]!.y) / gap, acc).toBeLessThan(0.02)
      }
    }
  })

  it('key signatures: F♯ major ink on F5 (top line), C5, G5…; A♭ major bowls on B4 (middle line), E5…', () => {
    for (const [accidental, count, notes] of [['#', 6, ['F5', 'C5', 'G5', 'D5', 'A4', 'E5']], ['b', 4, ['B4', 'E5', 'A4', 'D5']]] as const) {
      const l = staffLayout({ clef: 'treble', notes: [], keySignature: { accidental, count }, gap: 12 })
      const mid = (l.lines[0]!.y + l.lines[4]!.y) / 2
      l.sigs.forEach((s, i) => {
        const target = mid - (keySignaturePositions(accidental, count, 'treble')[i]! * 12) / 2
        expect(Math.abs(s.y - CENTRE[accidental] * s.size - target) / 12, notes[i]).toBeLessThan(0.02)
      })
    }
    // top line literally: the first sharp's ink centre is on lines[0]
    const fs = staffLayout({ clef: 'treble', notes: [], keySignature: { accidental: '#', count: 1 }, gap: 12 })
    expect(Math.abs(fs.sigs[0]!.y - CENTRE['#'] * fs.sigs[0]!.size - fs.lines[0]!.y)).toBeLessThan(0.25)
    // bass B♭ on the 2nd line from the bottom
    const bb = staffLayout({ clef: 'bass', notes: [], keySignature: { accidental: 'b', count: 1 }, gap: 12 })
    expect(Math.abs(bb.sigs[0]!.y - CENTRE.b * bb.sigs[0]!.size - bb.lines[3]!.y)).toBeLessThan(0.25)
  })
})
