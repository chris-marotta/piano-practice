import { useState } from 'preact/hooks'
import { placeItems } from '../../srs/items'
import type { Placement as Choice } from '../../srs/items'
import { Segmented } from '../components/Segmented'
import { app, route, today, update } from '../state'
import {
  DEFAULT_PLACEMENT,
  PLACEMENT_OPTIONS,
  choiceCounts,
  columnValue,
  defaultChoices,
  placementColumns,
  placementRows,
  setColumn,
} from './placementGrid'

/** First run: mark every enabled scale Solid / Shaky / Don't know, then place items and go to Today. */
export function Placement() {
  const settings = app.value.settings
  const [choices, setChoices] = useState<Record<string, Choice>>(() => defaultChoices(settings))
  const columns = placementColumns(settings)
  const rows = placementRows(settings)
  const counts = choiceCounts(choices, settings)
  const total = counts.solid + counts.shaky + counts.unknown

  const start = () => {
    const date = today()
    update((s) => ({ ...s, items: placeItems(choices, s.settings, date), placedAt: date }))
    // Assigning the route replaces the history entry, so Back can't return here and re-place.
    route.value = 'today'
  }

  return (
    <section class="screen placement">
      <header class="placement__intro">
        <h1 class="placement__title">How well do you know each scale?</h1>
        <ul class="placement__key">
          <li>
            <strong>Solid:</strong> less on-screen help, longer gaps between reviews.
          </li>
          <li>
            <strong>Shaky:</strong> full help, back every day until it settles.
          </li>
          <li>
            <strong>Don't know:</strong> full help, introduced one new scale per session.
          </li>
        </ul>
      </header>

      <div class="placement__grid" style={{ '--cols': String(columns.length) }}>
        {columns.map((col) => (
          <div key={col.form} class="placement__col-head">
            <h2 class="placement__col-title">{col.label}</h2>
            <span class="placement__col-hint">Mark the whole column</span>
            <Segmented
              options={PLACEMENT_OPTIONS}
              value={columnValue(choices, settings, col.form)}
              onChange={(v) => setChoices((c) => setColumn(c, settings, col.form, v))}
              label={`Mark every ${col.label.toLowerCase()} scale`}
            />
          </div>
        ))}
        {rows.flatMap((row) =>
          row.map((cell) => (
            <div key={cell.id} class="pcell">
              <span class="pcell__name">{cell.label}</span>
              <Segmented
                options={PLACEMENT_OPTIONS}
                value={choices[cell.id] ?? DEFAULT_PLACEMENT}
                onChange={(v) => setChoices((c) => ({ ...c, [cell.id]: v }))}
                label={cell.label}
              />
            </div>
          )),
        )}
      </div>

      <footer class="placement__footer">
        <p class="placement__counts">
          {total} scales: {counts.solid} solid, {counts.shaky} shaky, {counts.unknown} don't know
        </p>
        <button type="button" class="btn btn--primary btn--lg" onClick={start}>
          Start practicing
        </button>
      </footer>
    </section>
  )
}
