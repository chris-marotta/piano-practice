import type { ComponentChildren } from 'preact'
import { Segmented } from '../../components/Segmented'
import { pickerKeys, spellingOptions, type PickerContext } from './libraryView'

interface Props {
  root: string
  context: PickerContext
  onChange: (root: string) => void
  /** Extra controls at the end of the row (Play's Random). */
  children?: ComponentChildren
}

/** 12 large root buttons, C..B (black-key roots on a darker face), plus the enharmonic spelling toggle. */
export function RootPicker({ root, context, onChange, children }: Props) {
  const keys = pickerKeys(root, context)
  const spellings = spellingOptions(root)
  return (
    <div class="roots">
      <div class="roots__keys" role="group" aria-label="Root">
        {keys.map((k, pc) => (
          <button
            key={pc}
            type="button"
            class={`btn root${[1, 3, 6, 8, 10].includes(pc) ? ' root--black' : ''}`}
            aria-pressed={k.selected}
            onClick={() => onChange(k.root)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div class="roots__spelling">
        {spellings.length > 0 ? (
          <Segmented options={spellings} value={root} onChange={onChange} label="Spelling" />
        ) : (
          <p class="roots__single">One spelling</p>
        )}
      </div>
      {children}
    </div>
  )
}
