# Piano Practice

A static web app for daily piano scale and chord practice. Spaced repetition (Leitner
boxes) picks which scales, chords, and theory recall cards come up each day, and a short
guided session walks through them with fingerings, an on-screen keyboard, a drone, and a
metronome. iPad-first (landscape 1180 x 820), laptop second; no backend, no accounts.
Progress is stored in the browser's `localStorage`.

## Features

- Placement: mark each of the 24 scales Solid, Shaky, or Don't know to seed the schedule.
- Today: a 5, 10, 15, or 20 minute session built from what is due, with a time estimate.
- Guided session: theory recall cards (key signature, spelling, relative key, thumb notes),
  scale steps (recall gate, four support levels from full keyboard to name only, Peek,
  rep checklist, Play, Nailed / Shaky / Lost), and chord steps (block or broken, inversions,
  voice-led cadence at higher levels).
- Progress: mastery grid (box and support level per scale), streak, minutes, 8-week calendar.
- Library: scales with fingering, chords, chords in a key, and a "What's this chord?" detector.
- Settings: minor forms (natural, harmonic, melodic), octaves, start tempo, drone and
  metronome, JSON export and import, redo placement.
- Installable PWA that works offline once cached (piano samples included).

Built with Preact, TypeScript, Vite, Tone.js, and tonal.

## Commands

```
npm i
npm run dev     # http://localhost:5230
npm test        # vitest (pure modules: theory, data, srs, session, store)
npm run build   # typecheck + production build to dist/
```

## Deploy (GitHub Pages)

The app is a static site; `.github/workflows/deploy.yml` tests, builds, and publishes
`dist/` to GitHub Pages on every push to `main`. Nothing is deployed until you push.

1. Create a GitHub repo (any name; the app uses relative URLs, so it works under
   `https://<user>.github.io/<repo>/`).
2. Add it as a remote and push `main`:
   `git remote add origin git@github.com:<user>/<repo>.git && git push -u origin main`
3. In the repo: Settings, Pages, Source: **GitHub Actions**. Re-run the workflow
   (Actions tab, "Deploy to GitHub Pages", Run workflow) if the first push ran before
   Pages was enabled.
4. On the iPad, open the Pages URL in Safari, then Share, Add to Home Screen. Launch it
   once from the home-screen icon while online so the service worker can cache the app
   and piano samples; after that it works offline in landscape as a standalone app.
   Do placement and all practice in the home-screen app, not in the Safari tab:
   anything done in Safari stays in Safari.
5. After a deploy, close the app (swipe it away in the app switcher) and reopen it to
   get the update.

Progress is stored per device (browser `localStorage`). The home-screen app and Safari
do not share it, and a new device starts empty. Use Settings, Your progress (Back up)
to back up or move it.

Icons: edit `assets-src/icon.svg` / `icon-maskable.svg`, then run `scripts/make-icons.sh`
(macOS Quick Look rasterizer; no dependencies) and commit the PNGs in `public/icons/`.

## Credits

Piano samples: Salamander Grand Piano by Alexander Holm, licensed CC-BY 3.0
(https://creativecommons.org/licenses/by/3.0/). Sourced from
https://tonejs.github.io/audio/salamander/ (17 samples, C2 to C6 in minor-third steps).
Re-fetch with `scripts/fetch-samples.sh`.
