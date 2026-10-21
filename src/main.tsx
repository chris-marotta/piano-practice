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

// Ask the browser not to evict localStorage under storage pressure (progress lives only here).
// Feature-detected; the answer doesn't change anything, so it is ignored.
try {
  void navigator.storage?.persist?.().catch(() => {})
} catch {
  // ignore
}

render(<App />, document.getElementById('app')!)
