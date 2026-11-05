import { drillLevel } from '../../drill/engine'
import { KEYS_DEF } from '../../drill/keys'
import { STAFF_DEF } from '../../drill/staff'
import { app, resumed, today } from '../state'
import {
  MASTERY_LEGEND,
  calendarWeeks,
  keyCells,
  keysLevelText,
  masteryColumns,
  masteryRows,
  progressStats,
  staffCells,
  staffLevelText,
} from './progressView'

/** Mastery grid (box shade + support mark per scale), streak, minutes, and the last 8 weeks. */
export function Progress() {
  const { items, settings, log } = app.value
  void resumed.value // re-derive when the app returns to the foreground (the date may have changed)
  const date = today()
  const columns = masteryColumns(settings)
  const rows = masteryRows(items, settings, date)
  const keys = keyCells(items, date, settings)
  const staff = staffCells(items, date, settings)
  const stats = progressStats(log, date)
  const calendar = calendarWeeks(log, date)

  return (
    <section class="screen progress">
      <div class="progress__scales">
        <h1 class="screen__title">Progress</h1>

        <div class="mastery" style={{ '--cols': String(columns.length) }} role="table" aria-label="Scale mastery">
          <div class="mastery__row" role="row">
            {columns.map((col) => (
              <span key={col.form} class="mastery__head" role="columnheader">
                {col.label}
              </span>
            ))}
          </div>
          {rows.map((row, i) => (
            <div key={i} class="mastery__row" role="row">
              {row.map((cell) => (
                <div
                  key={cell.id}
                  class={`mcell mcell--${cell.shade}`}
                  role="cell"
                  aria-label={cell.description}
                  title={cell.description}
                >
                  <span class="mcell__root" aria-hidden="true">
                    {cell.root}
                  </span>
                  {cell.supportLabel && (
                    <span class="mcell__support" aria-hidden="true">
                      {cell.supportLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div class="keys-row">
          <div class="keys-row__head">
            <h2 class="keys-row__title">Keys</h2>
            <p class="keys-row__level">{keysLevelText(drillLevel(KEYS_DEF, items, date, settings))}</p>
          </div>
          <div class="keys-row__cells" role="table" aria-label="Key mastery">
            <div class="keys-row__strip" role="row">
              {keys.map((cell) => (
                <div
                  key={cell.pc}
                  class={`mcell mcell--${cell.box ?? 0} kcell`}
                  role="cell"
                  aria-label={cell.description}
                  title={cell.description}
                >
                  <span aria-hidden="true">{cell.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div class="keys-row staff-row">
          <div class="keys-row__head">
            <h2 class="keys-row__title">Staff</h2>
            <p class="keys-row__level">{staffLevelText(drillLevel(STAFF_DEF, items, date, settings))}</p>
          </div>
          <div class="staff-row__groups" role="table" aria-label="Staff note mastery">
            {staff.map((g) => (
              <div key={g.group} class="staff-row__group" role="row" style={{ '--n': String(g.cells.length) }}>
                {g.cells.map((cell, i) => (
                  <div
                    key={i}
                    class={`mcell mcell--${cell.box ?? 0} scell`}
                    role="cell"
                    aria-label={cell.description}
                    title={cell.description}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div class="legend" role="group" aria-label="Key">
          <div class="legend__ramp">
            <span class="legend__swatch mcell--0" aria-hidden="true" />
            <span class="legend__text">Not started</span>
            {MASTERY_LEGEND.map((l) => (
              <span key={l.shade} class={`legend__swatch mcell--${l.shade}`} aria-hidden="true" />
            ))}
            <span class="legend__text">Box 1 (daily) to box 5 (every 16 days)</span>
          </div>
          <p class="legend__text">L0 full keyboard help, L1 note names, L2 key signature, L3 from memory</p>
        </div>
      </div>

      <div class="progress__side">
        <dl class="stats">
          <div class="stat">
            <dt class="stat__label">Streak</dt>
            <dd class={`stat__value${stats.streak > 0 ? ' stat__value--on' : ''}`}>{stats.streakLabel}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">This week</dt>
            <dd class="stat__value">{stats.thisWeek}</dd>
          </div>
          <div class="stat">
            <dt class="stat__label">All time</dt>
            <dd class="stat__value">{stats.allTime}</dd>
            <dd class="stat__note">
              {stats.daysPracticed} {stats.daysPracticed === 1 ? 'day' : 'days'} practiced
            </dd>
          </div>
        </dl>

        <div class="calendar">
          <h2 class="calendar__title">Last 8 weeks</h2>
          <div class="calendar__grid" role="table" aria-label="Practice days, last 8 weeks">
            <div class="calendar__row" role="row">
              {calendar.weekdays.map((d, i) => (
                <span key={i} class="calendar__weekday" role="columnheader">
                  {d}
                </span>
              ))}
            </div>
            {calendar.weeks.map((week, w) => (
              <div key={w} class="calendar__row" role="row">
                {week.map((day) => (
                  <span
                    key={day.date}
                    role="cell"
                    class={`cday${day.practiced ? ' cday--on' : ''}${day.isToday ? ' cday--today' : ''}`}
                    aria-label={day.label}
                    title={day.label}
                  >
                    <span aria-hidden="true">{day.dayOfMonth}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div class="calendar__key" aria-hidden="true">
            <span class="cday cday--on cday--key" />
            <span>Practiced</span>
            <span class="cday cday--today cday--key" />
            <span>Today</span>
          </div>
        </div>
      </div>
    </section>
  )
}
