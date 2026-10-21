interface Option<T> {
  value: T
  label: string
}

interface Props<T extends string | number> {
  options: Option<T>[]
  /** Null shows no segment pressed (e.g. a mixed column). */
  value: T | null
  onChange: (value: T) => void
  /** Accessible name for the group. */
  label: string
  size?: 'md' | 'lg'
  disabled?: boolean
}

/** Rectangular segmented control (not pills). Each segment is a >= 48px toggle button. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  disabled = false,
}: Props<T>) {
  return (
    <div class={`seg seg--${size}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          class="seg__opt"
          data-value={String(o.value)}
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
