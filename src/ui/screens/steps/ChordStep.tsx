import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { playChord } from '../../../audio/piano'
import { unlockAudio } from '../../../audio/unlock'
import type { Step } from '../../../session/builder'
import type { Rating } from '../../../srs/scheduler'
import { chordNotes, type DiatonicChord } from '../../../theory/chords'
import { formatScale } from '../../../theory/format'
import { voiceLedCadence } from '../../../theory/voiceLeading'
import { RatingBar } from '../../components/RatingBar'
import { Segmented } from '../../components/Segmented'
import { chordCard, chordMarks, chordStepRange, inversionsOfTonic } from './chordView'
import { ScrollKeyboard } from './ScrollKeyboard'
import { useSilenceOnLeave } from './useAudio'

type ChordStepData = Extract<Step, { kind: 'chords' }>
type Mode = 'block' | 'broken'

interface Voiced {
  key: string
  type: DiatonicChord['type']
  notes: string[]
  inversion: number
}

interface Props {
  step: ChordStepData
  onRate: (r: Rating) => void
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'block', label: 'Block' },
  { value: 'broken', label: 'Broken' },
]

/** Gap between chords when playing the whole cadence. */
const CADENCE_GAP_MS: Record<Mode, number> = { block: 1400, broken: 1900 }

const INV_SHORT = ['root', '1st inv', '2nd inv']

const rootVoicing = (c: DiatonicChord, i: number): Voiced => ({
  key: `p${i}`,
  type: c.type,
  notes: chordNotes(c.root, c.type, 0),
  inversion: 0,
})

export function ChordStep({ step, onRate }: Props) {
  const [mode, setMode] = useState<Mode>('block')
  const tonic = step.chords[0] as DiatonicChord
  const [sel, setSel] = useState<Voiced>(() => rootVoicing(tonic, 0))
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useSilenceOnLeave()
  const stopCadence = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  useEffect(() => stopCadence, [])

  const range = useMemo(() => chordStepRange(step.chords, step.includeInversions), [step])
  const inversions = useMemo(() => inversionsOfTonic(tonic), [tonic])
  const cadence = useMemo(() => (step.includeInversions ? voiceLedCadence(step.chords) : []), [step])

  const show = async (v: Voiced) => {
    stopCadence()
    setSel(v)
    await unlockAudio()
    playChord(v.notes, mode)
  }

  const playCadence = async () => {
    stopCadence()
    await unlockAudio()
    cadence.forEach((c, i) => {
      const v: Voiced = { key: `c${i}`, type: c.type, notes: c.notes, inversion: c.inversion }
      timers.current.push(
        setTimeout(() => {
          setSel(v)
          playChord(v.notes, mode)
        }, i * CADENCE_GAP_MS[mode]),
      )
    })
  }

  const marks = chordMarks(sel.notes, sel.type, sel.inversion)
  const firstMidi = Math.min(...marks.map((m) => m.midi))

  const card = (v: Voiced, numeral: string, sub: string) => (
    <button key={v.key} type="button" class="btn chord-card" aria-pressed={sel.key === v.key} onClick={() => show(v)}>
      <span class="chord-card__numeral">{numeral}</span>
      <span class="chord-card__name">{sub}</span>
    </button>
  )

  return (
    <div class="step step--chords">
      <header class="step__head">
        <div class="step__heading">
          <h1 class="step__title">{formatScale(step.ref)} chords</h1>
          <p class="step__kicker">Right hand · tap a chord to see and hear it</p>
        </div>
        <div class="step__tools">
          <Segmented options={MODES} value={mode} onChange={setMode} label="Block or broken" size="lg" />
        </div>
      </header>

      <div class="step__body chord-sets">
        <div class="chord-set">
          <h2 class="chord-set__label">Progression</h2>
          <div class="chord-set__cards">
            {step.chords.map((c, i) => {
              const v = chordCard(c)
              return card(rootVoicing(c, i), v.numeral, `${v.name} ${v.quality}`)
            })}
          </div>
        </div>
        {step.includeInversions && (
          <>
            <div class="chord-set">
              <h2 class="chord-set__label">{tonic.numeral} inversions</h2>
              <div class="chord-set__cards">
                {inversions.map((inv) =>
                  card({ key: `i${inv.inversion}`, type: tonic.type, notes: inv.notes, inversion: inv.inversion }, tonic.numeral, inv.label),
                )}
              </div>
            </div>
            <div class="chord-set chord-set--wide">
              <h2 class="chord-set__label">Voice-led {cadence.map((c) => c.numeral).join('–')}</h2>
              <div class="chord-set__cards">
                {cadence.map((c, i) =>
                  card({ key: `c${i}`, type: c.type, notes: c.notes, inversion: c.inversion }, c.numeral, INV_SHORT[c.inversion] ?? ''),
                )}
                <button type="button" class="btn btn--tool chord-set__play" onClick={playCadence}>
                  <span aria-hidden="true">▶</span> Play all
                </button>
              </div>
            </div>
          </>
        )}
        {/* Right hand only: reserve just the RH badge rows so the keys sit larger. */}
        <ScrollKeyboard low={range.low} high={range.high} marks={marks} firstMidi={firstMidi} reserveRows="rh" />
      </div>

      <div class="step__foot">
        <RatingBar options={['nailed', 'shaky', 'lost']} onRate={onRate} />
      </div>
    </div>
  )
}
