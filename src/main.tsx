import { render } from 'preact'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './ui/tokens.css'
import './ui/app.css'
import { App } from './App'

render(<App />, document.getElementById('app')!)
