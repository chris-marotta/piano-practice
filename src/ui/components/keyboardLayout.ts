// Pure keyboard geometry (no DOM) in SVG user units. Keyboard.tsx renders it.

export interface KeyMark {
  midi: number
  hand: 'rh' | 'lh' | 'none'
  finger?: number
  label?: string
}

/** White key 40 wide; black keys ~60% width and ~62% length, as on a real piano. */
export const KEY = { whiteW: 40, whiteH: 172, blackW: 24, blackH: 106 } as const

/** Finger badge radius. Diameter 32 < white-key pitch 40, so badges on neighbouring white keys never touch. */
export const BADGE_R = 16

const BLACK_PCS = [1, 3, 6, 8, 10]

const pc = (midi: number): number => ((midi % 12) + 12) % 12

export function isBlack(midi: number): boolean {
  return BLACK_PCS.includes(pc(midi))
}

/** low = nearest C at or below the lowest note; high = nearest B at or above the highest. Empty -> C4..B4. */
export function keyboardRange(midis: number[]): { low: number; high: number } {
  if (midis.length === 0) return { low: 60, high: 71 }
  const min = Math.min(...midis)
  const max = Math.max(...midis)
  return { low: min - pc(min), high: max + (11 - pc(max)) }
}

export function whiteKeys(low: number, high: number): number[] {
  const out: number[] = []
  for (let m = low; m <= high; m++) if (!isBlack(m)) out.push(m)
  return out
}

/**
 * Black-key centre offset from the white-key boundary it straddles, as a fraction of white width.
 * Real keyboards push C♯/D♯ and F♯/A♯ slightly apart; G♯ sits centred.
 */
const BLACK_OFFSET: Record<number, number> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 }

export interface KeyRect {
  midi: number
  black: boolean
  x: number
  w: number
  h: number
}

/** Number of white keys in [low, midi). */
const whiteIndex = (midi: number, low: number): number => whiteKeys(low, midi - 1).length

/** Key rectangles, white keys first, then black keys (so black keys paint and take taps on top). */
export function keyRects(low: number, high: number): KeyRect[] {
  const whites: KeyRect[] = []
  const blacks: KeyRect[] = []
  for (let m = low; m <= high; m++) {
    if (!isBlack(m)) {
      whites.push({ midi: m, black: false, x: whiteIndex(m, low) * KEY.whiteW, w: KEY.whiteW, h: KEY.whiteH })
    } else {
      const boundary = whiteIndex(m, low) * KEY.whiteW
      const cx = boundary + (BLACK_OFFSET[pc(m)] ?? 0) * KEY.whiteW
      blacks.push({ midi: m, black: true, x: cx - KEY.blackW / 2, w: KEY.blackW, h: KEY.blackH })
    }
  }
  return [...whites, ...blacks]
}

export function keyCenterX(midi: number, low: number): number {
  if (!isBlack(midi)) return whiteIndex(midi, low) * KEY.whiteW + KEY.whiteW / 2
  return whiteIndex(midi, low) * KEY.whiteW + (BLACK_OFFSET[pc(midi)] ?? 0) * KEY.whiteW
}

export interface BadgeSlot {
  midi: number
  finger: number
  cx: number
  /** 0 = sub-row next to the keyboard (white keys), 1 = outer sub-row (black keys). */
  subRow: 0 | 1
}

export interface BadgeLayout {
  rh: BadgeSlot[]
  lh: BadgeSlot[]
  /** Sub-rows each hand needs: 0 (no badges), 1 (white keys only) or 2 (some black keys). */
  rhRows: 0 | 1 | 2
  lhRows: 0 | 1 | 2
}

/**
 * Finger badges per hand. A black key's centre is only ~half a white key from its white
 * neighbours, closer than a badge diameter, so black-key badges always go to the outer
 * sub-row of that hand's row. The rule is fixed (not collision-driven) so a player learns
 * "outer row = black key". One badge per key per hand; the first mark with a finger wins.
 */
export function badgeSlots(marks: KeyMark[], low: number): BadgeLayout {
  const build = (hand: 'rh' | 'lh'): BadgeSlot[] => {
    const seen = new Set<number>()
    const out: BadgeSlot[] = []
    for (const m of marks) {
      if (m.hand !== hand || m.finger === undefined || seen.has(m.midi)) continue
      seen.add(m.midi)
      out.push({ midi: m.midi, finger: m.finger, cx: keyCenterX(m.midi, low), subRow: isBlack(m.midi) ? 1 : 0 })
    }
    return out
  }
  const rows = (slots: BadgeSlot[]): 0 | 1 | 2 =>
    slots.length === 0 ? 0 : slots.some((s) => s.subRow === 1) ? 2 : 1
  const rh = build('rh')
  const lh = build('lh')
  return { rh, lh, rhRows: rows(rh), lhRows: rows(lh) }
}

// ---- vertical layout ----

/** Gap between a badge row and the keyboard edge. */
export const BADGE_GAP = 8
/** Pitch between stacked sub-rows of one hand. */
export const SUB_ROW = 2 * BADGE_R + 6

const rowHeight = (rows: number): number => (rows === 0 ? 0 : BADGE_GAP + 2 * BADGE_R + (rows - 1) * SUB_ROW + 4)

/** true: both hands; 'rh': the RH rows only, for right-hand-only displays (chords). */
export type ReserveRows = boolean | 'rh'

/**
 * Vertical positions in SVG units. With reserveRows, both hands always get two sub-rows,
 * so the keyboard keeps the same height and position from one scale to the next.
 */
export function verticalLayout(
  rows: { rhRows: number; lhRows: number },
  reserveRows: ReserveRows = false,
): { keyTop: number; keyBottom: number; height: number } {
  const keyTop = rowHeight(reserveRows ? 2 : rows.rhRows)
  const keyBottom = keyTop + KEY.whiteH
  return { keyTop, keyBottom, height: keyBottom + rowHeight(reserveRows === true ? 2 : rows.lhRows) }
}

// ---- render scale ----

/** Lowest render scale (px per SVG unit). Finger numbers are 20 units, so 20 x 0.9 = 18px. */
export const MIN_SCALE = 0.9

/**
 * CSS min-width (px) for an SVG of this viewBox width; narrower containers scroll horizontally instead.
 * Rounded up to a whole pixel so layout's sub-pixel rounding can't land the scale a hair under MIN_SCALE.
 */
export function minRenderWidth(viewBoxWidth: number): number {
  return Math.ceil(viewBoxWidth * MIN_SCALE)
}

// ---- accessibility ----

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** 'E4'; when a label differs from the plain pitch name it is appended: 'D♯4, E♭'. */
export function keyAriaLabel(midi: number, label?: string): string {
  const name = SHARP_NAMES[pc(midi)] as string
  const full = `${name}${Math.floor(midi / 12) - 1}`
  return label === undefined || label === name || label === full ? full : `${full}, ${label}`
}
