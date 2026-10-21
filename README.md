# Piano Practice

A static web app for daily piano scale practice. Spaced repetition decides which
scales and chords come up each day; a short guided session walks through them with
fingerings, a keyboard, a drone, and a metronome. iPad-first (landscape 1180 x 820),
no backend, no accounts. Progress is stored in `localStorage`.

Built with Preact, TypeScript, Vite, and Tone.js.

## Commands

```
npm i
npm run dev     # http://localhost:5230
npm test        # vitest
npm run build   # typecheck + production build to dist/
```

## Credits

Piano samples: Salamander Grand Piano by Alexander Holm, licensed CC-BY 3.0
(https://creativecommons.org/licenses/by/3.0/). Sourced from
https://tonejs.github.io/audio/salamander/ (17 samples, C2 to C6 in minor-third steps).
Re-fetch with `scripts/fetch-samples.sh`.
