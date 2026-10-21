import { BADGE_R, KEY, badgeSlots, keyRects, whiteKeys, type BadgeSlot, type KeyMark, type KeyRect } from './keyboardLayout'

export type { KeyMark } from './keyboardLayout'

interface Props {
  /** Lowest and highest MIDI notes shown; use keyboardRange() so the range runs C..B. */
  low: number
  high: number
  marks: KeyMark[]
  onKeyTap?: (midi: number) => void
}

/** Gap between a badge row and the keyboard edge, and between stacked sub-rows. */
const GAP = 8
const SUB = 2 * BADGE_R + 6
/** Cap on rendered white-key width so a one-octave keyboard doesn't fill the iPad. */
const MAX_KEY_PX = 56

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const midiName = (m: number): string => `${SHARP_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`

const rowHeight = (rows: number): number => (rows === 0 ? 0 : GAP + 2 * BADGE_R + (rows - 1) * SUB + 4)

type Fill = 'rh' | 'lh' | 'none' | 'split' | null

function fillFor(hands: Set<KeyMark['hand']>): Fill {
  if (hands.has('rh') && hands.has('lh')) return 'split'
  if (hands.has('rh')) return 'rh'
  if (hands.has('lh')) return 'lh'
  if (hands.has('none')) return 'none'
  return null
}

/**
 * SVG piano keyboard, scaled to its container's width. Marked keys take the hand colour
 * (both hands on one key: top half RH, bottom half LH, matching the badge rows).
 * RH finger badges sit in a row above the keys, LH below; black-key badges use the outer sub-row.
 */
export function Keyboard({ low, high, marks, onKeyTap }: Props) {
  const rects = keyRects(low, high)
  const whiteCount = whiteKeys(low, high).length
  const width = whiteCount * KEY.whiteW
  const badges = badgeSlots(marks, low)
  const keyTop = rowHeight(badges.rhRows)
  const keyBottom = keyTop + KEY.whiteH
  const height = keyBottom + rowHeight(badges.lhRows)

  const hands = new Map<number, Set<KeyMark['hand']>>()
  const labels = new Map<number, string>()
  for (const m of marks) {
    if (!hands.has(m.midi)) hands.set(m.midi, new Set())
    hands.get(m.midi)!.add(m.hand)
    if (m.label !== undefined && !labels.has(m.midi)) labels.set(m.midi, m.label)
  }

  const interactive = onKeyTap !== undefined

  const renderKey = (k: KeyRect) => {
    const fill = fillFor(hands.get(k.midi) ?? new Set())
    const tone = k.black ? 'black' : 'white'
    const label = labels.get(k.midi)
    const base = `key key--${tone}${fill ? ` key--${fill}` : ''}`
    const tap = interactive
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': label ?? midiName(k.midi),
          onClick: () => onKeyTap(k.midi),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onKeyTap(k.midi)
            }
          },
        }
      : {}
    return (
      <g key={k.midi} class={interactive ? 'key-hit' : undefined} {...tap}>
        {fill === 'split' ? (
          <>
            <rect class={`key key--${tone} key--rh key--piece`} x={k.x} y={keyTop} width={k.w} height={k.h / 2} />
            <rect class={`key key--${tone} key--lh key--piece`} x={k.x} y={keyTop + k.h / 2} width={k.w} height={k.h / 2} />
            <rect class={`key key--${tone} key--outline`} x={k.x} y={keyTop} width={k.w} height={k.h} rx={3} />
          </>
        ) : (
          <rect class={base} x={k.x} y={keyTop} width={k.w} height={k.h} rx={3} />
        )}
        {label !== undefined && (
          <text
            class={`key-label key-label--${tone}${fill ? ' key-label--marked' : ''}`}
            x={k.x + k.w / 2}
            y={keyTop + k.h - (k.black ? 10 : 14)}
            text-anchor="middle"
          >
            {label}
          </text>
        )}
      </g>
    )
  }

  const placed = [
    ...badges.rh.map((b) => ({ b, hand: 'rh' as const })),
    ...badges.lh.map((b) => ({ b, hand: 'lh' as const })),
  ]
  const cyOf = (b: BadgeSlot, hand: 'rh' | 'lh'): number =>
    hand === 'rh' ? keyTop - GAP - BADGE_R - b.subRow * SUB : keyBottom + GAP + BADGE_R + b.subRow * SUB

  return (
    <svg
      class="keyboard"
      viewBox={`-2 0 ${width + 4} ${height}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: `${whiteCount * MAX_KEY_PX}px` }}
      role={interactive ? 'group' : 'img'}
      aria-label="Piano keyboard"
    >
      {/* Stems first so every badge circle paints over a neighbouring stem. */}
      <g class="keyboard__stems" aria-hidden="true">
        {placed.map(({ b, hand }) => (
          <line
            key={`${hand}-${b.midi}`}
            class={`badge__stem badge__stem--${hand}`}
            x1={b.cx}
            x2={b.cx}
            y1={cyOf(b, hand)}
            y2={hand === 'rh' ? keyTop : keyBottom}
          />
        ))}
      </g>
      {rects.map(renderKey)}
      <g class="keyboard__badges">
        {placed.map(({ b, hand }) => (
          <g key={`${hand}-${b.midi}`} class={`badge badge--${hand}`}>
            <circle class="badge__dot" cx={b.cx} cy={cyOf(b, hand)} r={BADGE_R} />
            <text class="badge__num" x={b.cx} y={cyOf(b, hand)} dy="0.35em" text-anchor="middle">
              {b.finger}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
