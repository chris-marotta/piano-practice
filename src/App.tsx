import { Banner } from './ui/components/Banner'
import { TabBar } from './ui/components/TabBar'
import { Placeholder } from './ui/screens/Placeholder'
import { DevKeyboard } from './ui/screens/DevKeyboard'
import { Placement } from './ui/screens/Placement'
import { Today } from './ui/screens/Today'
import { devPage, route, type Route } from './ui/state'

const TITLES: Record<Route, string> = {
  today: 'Today',
  session: 'Session',
  library: 'Library',
  progress: 'Progress',
  settings: 'Settings',
  placement: 'Placement',
}

/** Focus screens hide the tab bar so a stray tap mid-practice can't leave the session. */
const FULL_SCREEN: Route[] = ['placement', 'session']

function Screen({ route: r }: { route: Route }) {
  if (r === 'placement') return <Placement />
  if (r === 'today') return <Today />
  return <Placeholder title={TITLES[r]} />
}

export function App() {
  const r = route.value
  // `import.meta.env.DEV &&` is a literal false in production, so the dev page is tree-shaken out.
  const devKeyboard = import.meta.env.DEV && devPage.value === 'dev-keyboard'
  const showTabs = devKeyboard || !FULL_SCREEN.includes(r)
  return (
    <div class={`shell${showTabs ? ' shell--tabs' : ''}`}>
      <Banner />
      <main class="shell__main">
        {devKeyboard ? <DevKeyboard /> : <Screen route={r} />}
      </main>
      {showTabs && <TabBar />}
    </div>
  )
}
