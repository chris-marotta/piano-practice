// Pure geometry for the Staff component. y grows downward; every vertical position comes from
// src/theory/staff.ts (diatonic steps from the middle line), every size from `gap` (the line spacing).
import { formatNote } from '../../theory/format'
import { keySignaturePositions, ledgerLines, staffPosition, type Clef } from '../../theory/staff'

export type StaffMark = 'target' | 'landmark' | 'ghost' | 'right' | 'wrong' | 'plain'
export type StaffAccidental = '' | '#' | 'b' | 'n' | '##' | 'bb'

export interface StaffNote {
  note: string
  clef: Clef
  mark: StaffMark
  beat?: number
  accidental?: StaffAccidental
}

export interface Line { x1: number; x2: number; y: number }
export interface VLine { x: number; y1: number; y2: number }
export interface Head { x: number; y: number; rx: number; ry: number; d: string; mark: StaffMark; note: string }
export interface Glyph { x: number; y: number; text: string; size: number; kind: 'clef' | 'accidental' | 'sig' }

export interface StaffLayoutOpts {
  clef: Clef | 'grand'
  notes: StaffNote[]
  keySignature?: { accidental: '#' | 'b'; count: number }
  gap: number
}

export interface StaffLayout {
  width: number
  height: number
  lines: Line[]
  ledgers: Line[]
  barlines: VLine[]
  heads: Head[]
  accidentals: Glyph[]
  clefs: Glyph[]
  sigs: Glyph[]
  brace?: { d: string }
}

// All in gaps.
const PAD_Y = 3.5 // above the top line / below the bottom line: room for two ledgers, a clef's overshoot
const STAVES_APART = 6 // grand staff: treble bottom line to bass top line
const HEAD_RX = 0.78
const HEAD_RY = 0.55
const HEAD_TILT = -18 // degrees
const HOLE_RX = 0.3
const HOLE_RY = 0.44
const HOLE_TILT = 35
const LEDGER_OVER = 0.4 // each side of the head
const BRACE_W = 1.2
const CLEF_X = 0.5 // from the barline
const CLEF_W = 3.1
const SIG_STEP = 1
const BEAT = 3.2
const ACC_LEFT = 1.15 // accidental centre, left of the head centre
const END_PAD = 2.2
const CLEF_SIZE = 3.7 // font-size, in gaps
const ACC_SIZE = 3.1

export const ACCIDENTAL_TEXT: Record<Exclude<StaffAccidental, ''>, string> = {
  '#': formatNote('C#').slice(1),
  b: formatNote('Cb').slice(1),
  '##': formatNote('C##').slice(1),
  bb: formatNote('Cbb').slice(1),
  n: '♮',
}

/** A rotated ellipse as a closed path: two arcs through the ends of its x-axis. */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180
  const dx = rx * Math.cos(a)
  const dy = rx * Math.sin(a)
  const f = (v: number) => Math.round(v * 100) / 100
  return `M${f(cx - dx)} ${f(cy - dy)}A${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx + dx)} ${f(cy + dy)}A${f(rx)} ${f(ry)} ${deg} 1 0 ${f(cx - dx)} ${f(cy - dy)}Z`
}

/** A whole note: a tilted ellipse with a steeper, hollow centre (draw with fill-rule evenodd). */
function headPath(cx: number, cy: number, g: number): string {
  return ellipsePath(cx, cy, HEAD_RX * g, HEAD_RY * g, HEAD_TILT) + ellipsePath(cx, cy, HOLE_RX * g, HOLE_RY * g, HOLE_TILT)
}

// The left edge of a curly brace, tip to tip, as cubic segments in (share of width, share of half-height from
// the top tip): v = 1 is the waist, which bulges furthest left.
type P = [number, number]
const BRACE: P[][] = [
  [[-0.55, 0.02], [-0.5, 0.25], [-0.5, 0.55]],
  [[-0.5, 0.85], [-0.9, 0.92], [-1, 1]],
  [[-0.9, 1.08], [-0.5, 1.15], [-0.5, 1.45]],
  [[-0.5, 1.75], [-0.55, 1.98], [0, 2]],
]

/** A curly brace from (x, top) down to (x, bottom), bulging left by w: a filled shape, thick at the stems, pointed at the tips and waist. */
function bracePath(x: number, top: number, bottom: number, w: number): string {
  const h = (bottom - top) / 2
  const f = (v: number) => Math.round(v * 100) / 100
  const pt = ([u, v]: P, thick: number): string => `${f(x + (u + thick * Math.abs(Math.sin(Math.PI * v))) * w)} ${f(top + v * h)}`
  let d = `M${f(x)} ${f(top)}`
  for (const seg of BRACE) d += `C${seg.map((q) => pt(q, 0)).join(' ')}`
  // Back up the right edge, thicker in the stems.
  const starts: P[] = [[0, 0], ...BRACE.map((seg) => seg[2] as P)]
  for (let i = BRACE.length - 1; i >= 0; i--) {
    const seg = BRACE[i] as P[]
    d += `C${pt(seg[1] as P, 0.3)} ${pt(seg[0] as P, 0.3)} ${pt(starts[i] as P, 0.3)}`
  }
  return d + 'Z'
}

export function staffLayout(opts: StaffLayoutOpts): StaffLayout {
  const g = opts.gap
  const grand = opts.clef === 'grand'
  const clefs: Clef[] = grand ? ['treble', 'bass'] : [opts.clef as Clef]
  const topLine: Record<string, number> = {}
  let y = PAD_Y * g
  for (const c of clefs) {
    topLine[c] = y
    y += (4 + STAVES_APART) * g
  }
  const height = y - STAVES_APART * g + PAD_Y * g
  const midY = (c: Clef) => (topLine[c] ?? (topLine[clefs[0] as Clef] as number)) + 4 * g
  const yOf = (pos: number, c: Clef) => midY(c) - (pos * g) / 2

  const barX = grand ? (BRACE_W + 0.4) * g : 0.4 * g
  const clefX = barX + CLEF_X * g
  const sig = opts.keySignature && opts.keySignature.count > 0 ? opts.keySignature : undefined
  const sigX0 = clefX + CLEF_W * g
  const sigW = sig ? (sig.count * SIG_STEP + 0.6) * g : 0
  const firstX = sigX0 + sigW + 1.6 * g
  const beatOf = (n: StaffNote) => n.beat ?? 0
  const maxBeat = Math.max(0, ...opts.notes.map(beatOf))
  const xOfBeat = (b: number) => firstX + b * BEAT * g
  const width = xOfBeat(maxBeat) + END_PAD * g

  const lines: Line[] = []
  const barlines: VLine[] = []
  const glyphClefs: Glyph[] = []
  const sigs: Glyph[] = []
  for (const c of clefs) {
    for (let i = 4; i >= -4; i -= 2) lines.push({ x1: barX, x2: width, y: yOf(i, c) })
    // The clef glyphs are drawn on their own line: G (treble, 2nd line) and F (bass, 4th line).
    glyphClefs.push({ x: clefX, y: yOf(c === 'treble' ? -2 : 2, c), text: c === 'treble' ? '\u{1D11E}' : '\u{1D122}', size: CLEF_SIZE * g, kind: 'clef' })
    if (sig) {
      keySignaturePositions(sig.accidental, sig.count, c).forEach((pos, i) => {
        sigs.push({ x: sigX0 + (i + 0.5) * SIG_STEP * g, y: yOf(pos, c), text: ACCIDENTAL_TEXT[sig.accidental], size: ACC_SIZE * g, kind: 'sig' })
      })
    }
  }
  let brace: StaffLayout['brace']
  if (grand) {
    const top = yOf(4, 'treble')
    const bottom = yOf(-4, 'bass')
    barlines.push({ x: barX, y1: top, y2: bottom })
    brace = { d: bracePath(barX - 0.15 * g, top, bottom, BRACE_W * g) }
  }

  const heads: Head[] = []
  const accidentals: Glyph[] = []
  const ledgers: Line[] = []
  const seen = new Set<string>()
  for (const n of opts.notes) {
    const pos = staffPosition(n.note, n.clef)
    const cx = xOfBeat(beatOf(n))
    const cy = yOf(pos, n.clef)
    heads.push({ x: cx, y: cy, rx: HEAD_RX * g, ry: HEAD_RY * g, d: headPath(cx, cy, g), mark: n.mark, note: n.note })
    for (const lp of ledgerLines(pos)) {
      const ly = yOf(lp, n.clef)
      const key = `${cx}|${ly}`
      if (seen.has(key)) continue
      seen.add(key)
      ledgers.push({ x1: cx - (HEAD_RX + LEDGER_OVER) * g, x2: cx + (HEAD_RX + LEDGER_OVER) * g, y: ly })
    }
    if (n.accidental) {
      accidentals.push({ x: cx - ACC_LEFT * g - HEAD_RX * g + 0.25 * g, y: cy, text: ACCIDENTAL_TEXT[n.accidental], size: ACC_SIZE * g, kind: 'accidental' })
    }
  }

  return { width, height, lines, ledgers, barlines, heads, accidentals, clefs: glyphClefs, sigs, brace }
}
