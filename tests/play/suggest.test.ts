import { describe, expect, it } from 'vitest'
import { suggestRating } from '../../src/play/suggest'

const run = (slips: number, evenness: number | null) => ({ slips, evenness })
const open = { peeked: false }

describe('suggestRating', () => {
  it('no runs → null', () => {
    expect(suggestRating([], open)).toBeNull()
    expect(suggestRating([], { peeked: true })).toBeNull()
  })

  it('two clean runs at evenness 0.9 → nailed', () => {
    expect(suggestRating([run(0, 0.9), run(0, 0.9)], open)).toBe('nailed')
  })

  it('one clean run at evenness 0.8 → shaky', () => {
    expect(suggestRating([run(0, 0.8)], open)).toBe('shaky')
  })

  it('evenness exactly 0.85 is even enough', () => {
    expect(suggestRating([run(0, 0.85)], open)).toBe('nailed')
  })

  it('one run with 3 slips → lost', () => {
    expect(suggestRating([run(3, 0.9)], open)).toBe('lost')
  })

  it('one run with 2 slips → shaky', () => {
    expect(suggestRating([run(2, 0.9)], open)).toBe('shaky')
  })

  it('any run over 2 slips makes it lost, even beside clean runs', () => {
    expect(suggestRating([run(0, 0.95), run(0, 0.95), run(4, 0.9)], open)).toBe('lost')
  })

  it('clean + peeked → shaky', () => {
    expect(suggestRating([run(0, 0.9)], { peeked: true })).toBe('shaky')
  })

  it('peeked leaves lost and shaky alone', () => {
    expect(suggestRating([run(3, 0.9)], { peeked: true })).toBe('lost')
    expect(suggestRating([run(1, 0.9)], { peeked: true })).toBe('shaky')
  })

  it('evenness null and clean → nailed', () => {
    expect(suggestRating([run(0, null)], open)).toBe('nailed')
  })
})
