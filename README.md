# Piano Practice

A static web app for daily piano scale and chord practice. Spaced repetition (Leitner
boxes) picks which scales, chords, and theory recall cards come up each day, and a short
guided session walks through them with fingerings, an on-screen keyboard, a drone, and a
metronome. iPad-first (landscape 1180 x 820), laptop second; no backend, no accounts.
Progress is stored in the browser's `localStorage`.

## Features

- Placement: mark each of the 24 scales Solid, Shaky, or Don't know to seed the schedule.
- Today: a 5, 10, 15, or 20 minute session built from what is due, with a time estimate.
- Guided session, in this order:
  - Name that key: a short drill on the 12 piano keys. Without a keyboard, questions alternate "Which key
    is this?" (pick the name) and "Tap {name}" (tap the key); with a MIDI keyboard connected, every
    question is "Play {name} on your piano". Four levels unlock as keys reach box 3: Landmarks (C and F),
    White keys (D E G A B), Black keys (sharp and flat names), and Speed (3 seconds a key). Levels stay
    unlocked once reached. In a session each key is graded on its first answer of the day; a miss
    comes back once at the end of the round as practice. After each answer the
    keyboard lights the route from the nearest landmark, with a "Why:" line.
  - Warm-up deck: today's theory recall cards (key signature, spelling, relative key, thumb notes) as one
    flip deck. Say the answer, tap to flip, and the back shows the answer, a "why" picture (circle of
    fifths, keyboard, sharps and flats) and a "Why:" line; rate each card Got it or Missed.
  - Scale steps: recall gate, four support levels (L0 one keyboard per hand, LH left and RH right;
    L1 finger rows in the same columns; L2 key signature; L3 name only), Peek, rep tiles, Play,
    Nailed / Shaky / Lost. Melodic minor shows its way up and way down.
  - Chord steps: block or broken, inversions, voice-led cadence at higher levels.
- Play tab: a free-play keyboard with a scale or chord target. Free shows right and wrong notes
  and names the chord you hold; Guided walks you note by note with hand colours and fingering;
  Check is a from-memory run that reports slips in plain language, evenness, and tempo; Keys is the
  name-that-key drill on its own, one round at a time ("Next round"). A Labels switch shows key names,
  scale degrees, or nothing (Off · Names · Degrees), and the scale's root keys carry a blue dot.
- Keyboard input (Chrome on a computer): after connecting a MIDI keyboard once in Settings, the
  app plays its notes live, marks the on-screen keys, and auto-checks scale reps and chords in a
  session (suggesting a rating; you still tap it).
- Progress: mastery grid (box and support level per scale), a Keys row (box per piano key and the drill
  level), streak, minutes, 8-week calendar.
- Library: scales with fingering, chords, chords in a key, a "What's this chord?" detector, and a
  circle of fifths: tap a key on the wheel to see its key signature, relative minor and scale, then
  **Open in Library** (its scale page) or **Play it** (Play tab with that scale).
- Settings: minor forms (natural, harmonic, melodic), start tempo, drone and metronome, MIDI
  keyboard connect and keyboard sound, JSON export and import, redo placement. Sessions are always one
  octave; the octaves setting is gone (an old saved `octaves` value is ignored).
- Installable PWA that works offline once cached (piano samples included).

Built with Preact, TypeScript, Vite, Tone.js, and tonal.

## MIDI keyboard

Web MIDI input works in Chrome on a computer (it is not available on iPad Safari, so the iPad
runs the app without a keyboard and everything else works as before).

1. Plug the Roli Piano into the Mac with USB (it shows up as a MIDI input named "ROLI...").
2. Open the app in Chrome, go to Settings, Keyboard, and press **Connect keyboard**. Allow MIDI
   when Chrome asks. The connection is remembered and re-attempted on the next launch.
3. Tap or click the page once. Browsers keep audio off until a gesture, so the keyboard stays
   silent (the screen says "Tap anywhere to turn on sound") until you do.
4. Open the **Play** tab, or start a session. In a scale step the rep tiles fill in order: the
   current tile (outlined in its hand colour) decides which hand a run counts for, and the other
   hand's keyboard dims. Tap another empty tile to play that one next, or tap the current tile to tick
   it by hand. A run in the wrong shape (both hands on a one-hand tile, or one hand on a Together
   tile) ticks nothing and shows a short note under the tiles. Chord steps tick a chord once you hold
   it. The drill asks you to play each key on the keyboard ("● Listening: {device}").

Settings, Keyboard sound turns the app's live piano off (for example when another app already
plays the keyboard). Thresholds for run detection and the drill's time limits live in
`src/play/thresholds.ts` and are guesses until tuned on the real keyboard.

## Commands

```
npm i
npm run dev     # http://localhost:5230
npm test        # vitest (pure modules: theory, data, srs, session, store, midi, play, drill)
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
