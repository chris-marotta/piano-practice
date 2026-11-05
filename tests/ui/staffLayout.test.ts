import { describe, expect, it } from 'vitest'
import { staffLayout, type StaffNote } from '../../src/ui/components/staffLayout'
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
    l.sigs.forEach((s, i) => expect(s.y).toBe(mid - (pos[i]! * 20) / 2))
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
    l.accidentals.forEach((a, i) => {
      expect(a.x).toBeLessThan(l.heads[i]!.x - l.heads[i]!.rx)
      expect(a.y).toBe(l.heads[i]!.y)
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
