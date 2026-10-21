# CLAUDE.md — Piano Practice

Static Preact + TypeScript app for daily piano scale practice (iPad-first, landscape 1180 x 820).
Notes, design docs, and session history live in the vault:
`/Users/chrismarotta/Library/CloudStorage/Dropbox/MAROTTA-vault/Projects/Piano Practice/docs/summaries/HOME.md`

## Stack

Preact, @preact/signals, TypeScript, Vite, Vitest, Tone.js, @tonaljs/tonal, vite-plugin-pwa.
State in `localStorage` under `piano-practice:v1`. No backend. Dev server port 5230.

## Commands

- `npm run dev` — dev server on 5230 (strict port)
- `npm test` — `vitest run`
- `npm run build` — `tsc --noEmit && vite build`

## Rules

- **Pure modules.** `src/theory`, `src/data`, `src/srs`, `src/session`, `src/store` must not import Preact or Tone.js and must not touch `window`/`document`. The one exception is `store/storage.ts`, which takes an injected `Storage`.
- **Tonal only in theory.** Only `src/theory/*` imports `@tonaljs/tonal`.
- **Note spelling.** Internal names use tonal's ASCII (`F#`, `Bb`, `F##`). All UI text goes through `formatNote` (`♯ ♭ 𝄪 𝄫`).
- **Fingerings.** Harmonic and melodic minor reuse the natural-minor fingering for the same root in v1 (ASSUMED, on the teacher checklist). Never edit a fingering silently.
- Do not push or add a git remote without Chris's explicit go-ahead.
