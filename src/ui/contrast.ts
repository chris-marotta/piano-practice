// WCAG 2 contrast maths for checking the colour tokens (pure; used by tests).

export type RGB = [number, number, number]

/** '#12161c' or '#fff' -> [18, 22, 28]. */
export function parseHex(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a hex colour: "${hex}"`)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
}

/** color-mix(in srgb, a p, b): straight interpolation of the gamma-encoded channels. */
export function mixSrgb(a: RGB, b: RGB, p: number): RGB {
  return a.map((v, i) => v * p + (b[i] as number) * (1 - p)) as RGB
}

const channel = (v: number): number => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1–21, in either order. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
