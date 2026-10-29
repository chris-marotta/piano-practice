// All ASSUMED: tune after real playing sessions on the Roli.

/** Two notes exactly 12 semitones apart this close in time count as one Together pair. */
export const PAIR_WINDOW_MS = 150
/** Silence this long after the last note ends a run. */
export const RUN_END_SILENCE_MS = 2000
/** Silence this long before a note means a new run is starting. */
export const RUN_START_SILENCE_MS = 1500
/** Runs shorter than this are ignored. */
export const MIN_RUN_NOTES = 5
/** Evenness at or above this reads as even enough for Nailed. */
export const NAILED_EVENNESS = 0.85
/** Lost when slips > LOST_SLIPS. */
export const LOST_SLIPS = 2
/** Fraction of notes that must be octave pairs for a run to read as Together. */
export const TOGETHER_PAIR_RATIO = 0.6
/** A run whose median pitch is below this is treated as left hand. */
export const LH_MEDIAN_BELOW = 60
