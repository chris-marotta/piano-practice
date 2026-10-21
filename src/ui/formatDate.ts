// Display helpers for local 'YYYY-MM-DD' dates (pure; fixed English names so output is deterministic).

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function parse(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** '2026-10-20' -> 'Tuesday 20 October 2026'. Anything else passes through. */
export function formatDay(date: string): string {
  const d = parse(date)
  if (!d) return date
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** '2026-10-20' -> 'Tue'. */
export function weekdayShort(date: string): string {
  const d = parse(date)
  return d ? (WEEKDAYS[d.getDay()] as string).slice(0, 3) : ''
}
