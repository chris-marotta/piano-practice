// Pure keyboard geometry (no DOM) in SVG user units. Keyboard.tsx renders it.

/**
 * Live-play states (phase 2). good / bad / pressed fill the key over any hand colour; target is a soft green glow,
 * played a dimmer one (a guided run's notes already played on this leg).
 */
export type KeyState = 'good' | 'bad' | 'pressed' | 'target' | 'played'

export interface KeyMark {
  midi: number
  hand: 'rh' | 'lh' | 'none'
  finger?: number
  label?: string
  state?: KeyState
  /** This key's pitch class is the target's root: it gets a blue dot at the bottom (label inside, if it has one). */
  root?: boolean
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

/**
 * Every badge above the keys, whatever its hand (a keyboard that shows one hand, such as a session hand panel).
 * Same rules as badgeSlots: black-key badges in the outer sub-row, one badge per key (the first mark wins).
 * `rows` is what the single row above needs; feed it to verticalLayout as `rhRows` with `lhRows: 0`.
 */
export function badgeSlotsAbove(
  marks: KeyMark[],
  low: number,
): { slots: (BadgeSlot & { hand: 'rh' | 'lh' })[]; rows: 0 | 1 | 2 } {
  const seen = new Set<number>()
  const slots: (BadgeSlot & { hand: 'rh' | 'lh' })[] = []
  for (const m of marks) {
    if (m.hand === 'none' || m.finger === undefined || seen.has(m.midi)) continue
    seen.add(m.midi)
    slots.push({ midi: m.midi, finger: m.finger, cx: keyCenterX(m.midi, low), subRow: isBlack(m.midi) ? 1 : 0, hand: m.hand })
  }
  return { slots, rows: slots.length === 0 ? 0 : slots.some((s) => s.subRow === 1) ? 2 : 1 }
}

// ---- per-key look ----

export type KeyFill = 'rh' | 'lh' | 'none' | 'split' | 'good' | 'bad' | 'pressed'

export interface KeyLook {
  fill: KeyFill | null
  /** Soft --good tint, no fill (lowest priority: only on an otherwise unmarked key). Target outranks played. */
  glow: 'target' | 'played' | null
  /** ✓ for good, × for bad, drawn in the label slot. */
  glyph: 'good' | 'bad' | null
  /** First label given for the key. */
  label: string | undefined
}

/** Spec §4.3 priority among states; a hand colour sits between 'pressed' and the glows ('target' > 'played'). */
const STATE_ORDER: Exclude<KeyState, 'target' | 'played'>[] = ['good', 'bad', 'pressed']

/**
 * One look per key in [low, high] (marks outside the range are dropped). A mark with a state
 * contributes that state, not its hand colour; its finger badge is unaffected (see badgeSlots).
 * Priority: good > bad > pressed > hand colour (rh / lh / split / none) > target glow > played glow.
 */
export function keyLooks(marks: KeyMark[], low: number, high: number): Map<number, KeyLook> {
  const byKey = new Map<number, KeyMark[]>()
  for (const m of marks) {
    if (m.midi < low || m.midi > high) continue
    const list = byKey.get(m.midi)
    if (list) list.push(m)
    else byKey.set(m.midi, [m])
  }
  const out = new Map<number, KeyLook>()
  for (const [midi, list] of byKey) {
    const label = list.find((m) => m.label !== undefined)?.label
    const states = new Set(list.map((m) => m.state))
    const state = STATE_ORDER.find((s) => states.has(s))
    if (state) {
      out.set(midi, { fill: state, glow: null, glyph: state === 'pressed' ? null : state, label })
      continue
    }
    const hands = new Set(list.filter((m) => m.state === undefined).map((m) => m.hand))
    const fill: KeyFill | null =
      hands.has('rh') && hands.has('lh')
        ? 'split'
        : hands.has('rh')
          ? 'rh'
          : hands.has('lh')
            ? 'lh'
            : hands.has('none')
              ? 'none'
              : null
    const glow = fill !== null ? null : states.has('target') ? 'target' : states.has('played') ? 'played' : null
    out.set(midi, { fill, glow, glyph: null, label })
  }
  return out
}

// ---- root dot ----

/** --root / --root-on-black (tokens.css) and the text on each; tests/ui/contrast.test.ts checks these against the CSS. */
export const ROOT_DOT = {
  white: { fill: '#3d6fb3', text: '#ffffff' },
  black: { fill: '#a9c7ee', text: '#12161c' },
} as const

/** Dot radius as a share of the key width: with a label inside, and without. */
const ROOT_R_LABELLED = 0.3
const ROOT_R_PLAIN = 0.2

/** Gap between the dot and the key's bottom edge. */
const ROOT_MARGIN = { white: 8, black: 6 } as const

/**
 * The root dot's colours for the key it sits on. A key's fill is its state (good / bad / pressed, or a glow) if it
 * has one, else its hand colour. `ring`: the dot alone is under 3:1 on that fill, so it gets a 2px --ink ring
 * (--ink is >= 3:1 on every fill that rings). The dot needs no ring on the pale glows: white keys' played tint,
 * black keys' target and played tints (tests/ui/contrast.test.ts checks every combination).
 */
export function rootDotLook(
  state: KeyState | undefined,
  hand: KeyMark['hand'],
  black: boolean,
): { fill: string; text: string; ring: boolean } {
  const { fill, text } = black ? ROOT_DOT.black : ROOT_DOT.white
  const clear: (KeyState | KeyMark['hand'])[] = black ? ['target', 'played'] : ['played']
  return { fill, text, ring: !clear.includes(state ?? hand) }
}

/** rootDotLook for a key's resolved look (a split key: the dot sits on its bottom half, the LH one). */
export function rootDotLookFor(look: KeyLook, black: boolean): { fill: string; text: string; ring: boolean } {
  const state = look.fill === 'good' || look.fill === 'bad' || look.fill === 'pressed' ? look.fill : (look.glow ?? undefined)
  const hand = look.fill === 'split' ? 'lh' : look.fill === 'rh' || look.fill === 'lh' ? look.fill : 'none'
  return rootDotLook(state, hand, black)
}

/** Centre and radius of a key's root dot, at the bottom of the key: 0.3 x key width with a label inside, else 0.2. */
export function rootDotGeometry(k: KeyRect, keyTop: number, labelled: boolean): { cx: number; cy: number; r: number } {
  const r = k.w * (labelled ? ROOT_R_LABELLED : ROOT_R_PLAIN)
  return { cx: k.x + k.w / 2, cy: keyTop + k.h - ROOT_MARGIN[k.black ? 'black' : 'white'] - r, r }
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

/** Width over height, rounded down (4 places), so an SVG sized by it is never taller than the height it was given. */
export function keyboardAspect(viewBoxWidth: number, height: number): number {
  return Math.floor((viewBoxWidth / height) * 1e4) / 1e4
}

/**
 * CSS max-width (px) for the SVG: `maxKeyPx` per white key, and no wider than `--kb-max-h` (a height the page can
 * set, e.g. Play's keyboard box) times the aspect ratio, so the keys grow until either runs out. Without the property
 * the fallback never binds.
 */
export function keyboardMaxWidth(whiteCount: number, maxKeyPx: number, viewBoxWidth: number, height: number): string {
  return `min(${whiteCount * maxKeyPx}px, calc(var(--kb-max-h, 100000px) * ${keyboardAspect(viewBoxWidth, height)}))`
}

/** The SVG Keyboard draws for these props, in units (the viewBox: white keys plus the 4-unit edge, and its height). */
export function keyboardBox(
  low: number,
  high: number,
  marks: KeyMark[],
  reserveRows: ReserveRows = false,
): { whiteCount: number; width: number; height: number } {
  const whiteCount = whiteKeys(low, high).length
  return { whiteCount, width: whiteCount * KEY.whiteW + 4, height: verticalLayout(badgeSlots(marks, low), reserveRows).height }
}

/**
 * CSS custom properties for a box that sizes its keyboard to the room it gets (Play): the aspect ratio, the width cap
 * (maxKeyPx per white key) and the smallest height the keyboard renders at (MIN_SCALE).
 */
export function keyboardFitVars(box: { whiteCount: number; width: number; height: number }, maxKeyPx: number): string {
  const aspect = keyboardAspect(box.width, box.height)
  const minH = Math.ceil(minRenderWidth(box.width) / aspect)
  return `--kb-aspect: ${aspect}; --kb-max-w: ${box.whiteCount * maxKeyPx}px; --kb-min-h: ${minH}px`
}

// ---- accessibility ----

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** 'E4'; when a label differs from the plain pitch name it is appended: 'D♯4, E♭'. */
export function keyAriaLabel(midi: number, label?: string): string {
  const name = SHARP_NAMES[pc(midi)] as string
  const full = `${name}${Math.floor(midi / 12) - 1}`
  return label === undefined || label === name || label === full ? full : `${full}, ${label}`
}
