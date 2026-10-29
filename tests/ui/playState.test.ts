import { beforeEach, describe, expect, it } from 'vitest'
import {
  fitted,
  hand,
  keyWindow,
  mode,
  octavesSel,
  playHand,
  playTarget,
  resetWindow,
  scaleSel,
  targetKind,
} from '../../src/ui/screens/play/playState'
import { fittedWindow, shiftWindow } from '../../src/ui/screens/play/playView'

describe('playState: octaves and the keyboard window', () => {
  beforeEach(() => {
    targetKind.value = 'scale'
    scaleSel.value = { root: 'C', form: 'major' }
    octavesSel.value = 1
    mode.value = 'free'
    hand.value = 'rh'
  })

  it('opens on one octave (Play does not follow settings.octaves)', () => {
    expect(playTarget.value).toMatchObject({ kind: 'scale', octaves: 1 })
  })

  it('starts from the fitted window', () => {
    expect(keyWindow.value).toEqual(fittedWindow(playTarget.value, 'rh'))
    expect(fitted.value).toEqual({ low: 55, high: 79 })
  })

  it('a new target, mode or hand resets a followed window to the fitted one', () => {
    keyWindow.value = shiftWindow(keyWindow.value, 100)
    scaleSel.value = { root: 'D', form: 'major' }
    expect(keyWindow.value).toEqual(fitted.value)

    keyWindow.value = shiftWindow(keyWindow.value, 100)
    mode.value = 'check'
    expect(keyWindow.value).toEqual(fitted.value)

    mode.value = 'guided'
    keyWindow.value = shiftWindow(keyWindow.value, 100)
    hand.value = 'lh'
    expect(playHand.value).toBe('lh')
    expect(keyWindow.value).toEqual(fitted.value)
    expect(fitted.value).toEqual(fittedWindow(playTarget.value, 'lh'))
  })

  it('hand only counts in a guided scale', () => {
    hand.value = 'together'
    expect(playHand.value).toBe('rh')
    targetKind.value = 'chord'
    mode.value = 'guided'
    expect(playHand.value).toBe('rh')
  })

  it('resetWindow (Restart) snaps back to the fitted window', () => {
    keyWindow.value = shiftWindow(keyWindow.value, 20)
    expect(keyWindow.value).not.toEqual(fitted.value)
    resetWindow()
    expect(keyWindow.value).toEqual(fitted.value)
  })
})
