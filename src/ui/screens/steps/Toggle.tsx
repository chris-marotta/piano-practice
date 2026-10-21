interface Props {
  label: string
  on: boolean
  onChange: (on: boolean) => void
}

/** On/off button for audio aids (drone, metronome). Rectangular, >= 48px, state in words. */
export function Toggle({ label, on, onChange }: Props) {
  return (
    <button type="button" class="btn toggle" aria-pressed={on} onClick={() => onChange(!on)}>
      <span class="toggle__label">{label}</span>
      <span class="toggle__state">{on ? 'On' : 'Off'}</span>
    </button>
  )
}
