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

- **Pure modules.** `src/theory`, `src/data`, `src/srs`, `src/session`, `src/store`, `src/play`, plus `src/midi/parse.ts` and `src/midi/held.ts`, must not import Preact or Tone.js and must not touch `window`/`navigator`/`document`. The one exception is `store/storage.ts`, which takes an injected `Storage`.
- **Tonal only in theory.** Only `src/theory/*` imports `@tonaljs/tonal`.
- **Note spelling.** Internal names use tonal's ASCII (`F#`, `Bb`, `F##`). All UI text goes through `formatNote` (`♯ ♭ 𝄪 𝄫`).
- **Fingerings.** Never edit a fingering silently. Harmonic and melodic minor reuse the natural-minor fingering for the same root in v1 (ASSUMED, on the teacher checklist).
- **Hash routing is required.** Routes are `#/today`, `#/library`, etc., so the app works under a relative `base: './'` (any GitHub Pages subpath) with no server rewrites. Do not switch to path routing.
- **Push only when Chris says so.** No remote is configured; do not push or add one without his explicit go-ahead.
- **MIDI stays behind `src/midi/input.ts`.** Only `src/midi/access.ts` touches `navigator.requestMIDIAccess`; it parses to `MidiEvent`s and emits them on the shared stream in `input.ts` (`onKeyboard`, `onClear`, `heldNotes`). Everything downstream sees `MidiEvent`s only. Event timestamps are ms in the `performance.now()` timebase; all other MIDI messages are dropped.
- **Play thresholds are ASSUMED.** All run/evenness/suggestion constants live in `src/play/thresholds.ts`; tune on the Roli, don't scatter new magic numbers.

## Phase 2 modules (MIDI + Play)

- `src/midi/` — `parse.ts` (bytes to `MidiEvent`), `held.ts` (held + pedal reducer), `access.ts` (Web MIDI connect, `midiStatus` signal), `input.ts` (event stream).
- `src/play/` — pure analysis: `guide.ts` (Guided note-by-note state), `runDetect.ts` (Check run detection, octave offset), `analyse.ts` (evenness, tempo), `suggest.ts` (rating suggestion), `sequence.ts`, `thresholds.ts`.
- `src/audio/live.ts` — live sampler voices for keyboard notes (`unlock.ts` gates all audio on a user gesture).
- `src/ui/screens/play/` — Play tab (`Play.tsx`, `PlayPicker`, `RunResult`, `usePlayRun`, pure `playView.ts`/`playState.ts`/`playRun.ts`). Session auto-check lives in `src/ui/screens/steps/` (`autoCheck.ts`, `useAutoCheck.ts`); `src/ui/components/MidiChip.tsx` is the connect/status chip.
- Settings added: `midiEnabled` (default false), `keyboardSound` (default true).

## Dev hooks (DEV builds only, stripped from `dist/`)

No MIDI hardware in the preview browser. In `npm run dev`, from the console or a browser tool:
- `window.__keyboard.inject([{ type: 'on'|'off'|'pedal', midi, velocity?, down?, t? }])` — push events into the shared stream (`t` defaults to now + 10 ms per event).
- `window.__keyboard.fakeConnected()` — set the status to connected ("Dev keyboard") so session auto-check and "Reset keys" show. It is lost on reload.
- `#/dev-keyboard` — scratch page for the `<Keyboard>` component.
