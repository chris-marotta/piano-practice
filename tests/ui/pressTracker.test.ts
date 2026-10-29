import { describe, expect, it } from 'vitest'
import { createPressTracker, type PressPointer } from '../../src/ui/components/pressTracker'

const touch = (pointerId: number): PressPointer => ({ pointerId, pointerType: 'touch', button: 0 })
const mouse = (button: number): PressPointer => ({ pointerId: 1, pointerType: 'mouse', button })

describe('pressTracker: pointers', () => {
  it('a press starts once and releases once (up, then lostcapture / leave are no-ops)', () => {
    const t = createPressTracker()
    expect(t.down(touch(5), 60)).toBe(true)
    expect(t.down(touch(5), 60)).toBe(false) // repeated down for the same pointer
    expect(t.up(touch(5), 'up')).toBe(60)
    expect(t.up(touch(5), 'end')).toBe(null)
    expect(t.up(touch(5), 'end')).toBe(null)
  })
  it.each(['end'] as const)('cancel / leave / lost capture (%s) releases the press', (kind) => {
    const t = createPressTracker()
    t.down(touch(2), 64)
    expect(t.up({ pointerId: 2, pointerType: 'touch', button: -1 }, kind)).toBe(64)
  })
  it('tracks several pointers independently (chords on a touch screen)', () => {
    const t = createPressTracker()
    t.down(touch(1), 60)
    t.down(touch(2), 64)
    expect(t.up(touch(1), 'up')).toBe(60)
    expect(t.up(touch(1), 'end')).toBe(null) // pointer 1's late lostcapture must not touch pointer 2
    expect(t.up(touch(2), 'up')).toBe(64)
  })
  it('ignores mouse buttons other than the primary for starting a press', () => {
    const t = createPressTracker()
    expect(t.down(mouse(2), 60)).toBe(false)
    expect(t.up(mouse(2), 'up')).toBe(null)
  })
  it('a mouse pointerup from another button does not release; lost capture still does', () => {
    const t = createPressTracker()
    t.down(mouse(0), 60)
    expect(t.up(mouse(2), 'up')).toBe(null) // right button released during a left hold
    expect(t.up(mouse(0), 'up')).toBe(60)
    t.down(mouse(0), 62)
    expect(t.up(mouse(2), 'up')).toBe(null)
    expect(t.up({ pointerId: 1, pointerType: 'mouse', button: -1 }, 'end')).toBe(62) // never stuck
  })
})

describe('pressTracker: keyboard (Enter / Space)', () => {
  it('ignores auto-repeat and releases once', () => {
    const t = createPressTracker()
    expect(t.keyDown(60)).toBe(true)
    expect(t.keyDown(60)).toBe(false)
    expect(t.keyUp(60)).toBe(true)
    expect(t.keyUp(60)).toBe(false)
  })
})

describe('pressTracker: releaseAll', () => {
  it('returns every held key once (pointers and keyboard) and forgets them', () => {
    const t = createPressTracker()
    t.down(touch(1), 60)
    t.down(touch(2), 64)
    t.keyDown(67)
    expect(t.releaseAll().sort((a, b) => a - b)).toEqual([60, 64, 67])
    expect(t.releaseAll()).toEqual([])
    expect(t.up(touch(1), 'up')).toBe(null)
    expect(t.keyUp(67)).toBe(false)
  })
})
