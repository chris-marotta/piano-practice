# CLAUDE.md — Piano Practice

Static Preact + TypeScript app for daily piano scale practice (iPad-first, landscape 1180 x 820).
Notes, design docs, and session history live in the vault:
`~/Library/CloudStorage/Dropbox/MAROTTA-vault/Projects/Piano Practice/docs/summaries/HOME.md`

## Stack

Vite 8, Vitest 5, TypeScript 7, Preact 11 (+ @preact/signals), @tonaljs/tonal 4.10, Tone.js 15,
vite-plugin-pwa 2. State in `localStorage` under `piano-practice:v1`. No backend.
Dev server port 5230 (registered as `piano` in the vault `.claude/launch.json`).

## Commands

- `npm run dev` — dev server on 5230 (strict port)
- `npm test` — `vitest run`
- `npm run build` — `tsc --noEmit && vite build` (also generates the service worker)

## Rules

- **Pure modules.** `src/theory`, `src/data`, `src/srs`, `src/session`, `src/store` must not import Preact or Tone.js and must not touch `window`/`document`. The one exception is `store/storage.ts`, which takes an injected `Storage`.
- **Tonal only in theory.** Only `src/theory/*` imports `@tonaljs/tonal`.
- **Note spelling.** Internal names use tonal's ASCII (`F#`, `Bb`, `F##`). All UI text goes through `formatNote` (`♯ ♭ 𝄪 𝄫`).
- **Fingerings.** Never edit a fingering silently. Harmonic and melodic minor reuse the natural-minor fingering for the same root in v1 (ASSUMED, on the teacher checklist).
- **Hash routing is required.** Routes are `#/today`, `#/library`, etc., so the app works under a relative `base: './'` (any GitHub Pages subpath) with no server rewrites. Do not switch to path routing.
- **Push only when Chris says so.** No remote is configured; do not push or add one without his explicit go-ahead.
