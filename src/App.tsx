import { BackupPrompt } from './ui/components/BackupPrompt'
import { Banner } from './ui/components/Banner'
import { TabBar } from './ui/components/TabBar'
import { UnlockPrompt } from './ui/components/UnlockPrompt'
import { DevKeyboard } from './ui/screens/DevKeyboard'
import { Library } from './ui/screens/Library'
import { Play } from './ui/screens/play/Play'
import { Placement } from './ui/screens/Placement'
import { Today } from './ui/screens/Today'
import { Session } from './ui/screens/Session'
import { Progress } from './ui/screens/Progress'
import { Settings } from './ui/screens/Settings'
import { devPage, route, type Route } from './ui/state'

/** Focus screens hide the tab bar so a stray tap mid-practice can't leave the session. */
const FULL_SCREEN: Route[] = ['placement', 'session']
/** Screens whose MidiChip already shows the unlock prompt; the others get the app-level one. */
const CHIP_SCREENS: Route[] = ['session', 'play', 'settings']

function Screen({ route: r }: { route: Route }) {
  if (r === 'placement') return <Placement />
  if (r === 'today') return <Today />
  if (r === 'session') return <Session />
  if (r === 'play') return <Play />
  if (r === 'library') return <Library />
  if (r === 'progress') return <Progress />
  return <Settings />
}

export function App() {
  const r = route.value
  // `import.meta.env.DEV &&` is a literal false in production, so the dev page is tree-shaken out.
  const devKeyboard = import.meta.env.DEV && devPage.value === 'dev-keyboard'
  const showTabs = devKeyboard || !FULL_SCREEN.includes(r)
  return (
    <div class={`shell${showTabs ? ' shell--tabs' : ''}`}>
      <Banner />
      {(devKeyboard || !CHIP_SCREENS.includes(r)) && <UnlockPrompt />}
      <main class="shell__main">
        {devKeyboard ? <DevKeyboard /> : <Screen route={r} />}
      </main>
      {showTabs && <TabBar />}
      <BackupPrompt />
    </div>
  )
}
