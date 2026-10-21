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
