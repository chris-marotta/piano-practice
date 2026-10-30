import { useEffect, useRef } from 'preact/hooks'
import { Keyboard } from '../../components/Keyboard'
import { KEY, keyCenterX, whiteKeys, type KeyMark, type ReserveRows } from '../../components/keyboardLayout'

interface Props {
  low: number
  high: number
  marks: KeyMark[]
  /** Scrolled into view on mount when the keyboard is wider than its container. */
  firstMidi: number
  /** Default: both hands. */
  reserveRows?: ReserveRows
  /** All finger badges above the keys (one hand per keyboard). */
  badgesAbove?: boolean
  onKeyTap?: (midi: number) => void
  maxKeyPx?: number
  toggle?: boolean
  onKeyPress?: (midi: number, down: boolean) => void
}

/** <Keyboard reserveRows> that, when it has to scroll sideways, starts scrolled to the first marked key. */
export function ScrollKeyboard({
  low,
  high,
  marks,
  firstMidi,
  reserveRows = true,
  badgesAbove,
  onKeyTap,
  maxKeyPx,
  toggle,
  onKeyPress,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scroller = ref.current?.querySelector<HTMLElement>('.keyboard-scroll')
    const svg = scroller?.querySelector('svg')
    if (!scroller || !svg || scroller.scrollWidth <= scroller.clientWidth) return
    const viewBoxWidth = whiteKeys(low, high).length * KEY.whiteW + 4
    const pxPerUnit = svg.getBoundingClientRect().width / viewBoxWidth
    // One white key of margin to the left of the first marked key.
    scroller.scrollLeft = Math.max(0, (keyCenterX(firstMidi, low) - KEY.whiteW) * pxPerUnit)
  }, [low, high, firstMidi])
  return (
    <div class="stage" ref={ref}>
      <Keyboard
        low={low}
        high={high}
        marks={marks}
        reserveRows={reserveRows}
        badgesAbove={badgesAbove}
        onKeyTap={onKeyTap}
        maxKeyPx={maxKeyPx}
        toggle={toggle}
        onKeyPress={onKeyPress}
      />
    </div>
  )
}
