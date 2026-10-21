// Small pure helpers shared by the session screens (no Preact, no window).

/** Countdown display, m:ss, rounded up so "0:00" only shows when time is really up. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function progressLabel(index: number, total: number): string {
  return `Step ${index + 1} of ${total}`
}
