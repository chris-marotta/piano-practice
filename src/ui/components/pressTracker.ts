// Pure press bookkeeping for Keyboard's onKeyPress (no DOM): which key each pointer or the
// keyboard is holding, so every press is released exactly once. Unit tested in node.

/** The fields of a PointerEvent the tracker reads. */
export interface PressPointer {
  pointerId: number
  pointerType: string
  button: number
}

/**
 * 'up': pointerup (for a mouse, only the button that pressed releases).
 * 'end': pointercancel / pointerleave / lostpointercapture, which always release, so a press can't stick.
 */
export type ReleaseKind = 'up' | 'end'

export interface PressTracker {
  /** True when this starts a new press (the caller then reports down=true). */
  down(p: PressPointer, midi: number): boolean
  /** The released key, or null when this pointer holds nothing (or a mouse's other button let go). */
  up(p: PressPointer, kind: ReleaseKind): number | null
  /** Enter / Space down: true when it starts a press (auto-repeat returns false). */
  keyDown(midi: number): boolean
  /** Enter / Space up or blur: true when it ends a press. */
  keyUp(midi: number): boolean
  /** Every held key, once; the tracker is then empty. */
  releaseAll(): number[]
}

export function createPressTracker(): PressTracker {
  const pointers = new Map<number, { midi: number; button: number }>()
  const keys = new Set<number>()
  return {
    down(p, midi) {
      if (p.pointerType === 'mouse' && p.button !== 0) return false
      if (pointers.has(p.pointerId)) return false
      pointers.set(p.pointerId, { midi, button: p.button })
      return true
    },
    up(p, kind) {
      const held = pointers.get(p.pointerId)
      if (!held) return null
      if (kind === 'up' && p.pointerType === 'mouse' && p.button !== held.button) return null
      pointers.delete(p.pointerId)
      return held.midi
    },
    keyDown(midi) {
      if (keys.has(midi)) return false
      keys.add(midi)
      return true
    },
    keyUp(midi) {
      return keys.delete(midi)
    },
    releaseAll() {
      const out = [...[...pointers.values()].map((h) => h.midi), ...keys]
      pointers.clear()
      keys.clear()
      return out
    },
  }
}
