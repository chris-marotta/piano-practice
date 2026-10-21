import { Segmented } from '../components/Segmented'
import { ChordsPanel } from './library/ChordsPanel'
import { KeyChordsPanel } from './library/KeyChordsPanel'
import { segment, type Segment } from './library/libraryState'
import { ScalesPanel } from './library/ScalesPanel'
import { WhatChordPanel } from './library/WhatChordPanel'

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'scales', label: 'Scales' },
  { value: 'chords', label: 'Chords' },
  { value: 'key', label: 'Chords in a key' },
  { value: 'what', label: "What's this chord?" },
]

/** Look up any scale or chord on any root, a key's diatonic chords, or name a chord from tapped keys. */
export function Library() {
  const s = segment.value
  return (
    <section class="screen library">
      <header class="library__head">
        <h1 class="screen__title">Library</h1>
        <Segmented options={SEGMENTS} value={s} onChange={(v) => (segment.value = v)} label="Library section" />
      </header>
      {s === 'scales' && <ScalesPanel />}
      {s === 'chords' && <ChordsPanel />}
      {s === 'key' && <KeyChordsPanel />}
      {s === 'what' && <WhatChordPanel />}
    </section>
  )
}
