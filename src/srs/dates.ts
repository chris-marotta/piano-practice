// Local calendar dates as 'YYYY-MM-DD'. Never use toISOString (UTC) here.

const pad = (n: number): string => String(n).padStart(2, '0')

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parse(date: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)
  return [y, m, d]
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = parse(date)
  return localDate(new Date(y, m - 1, d + n))
}

// b - a in whole calendar days. Uses UTC day numbers so DST shifts cannot skew it.
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parse(a)
  const [by, bm, bd] = parse(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}
