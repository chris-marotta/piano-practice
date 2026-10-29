import { resultView, type RunOutcome } from './playRun'

interface Props {
  outcome: RunOutcome
  onAgain: () => void
}

/** The end of a Guided or Check run: clean or the issues, evenness with its interval strip, tempo, Go again. */
export function RunResult({ outcome, onAgain }: Props) {
  const v = resultView(outcome)
  return (
    <section class={`run-result${v.clean ? ' run-result--clean' : ''}`} aria-live="polite" aria-label="Run result">
      <div class="run-result__main">
        <p class="run-result__headline">{v.headline}</p>
        {v.lines.length > 0 && (
          <ul class="run-result__issues">
            {v.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
            {v.more && <li class="run-result__more">{v.more}</li>}
          </ul>
        )}
      </div>
      <div class="run-result__timing">
        <div class="run-result__stat">
          <span class="run-result__label">Evenness</span>
          <span class="run-result__value">{v.evenness}</span>
        </div>
        {v.bars.length > 0 && (
          <div class="run-result__bars" aria-hidden="true">
            {v.bars.map((h, i) => (
              <span key={i} class="run-result__bar" style={{ height: `${Math.max(8, h * 100)}%` }} />
            ))}
          </div>
        )}
        <div class="run-result__stat">
          <span class="run-result__label">Tempo</span>
          <span class="run-result__value">{v.tempo}</span>
        </div>
      </div>
      <button type="button" class="btn btn--primary btn--lg run-result__again" onClick={onAgain}>
        Go again
      </button>
    </section>
  )
}
