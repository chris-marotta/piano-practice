// The staff: an SVG that only draws what staffLayout() computed. Clefs, ♯ ♭ ♮ 𝄪 𝄫 are Noto Music text
// (bundled via @fontsource/noto-music; every glyph used here is in its `music` subset, checked in Task 5).
import type { Clef } from '../../theory/staff'
import { staffLayout, type Glyph, type StaffNote } from './staffLayout'

export type { StaffNote } from './staffLayout'

export interface StaffProps {
  clef: Clef | 'grand'
  notes: StaffNote[]
  keySignature?: { accidental: '#' | 'b'; count: number }
  /** drill: 20 px between lines (reads from the stand); library: 12 px. */
  /** Draw a barline after each of these beats (the Library puts one between up and down). */
  barlinesAfterBeat?: number[]
  size: 'drill' | 'library'
  label: string
}

const GAP = { drill: 20, library: 12 } as const

function GlyphText({ glyph }: { glyph: Glyph }) {
  return (
    <text
      class={`staff__glyph staff__glyph--${glyph.kind}`}
      x={glyph.x}
      y={glyph.y}
      font-size={glyph.size}
      text-anchor={glyph.kind === 'clef' ? 'start' : 'middle'}
    >
      {glyph.text}
    </text>
  )
}

export function Staff({ clef, notes, keySignature, barlinesAfterBeat, size, label }: StaffProps) {
  const l = staffLayout({ clef, notes, keySignature, barlinesAfterBeat, gap: GAP[size] })
  return (
    <svg
      class={`staff staff--${size}`}
      viewBox={`0 0 ${l.width} ${l.height}`}
      width={l.width}
      height={l.height}
      role="img"
      aria-label={label}
    >
      {l.lines.map((ln) => (
        <line class="staff__line" x1={ln.x1} x2={ln.x2} y1={ln.y} y2={ln.y} />
      ))}
      {l.barlines.map((b) => (
        <line class="staff__line staff__barline" x1={b.x} x2={b.x} y1={b.y1} y2={b.y2} />
      ))}
      {l.brace && <path class="staff__brace" d={l.brace.d} />}
      {l.ledgers.map((ln) => (
        <line class="staff__line staff__ledger" x1={ln.x1} x2={ln.x2} y1={ln.y} y2={ln.y} />
      ))}
      {l.clefs.map((g) => <GlyphText glyph={g} />)}
      {l.sigs.map((g) => <GlyphText glyph={g} />)}
      {l.accidentals.map((g) => <GlyphText glyph={g} />)}
      {l.heads.map((h) => (
        <path class={`staff-head staff-head--${h.mark}`} d={h.d} fill-rule="evenodd" data-note={h.note} />
      ))}
    </svg>
  )
}
