// Pure view model for the placement grid (no Preact, no window): unit tested in node.
import { scaleId } from '../../srs/items'
import type { Placement, Settings } from '../../srs/items'
import { formatScale } from '../../theory/format'
import { MAJOR_ROOTS, MINOR_ROOTS } from '../../theory/scales'
import type { ScaleForm, ScaleRef } from '../../theory/scales'

export const PLACEMENT_OPTIONS: { value: Placement; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'shaky', label: 'Shaky' },
  { value: 'unknown', label: "Don't know" },
]

/** Every cell starts here until Chris taps it. */
export const DEFAULT_PLACEMENT: Placement = 'shaky'

export interface GridColumn {
  form: ScaleForm
  label: string
}

export interface GridCell {
  id: string
  ref: ScaleRef
  label: string
}

const MINOR_FORMS = ['natural', 'harmonic', 'melodic'] as const
const COLUMN_LABEL: Record<ScaleForm, string> = {
  major: 'Major',
  natural: 'Natural minor',
  harmonic: 'Harmonic minor',
  melodic: 'Melodic minor',
}

/** Major, then each enabled minor form. All minor forms off leaves majors only. */
export function placementColumns(settings: Settings): GridColumn[] {
  const forms: ScaleForm[] = ['major', ...MINOR_FORMS.filter((f) => settings.minorForms[f])]
  return forms.map((form) => ({ form, label: COLUMN_LABEL[form] }))
}

/**
 * 12 rows in circle-of-fifths order. Row i holds MAJOR_ROOTS[i] major, then MINOR_ROOTS[i]
 * in each enabled minor form (paired by index: row 6 is F♯ major beside E♭ minor).
 */
export function placementRows(settings: Settings): GridCell[][] {
  const columns = placementColumns(settings)
  return MAJOR_ROOTS.map((major, i) =>
    columns.map(({ form }) => {
      const ref: ScaleRef = { root: form === 'major' ? major : (MINOR_ROOTS[i] as string), form }
      return { id: scaleId(ref), ref, label: formatScale(ref) }
    }),
  )
}

const cellIds = (settings: Settings, form?: ScaleForm): string[] =>
  placementRows(settings)
    .flat()
    .filter((c) => form === undefined || c.ref.form === form)
    .map((c) => c.id)

/** Every enabled scale marked Shaky. Pass the full map to placeItems (it treats a missing id as unknown). */
export function defaultChoices(settings: Settings): Record<string, Placement> {
  return Object.fromEntries(cellIds(settings).map((id) => [id, DEFAULT_PLACEMENT]))
}

const choiceOf = (choices: Record<string, Placement>, id: string): Placement => choices[id] ?? DEFAULT_PLACEMENT

/** New map with every cell of one column set to `value`. */
export function setColumn(
  choices: Record<string, Placement>,
  settings: Settings,
  form: ScaleForm,
  value: Placement,
): Record<string, Placement> {
  const next = { ...choices }
  for (const id of cellIds(settings, form)) next[id] = value
  return next
}

/** The value every cell in the column shares, or null when the column is mixed. */
export function columnValue(
  choices: Record<string, Placement>,
  settings: Settings,
  form: ScaleForm,
): Placement | null {
  const values = new Set(cellIds(settings, form).map((id) => choiceOf(choices, id)))
  return values.size === 1 ? ([...values][0] as Placement) : null
}

/** How many enabled scales sit at each choice. */
export function choiceCounts(choices: Record<string, Placement>, settings: Settings): Record<Placement, number> {
  const counts: Record<Placement, number> = { solid: 0, shaky: 0, unknown: 0 }
  for (const id of cellIds(settings)) counts[choiceOf(choices, id)]++
  return counts
}
