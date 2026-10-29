import { useEffect, useRef } from 'preact/hooks'
import { createPressTracker, type PressTracker, type ReleaseKind } from './pressTracker'
import {
  BADGE_GAP,
  BADGE_R,
  KEY,
  SUB_ROW,
  badgeSlots,
  keyAriaLabel,
  keyLooks,
  keyRects,
  keyboardMaxWidth,
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

const NO_LOOK: KeyLook = { fill: null, glow: null, glyph: null, label: undefined }

const STATE_WORD = { good: 'right', bad: 'wrong' } as const

/** ✓ / × as strokes, centred at (cx, cy); half-size s. */
function glyphPath(glyph: 'good' | 'bad', cx: number, cy: number, s: number): string {
  if (glyph === 'good') return `M${cx - s} ${cy}L${cx - s * 0.3} ${cy + s * 0.7}L${cx + s} ${cy - s * 0.8}`
  const d = s * 0.8
  return `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}`
}

/**
 * Pointer presses for onKeyPress (bookkeeping in pressTracker). Release always goes to the last
 * callback given, so a press held when onKeyPress is removed, or when the keyboard unmounts, still
 * gets its down=false.
 */
function usePresses(onKeyPress: Props['onKeyPress']) {
  const cb = useRef(onKeyPress)
  if (onKeyPress) cb.current = onKeyPress
  const tracker = useRef<PressTracker | null>(null)
  tracker.current ??= createPressTracker()
  const t = tracker.current
  const releaseAll = () => {
    for (const midi of t.releaseAll()) cb.current?.(midi, false)
  }
  const pressable = onKeyPress !== undefined
  // Handlers come off the keys when onKeyPress goes away, so release what they were holding.
  useEffect(() => {
    if (!pressable) releaseAll()
  }, [pressable])
  useEffect(() => releaseAll, [])
  const release = (kind: ReleaseKind) => (e: PointerEvent) => {
    const midi = t.up(e, kind)
    if (midi !== null) cb.current?.(midi, false)
  }
  return {
    down(e: PointerEvent, midi: number) {
      if (!t.down(e, midi)) return
      try {
        // A drag off the key still sends this key its pointerup.
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      } catch {
        // capture unsupported: pointerleave still releases
      }
      cb.current?.(midi, true)
    },
    up: release('up'),
    end: release('end'),
    keyDown(midi: number) {
      if (t.keyDown(midi)) cb.current?.(midi, true)
    },
    keyUp(midi: number) {
      if (t.keyUp(midi)) cb.current?.(midi, false)
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
    const { fill, glow, glyph, label } = looks.get(k.midi) ?? NO_LOOK
    const tone = k.black ? 'black' : 'white'
    const base = `key key--${tone}${fill ? ` key--${fill}` : glow ? ` key--${glow}` : ''}`
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
                onPointerCancel: presses.end,
                onPointerLeave: presses.end,
                onLostPointerCapture: presses.end,
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
        {glow === 'target' && k.black && (
          <rect class="key-rim" x={k.x + 1.5} y={keyTop + 1.5} width={k.w - 3} height={k.h - 3} rx={2} aria-hidden="true" />
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
        class={onKeyPress ? 'keyboard keyboard--pressable' : 'keyboard'}
        viewBox={`-2 0 ${viewBoxWidth} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{
          maxWidth: keyboardMaxWidth(whiteCount, maxKeyPx, viewBoxWidth, height),
          minWidth: `${minRenderWidth(viewBoxWidth)}px`,
        }}
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
