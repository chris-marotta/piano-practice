// All ASSUMED: tune after real playing sessions on the Roli.

/** Two notes exactly 12 semitones apart this close in time count as one Together pair. */
export const PAIR_WINDOW_MS = 150
/** Silence this long after the last note ends a run. */
export const RUN_END_SILENCE_MS = 2000
/**
 * Silence this long before a tonic means a new run is starting. ASSUMED limitation: a tonic after a 1.5-2 s pause
 * inside a run (a slow top tonic) closes that run instead of continuing it.
 */
export const RUN_START_SILENCE_MS = 1500
/** Runs shorter than this are ignored. */
export const MIN_RUN_NOTES = 5
/** Evenness at or above this reads as even enough for Nailed. */
export const NAILED_EVENNESS = 0.85
/** Lost when slips > LOST_SLIPS. */
export const LOST_SLIPS = 2
/** Fraction of notes that must be octave pairs for a run to read as Together. */
export const TOGETHER_PAIR_RATIO = 0.6
/** A wrong-shape note (one hand vs both) stays under the rep tiles this long. */
export const WRONG_SHAPE_NOTE_MS = 4000
/** Drill: a right answer slower than this grades Shaky instead of Nailed. */
export const DRILL_SLOW_MS = 5000
/** Drill level 4 (Speed): a right answer slower than this grades Lost. */
export const DRILL_FAST_MS = 3000
/** Ear drill: a right answer slower than this grades Shaky instead of Nailed (ASSUMED). */
export const EAR_SLOW_MS = 6000
/** Staff drill: a right answer slower than this grades Shaky instead of Nailed (ASSUMED). */
export const STAFF_SLOW_MS = 6000
/** Staff drill level 6 (Speed): a right answer slower than this grades Lost (ASSUMED). */
export const STAFF_FAST_MS = 4000
/** Drill: after a question is answered on the keys, playing the key again moves on, but not this soon after the answer. */
export const DRILL_ADVANCE_GUARD_MS = 250
