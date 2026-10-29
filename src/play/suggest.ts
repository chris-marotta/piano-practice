import type { Rating } from '../srs/scheduler'
import type { RunAnalysis } from './analyse'
import { LOST_SLIPS, NAILED_EVENNESS } from './thresholds'

/**
 * Suggested rating from a step's detected runs (spec §6). Only slips and evenness are read, so a RunOutcome works too.
 * - Nailed: ≥1 run, every run 0 slips, every evenness ≥ NAILED_EVENNESS or null.
 * - Lost: any run with slips > LOST_SLIPS.
 * - Shaky: anything else. Peeked turns Nailed into Shaky (Nailed is disabled after a peek).
 * Null with no runs: nothing to suggest.
 */
export function suggestRating(
  runs: readonly Pick<RunAnalysis, 'slips' | 'evenness'>[],
  opts: { peeked: boolean },
): Rating | null {
  if (runs.length === 0) return null
  if (runs.some((r) => r.slips > LOST_SLIPS)) return 'lost'
  const nailed = runs.every((r) => r.slips === 0 && (r.evenness === null || r.evenness >= NAILED_EVENNESS))
  return nailed && !opts.peeked ? 'nailed' : 'shaky'
}
