import { devPage, route, type Route } from '../state'

const TABS: { id: Route; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'library', label: 'Library' },
  { id: 'progress', label: 'Progress' },
]

function GearIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  )
}

/** Bottom tab bar: Today · Library · Progress, gear to Settings. Links, so taps add history entries. */
export function TabBar() {
  // Dev pages aren't tabs, so nothing is marked active on them.
  const current = devPage.value === null ? route.value : null
  return (
    <nav class="tabbar" aria-label="Main">
      <div class="tabbar__tabs">
        {TABS.map((t) => (
          <a
            key={t.id}
            class="tab"
            href={`#/${t.id}`}
            aria-current={current === t.id ? 'page' : undefined}
          >
            {t.label}
          </a>
        ))}
      </div>
      <a
        class="tab tab--icon"
        href="#/settings"
        aria-label="Settings"
        aria-current={current === 'settings' ? 'page' : undefined}
      >
        <GearIcon />
      </a>
    </nav>
  )
}
