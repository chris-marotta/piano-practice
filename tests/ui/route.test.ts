import { describe, expect, it } from 'vitest'
import { parseHash, resolveRoute } from '../../src/ui/route'

describe('parseHash', () => {
  it('strips the #/ prefix and any trailing slash', () => {
    expect(parseHash('#/today')).toBe('today')
    expect(parseHash('#library/')).toBe('library')
    expect(parseHash('')).toBe('')
    expect(parseHash('#/')).toBe('')
  })
})

describe('resolveRoute', () => {
  it('redirects every path to placement until placement is done', () => {
    for (const p of ['today', 'library', 'settings', 'session', '', 'nonsense'])
      expect(resolveRoute(p, false)).toBe('placement')
  })
  it('passes known routes through once placed', () => {
    for (const p of ['today', 'session', 'library', 'progress', 'settings', 'placement'] as const)
      expect(resolveRoute(p, true)).toBe(p)
  })
  it('falls back to today for empty or unknown paths', () => {
    expect(resolveRoute('', true)).toBe('today')
    expect(resolveRoute('nope', true)).toBe('today')
  })
})
