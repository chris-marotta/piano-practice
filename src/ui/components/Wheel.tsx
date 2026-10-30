import { CIRCLE } from '../../theory/circle'
import { formatNote } from '../../theory/format'

interface Props {
  /** CIRCLE index of the lit key (0 = C / A minor, clockwise). */
  highlight: number
  /** The lit key is the minor on the inner ring (its major partner gets the outline), else the major outside. */
  minor: boolean
  /** Steps from the top (C, or A minor on the inner ring) to the lit key, drawn as an arc with a dot per step. */
  steps?: number
  /** Which way the steps go: '#' clockwise, 'b' anticlockwise. '' (or 0 steps) draws no arc. */
  accidental?: '#' | 'b' | ''
  /** Makes every key tappable (the Library's circle page): both rings of a position report its CIRCLE index. */
  onSelect?: (index: number) => void
}

/** viewBox geometry: outer disc, inner disc, label radii, step-arc radii (just outside each ring's labels). */
const R_OUTER = 100
const R_INNER = 60
const R_MAJOR = 80
const R_MINOR = 42
const R_ARC_MAJOR = 96.5
const R_ARC_MINOR = 24
const HIT_MAJOR = 15
const HIT_MINOR = 12

const at = (i: number, r: number): { x: number; y: number } => {
  const a = (i * Math.PI) / 6
  return { x: r * Math.sin(a), y: -r * Math.cos(a) }
}

const round = (n: number): number => Math.round(n * 100) / 100

/** The arc from the top to step `steps`, clockwise ('#') or anticlockwise ('b'). */
function arcPath(steps: number, sign: 1 | -1, r: number): string {
  const end = at(sign * steps, r)
  const large = steps > 6 ? 1 : 0
  const sweep = sign === 1 ? 1 : 0
  return `M 0 ${-r} A ${r} ${r} 0 ${large} ${sweep} ${round(end.x)} ${round(end.y)}`
}

/**
 * The circle of fifths: majors outside, relative minors inside, one key lit. Self-contained SVG coloured with the
 * app's tokens (inline styles, so it needs no stylesheet), sized by its container's width.
 */
export function Wheel({ highlight, minor, steps = 0, accidental = '', onSelect }: Props) {
  const sign = accidental === 'b' ? -1 : 1
  const arcR = minor ? R_ARC_MINOR : R_ARC_MAJOR
  const showArc = steps > 0 && accidental !== ''
  const lit = CIRCLE[highlight]
  const label = lit ? (minor ? `${formatNote(lit.minor)} minor` : `${formatNote(lit.major)} major`) : ''
  return (
    <svg
      class="wheel"
      viewBox="-104 -104 208 208"
      width="100%"
      role={onSelect ? 'group' : 'img'}
      aria-label={`Circle of fifths, ${label} lit${showArc ? `, ${steps} ${steps === 1 ? 'step' : 'steps'} ${sign === 1 ? 'clockwise' : 'anticlockwise'}` : ''}`}
      style={{ display: 'block', fontFamily: 'var(--font)', fontWeight: 700 }}
    >
      <circle r={R_OUTER} style={{ fill: 'var(--bg)', stroke: 'var(--line)', strokeWidth: 1.5 }} />
      <circle r={R_INNER} style={{ fill: 'var(--surface)', stroke: 'var(--line)', strokeWidth: 1.5 }} />
      {showArc && (
        <g aria-hidden="true">
          <path d={arcPath(steps, sign, arcR)} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeLinecap: 'round' }} />
          <circle cx={0} cy={-arcR} r={3} style={{ fill: 'var(--bg)', stroke: 'var(--accent)', strokeWidth: 1.5 }} />
          {Array.from({ length: steps }, (_, k) => {
            const p = at(sign * (k + 1), arcR)
            return <circle key={k} cx={round(p.x)} cy={round(p.y)} r={3} style={{ fill: 'var(--accent)' }} />
          })}
        </g>
      )}
      {CIRCLE.map((e, i) => {
        const outer = at(i, R_MAJOR)
        const inner = at(i, R_MINOR)
        const isLit = i === highlight
        const majorLit = isLit && !minor
        const minorLit = isLit && minor
        return (
          <g key={e.major} aria-hidden="true">
            {majorLit && <circle cx={round(outer.x)} cy={round(outer.y)} r={HIT_MAJOR} style={{ fill: 'var(--accent)' }} />}
            {minorLit && <circle cx={round(inner.x)} cy={round(inner.y)} r={HIT_MINOR} style={{ fill: 'var(--accent)' }} />}
            {isLit && (
              <circle
                cx={round(minor ? outer.x : inner.x)}
                cy={round(minor ? outer.y : inner.y)}
                r={minor ? HIT_MAJOR : HIT_MINOR}
                style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.5 }}
              />
            )}
            <text
              x={round(outer.x)}
              y={round(outer.y)}
              dy="0.35em"
              text-anchor="middle"
              style={{ fontSize: '13px', fill: majorLit ? 'var(--ink)' : 'var(--text)' }}
            >
              {formatNote(e.major)}
            </text>
            <text
              x={round(inner.x)}
              y={round(inner.y)}
              dy="0.35em"
              text-anchor="middle"
              style={{ fontSize: '9.5px', fill: minorLit ? 'var(--ink)' : isLit ? 'var(--text)' : 'var(--muted)' }}
            >
              {`${formatNote(e.minor)}m`}
            </text>
          </g>
        )
      })}
      {onSelect &&
        CIRCLE.map((e, i) => {
          const outer = at(i, R_MAJOR)
          const inner = at(i, R_MINOR)
          const target = (cx: number, cy: number, r: number, name: string, ring: string) => (
            <circle
              key={ring}
              class="wheel__hit"
              cx={round(cx)}
              cy={round(cy)}
              r={r}
              role="button"
              tabindex={0}
              aria-label={name}
              aria-pressed={i === highlight}
              onClick={() => onSelect(i)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onSelect(i)
                }
              }}
            />
          )
          return (
            <g key={e.major}>
              {target(outer.x, outer.y, HIT_MAJOR, `${formatNote(e.major)} major`, 'major')}
              {target(inner.x, inner.y, HIT_MINOR, `${formatNote(e.minor)} minor`, 'minor')}
            </g>
          )
        })}
    </svg>
  )
}
