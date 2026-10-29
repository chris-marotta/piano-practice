interface Props {
  label: string
  on: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
}

/** On/off button for audio aids (drone, metronome). Rectangular, >= 48px, state in words. */
export function Toggle({ label, on, onChange, disabled = false }: Props) {
  return (
    <button type="button" class="btn toggle" aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span class="toggle__label">{label}</span>
      <span class="toggle__state">{on ? 'On' : 'Off'}</span>
    </button>
  )
}
