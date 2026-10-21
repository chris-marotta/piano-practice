import { describe, expect, it } from 'vitest'
import {
  PLACEMENT_OPTIONS,
  choiceCounts,
  columnValue,
  defaultChoices,
  placementColumns,
  placementRows,
  setColumn,
} from '../../src/ui/screens/placementGrid'
import { DEFAULT_SETTINGS, enabledScales, placeItems, scaleId } from '../../src/srs/items'
import type { Settings } from '../../src/srs/items'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../../src/theory/scales'

const forms = (natural: boolean, harmonic: boolean, melodic: boolean): Settings => ({
  ...DEFAULT_SETTINGS,
  minorForms: { natural, harmonic, melodic },
})

describe('PLACEMENT_OPTIONS', () => {
  it('lists Solid, Shaky, Don\'t know in that order', () => {
    expect(PLACEMENT_OPTIONS).toEqual([
      { value: 'solid', label: 'Solid' },
      { value: 'shaky', label: 'Shaky' },
      { value: 'unknown', label: "Don't know" },
    ])
  })
})

describe('placementColumns', () => {
  it('is major plus natural minor by default', () => {
    expect(placementColumns(DEFAULT_SETTINGS)).toEqual([
      { form: 'major', label: 'Major' },
      { form: 'natural', label: 'Natural minor' },
    ])
  })

  it('adds a column per enabled minor form, in form order', () => {
    expect(placementColumns(forms(true, true, true)).map((c) => c.form)).toEqual([
      'major',
      'natural',
      'harmonic',
      'melodic',
    ])
    expect(placementColumns(forms(false, false, true)).map((c) => c.form)).toEqual(['major', 'melodic'])
  })

  it('is majors only when every minor form is off', () => {
    expect(placementColumns(forms(false, false, false))).toEqual([{ form: 'major', label: 'Major' }])
  })
})

describe('placementRows', () => {
  it('has 12 rows; row i pairs MAJOR_ROOTS[i] with MINOR_ROOTS[i] for each enabled minor form', () => {
    const rows = placementRows(forms(true, false, true))
    expect(rows).toHaveLength(12)
    rows.forEach((row, i) => {
      expect(row.map((c) => c.ref)).toEqual([
        { root: MAJOR_ROOTS[i], form: 'major' },
        { root: MINOR_ROOTS[i], form: 'natural' },
        { root: MINOR_ROOTS[i], form: 'melodic' },
      ])
    })
  })

  it('cells carry the scale id and display name', () => {
    const rows = placementRows(DEFAULT_SETTINGS)
    expect(rows[6]).toEqual([
      { id: 'scale:F#:major', ref: { root: 'F#', form: 'major' }, label: 'F♯ major' },
      { id: 'scale:Eb:natural', ref: { root: 'Eb', form: 'natural' }, label: 'E♭ natural minor' },
    ])
  })

  it('covers exactly the enabled scales', () => {
    const settings = forms(true, true, true)
    const ids = placementRows(settings).flat().map((c) => c.id).sort()
    expect(ids).toEqual(enabledScales(settings).map(scaleId).sort())
  })

  it('majors only: one cell per row', () => {
    const rows = placementRows(forms(false, false, false))
    expect(rows).toHaveLength(12)
    expect(rows.every((r) => r.length === 1 && r[0]?.ref.form === 'major')).toBe(true)
  })
})

describe('defaultChoices', () => {
  it('marks every enabled scale Shaky', () => {
    const settings = forms(true, true, false)
    const choices = defaultChoices(settings)
    expect(Object.keys(choices)).toHaveLength(36)
    expect(Object.values(choices).every((v) => v === 'shaky')).toBe(true)
  })

  it('placed as-is, every scale starts at box 1, L0, introduced', () => {
    const items = placeItems(defaultChoices(DEFAULT_SETTINGS), DEFAULT_SETTINGS, '2026-10-20')
    const scale = items['scale:C:major']
    expect(scale).toMatchObject({ box: 1, support: 0, introduced: true, due: '2026-10-20' })
  })
})

describe('setColumn / columnValue', () => {
  it('sets every cell in one column and leaves the others alone', () => {
    const settings = forms(true, true, false)
    const next = setColumn(defaultChoices(settings), settings, 'harmonic', 'unknown')
    for (const root of MINOR_ROOTS) {
      expect(next[`scale:${root}:harmonic`]).toBe('unknown')
      expect(next[`scale:${root}:natural`]).toBe('shaky')
    }
    for (const root of MAJOR_ROOTS) expect(next[`scale:${root}:major`]).toBe('shaky')
  })

  it('does not mutate its input', () => {
    const before = defaultChoices(DEFAULT_SETTINGS)
    setColumn(before, DEFAULT_SETTINGS, 'major', 'solid')
    expect(before['scale:C:major']).toBe('shaky')
  })

  it('reports the shared value of a uniform column, null when mixed', () => {
    const settings = DEFAULT_SETTINGS
    let choices = setColumn(defaultChoices(settings), settings, 'major', 'solid')
    expect(columnValue(choices, settings, 'major')).toBe('solid')
    expect(columnValue(choices, settings, 'natural')).toBe('shaky')
    choices = { ...choices, 'scale:G:major': 'unknown' }
    expect(columnValue(choices, settings, 'major')).toBeNull()
  })

  it('treats a missing choice as Shaky (the default)', () => {
    expect(columnValue({}, DEFAULT_SETTINGS, 'major')).toBe('shaky')
  })
})

describe('choiceCounts', () => {
  it('counts enabled scales by choice, missing counted as Shaky', () => {
    const settings = DEFAULT_SETTINGS
    const choices = { 'scale:C:major': 'solid', 'scale:G:major': 'solid', 'scale:A:natural': 'unknown' } as const
    expect(choiceCounts(choices, settings)).toEqual({ solid: 2, shaky: 21, unknown: 1 })
  })

  it('ignores choices for scales that are not enabled', () => {
    expect(choiceCounts({ 'scale:A:harmonic': 'solid' }, DEFAULT_SETTINGS)).toEqual({ solid: 0, shaky: 24, unknown: 0 })
  })
})
