import { useEffect, useRef } from 'preact/hooks'
import {
  BADGE_GAP,
  BADGE_R,
  KEY,
  SUB_ROW,
  badgeSlots,
  keyAriaLabel,
  keyLooks,
  keyRects,
  minRenderWidth,
  verticalLayout,
  whiteKeys,
  type BadgeSlot,
  type KeyLook,
  type KeyMark,
  type KeyRect,
  type ReserveRows,
} from './keyboardLayout'

export type { KeyMark } from './keyboardLayout'

interface Props {
  /** Lowest and highest MIDI notes shown; use keyboardRange() so the range runs C..B. */
  low: number
  high: number
  marks: KeyMark[]
  onKeyTap?: (midi: number) => void
  /** Always reserve two badge sub-rows per hand ('rh': RH only) so the keyboard doesn't shift between scales. */
  reserveRows?: ReserveRows
  /** Cap on rendered white-key width (px). Raise it where keys are tapped, so black keys reach 48px. */
  maxKeyPx?: number
  /** Keys are on/off toggles (tap to add or remove): each key reports aria-pressed = marked. */
  toggle?: boolean
  /**
   * Momentary keys (play the on-screen keyboard): down=true on pointerdown (or Enter/Space down),
   * down=false exactly once per press on pointerup / cancel / leave (or key up). Makes keys interactive.
   */
  onKeyPress?: (midi: number, down: boolean) => void
}

/** Default cap on rendered white-key width so a one-octave keyboard doesn't fill the iPad. */
const MAX_KEY_PX = 56

const NO_LOOK: KeyLook = { fill: null, target: false, glyph: null, label: undefined }

const STATE_WORD = { good: 'right', bad: 'wrong' } as const

/** ✓ / × as strokes, centred at (cx, cy); half-size s. */
function glyphPath(glyph: 'good' | 'bad', cx: number, cy: number, s: number): string {
  if (glyph === 'good') return `M${cx - s} ${cy}L${cx - s * 0.3} ${cy + s * 0.7}L${cx + s} ${cy - s * 0.8}`
  const d = s * 0.8
  return `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}`
}

/**
 * Pointer presses for onKeyPress. Each pointer (and the keyboard) holds at most one key; release
 * fires once per press, and anything still down when the keyboard unmounts is released then.
 */
function usePresses(onKeyPress: Props['onKeyPress']) {
  const cb = useRef(onKeyPress)
  cb.current = onKeyPress
  const pointers = useRef(new Map<number, number>()) // pointerId -> midi
  const keys = useRef(new Set<number>()) // midis held with Enter / Space
  useEffect(
    () => () => {
      for (const midi of pointers.current.values()) cb.current?.(midi, false)
      for (const midi of keys.current) cb.current?.(midi, false)
      pointers.current.clear()
      keys.current.clear()
    },
    [],
  )
  return {
    down(e: PointerEvent, midi: number) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (pointers.current.has(e.pointerId)) return
      try {
        // A drag off the key still sends this key its pointerup.
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        // capture unsupported: pointerleave still releases
      }
      pointers.current.set(e.pointerId, midi)
      cb.current?.(midi, true)
    },
    up(e: PointerEvent) {
      const midi = pointers.current.get(e.pointerId)
      if (midi === undefined) return
      pointers.current.delete(e.pointerId)
      cb.current?.(midi, false)
    },
    keyDown(midi: number) {
      if (keys.current.has(midi)) return // auto-repeat
      keys.current.add(midi)
      cb.current?.(midi, true)
    },
    keyUp(midi: number) {
      if (!keys.current.delete(midi)) return
      cb.current?.(midi, false)
    },
  }
}

/**
 * SVG piano keyboard, scaled to its container's width. Marked keys take the hand colour
 * (both hands on one key: top half RH, bottom half LH, matching the badge rows).
 * RH finger badges sit in a row above the keys, LH below; black-key badges use the outer sub-row.
 */
export function Keyboard({
  low,
  high,
  marks,
  onKeyTap,
  reserveRows = false,
  maxKeyPx = MAX_KEY_PX,
  toggle = false,
  onKeyPress,
}: Props) {
  const rects = keyRects(low, high)
  const whiteCount = whiteKeys(low, high).length
  const width = whiteCount * KEY.whiteW
  const badges = badgeSlots(marks, low)
  const { keyTop, keyBottom, height } = verticalLayout(badges, reserveRows)
  const viewBoxWidth = width + 4

  const looks = keyLooks(marks, low, high)
  const presses = usePresses(onKeyPress)

  const interactive = onKeyTap !== undefined || onKeyPress !== undefined
  const isActivate = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' '

  const renderKey = (k: KeyRect) => {
    const { fill, target, glyph, label } = looks.get(k.midi) ?? NO_LOOK
    const tone = k.black ? 'black' : 'white'
    const base = `key key--${tone}${fill ? ` key--${fill}` : ''}`
    const aria = keyAriaLabel(k.midi, label) + (glyph ? `, ${STATE_WORD[glyph]}` : '')
    const tap = interactive
      ? {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': aria,
          ...(toggle ? { 'aria-pressed': fill !== null } : {}),
          ...(onKeyTap ? { onClick: () => onKeyTap(k.midi) } : {}),
          onKeyDown: (e: KeyboardEvent) => {
            if (!isActivate(e)) return
            e.preventDefault()
            if (onKeyTap) onKeyTap(k.midi)
            if (onKeyPress) presses.keyDown(k.midi)
          },
          ...(onKeyPress
            ? {
                onKeyUp: (e: KeyboardEvent) => {
                  if (isActivate(e)) presses.keyUp(k.midi)
                },
                onBlur: () => presses.keyUp(k.midi),
                onPointerDown: (e: PointerEvent) => presses.down(e, k.midi),
                onPointerUp: presses.up,
                onPointerCancel: presses.up,
                onPointerLeave: presses.up,
                onLostPointerCapture: presses.up,
              }
            : {}),
        }
      : {}
    // The ✓/× takes the label slot; a label on the same key moves up one slot.
    const slotY = keyTop + k.h - (k.black ? 10 : 14)
    const glyphS = k.black ? 5 : 7
    const glyphCy = slotY - glyphS
    const labelY = glyph ? slotY - (k.black ? 18 : 24) : slotY
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
        {target && (
          <rect class="key-target" x={k.x + 1.5} y={keyTop + 1.5} width={k.w - 3} height={k.h - 3} rx={2} aria-hidden="true" />
        )}
        {label !== undefined && (
          <text
            class={`key-label key-label--${tone}${fill ? ' key-label--marked' : ''}`}
            x={k.x + k.w / 2}
            y={labelY}
            text-anchor="middle"
          >
            {label}
          </text>
        )}
        {glyph && (
          <path
            class={`key-glyph key-glyph--${tone}`}
            d={glyphPath(glyph, k.x + k.w / 2, glyphCy, glyphS)}
            aria-hidden="true"
          />
        )}
      </g>
    )
  }

  const placed = [
    ...badges.rh.map((b) => ({ b, hand: 'rh' as const })),
    ...badges.lh.map((b) => ({ b, hand: 'lh' as const })),
  ]
  const cyOf = (b: BadgeSlot, hand: 'rh' | 'lh'): number =>
    hand === 'rh'
      ? keyTop - BADGE_GAP - BADGE_R - b.subRow * SUB_ROW
      : keyBottom + BADGE_GAP + BADGE_R + b.subRow * SUB_ROW

  // Render scale stays >= MIN_SCALE (finger numbers >= 18px); narrower containers scroll sideways.
  return (
    <div class="keyboard-scroll">
      <svg
        class="keyboard"
        viewBox={`-2 0 ${viewBoxWidth} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ maxWidth: `${whiteCount * maxKeyPx}px`, minWidth: `${minRenderWidth(viewBoxWidth)}px` }}
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
    </div>
  )
}
