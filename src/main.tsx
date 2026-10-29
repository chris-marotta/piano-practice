// First import on purpose: swaps Tone's audio context before any other module can create Tone nodes.
import './audio/boot'
import { render } from 'preact'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
// Music symbols (♯ ♭ 𝄪 𝄫) that Atkinson lacks. Only the 'music' subset: Atkinson covers Latin.
import '@fontsource/noto-music/music-400.css'
import './ui/tokens.css'
import './ui/app.css'
import './ui/session.css'
import './ui/library.css'
import './ui/progress.css'
import './ui/settings.css'
import { App } from './App'
import { startLiveSound } from './audio/live'
import { app } from './ui/state'

// Ask the browser not to evict localStorage under storage pressure (progress lives only here).
// Feature-detected; the answer doesn't change anything, so it is ignored.
try {
  void navigator.storage?.persist?.().catch(() => {})
} catch {
  // ignore
}

// Play the piano as the keyboard is played. Setting read at each note, so the toggle applies at once.
startLiveSound(() => app.value.settings.keyboardSound)

render(<App />, document.getElementById('app')!)
