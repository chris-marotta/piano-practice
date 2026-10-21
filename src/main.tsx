import { render } from 'preact'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
// Music symbols (♯ ♭ 𝄪 𝄫) that Atkinson lacks. Only the 'music' subset: Atkinson covers Latin.
import '@fontsource/noto-music/music-400.css'
import './ui/tokens.css'
import './ui/app.css'
import { App } from './App'

render(<App />, document.getElementById('app')!)
