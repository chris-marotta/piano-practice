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
   once while online so the service worker can cache the app and piano samples; after
   that it works offline in landscape as a standalone app.

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
