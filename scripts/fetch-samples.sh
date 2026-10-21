#!/usr/bin/env bash
# Fetch the 17 Salamander Grand Piano samples used by the app.
# Salamander Grand Piano by Alexander Holm, CC-BY 3.0.
# Source: https://tonejs.github.io/audio/salamander/
set -euo pipefail

BASE="https://tonejs.github.io/audio/salamander"
DEST="$(cd "$(dirname "$0")/.." && pwd)/public/samples/salamander"
NOTES="C2 Ds2 Fs2 A2 C3 Ds3 Fs3 A3 C4 Ds4 Fs4 A4 C5 Ds5 Fs5 A5 C6"

mkdir -p "$DEST"
for n in $NOTES; do
  echo "fetching $n.mp3"
  curl -fsSL "$BASE/$n.mp3" -o "$DEST/$n.mp3"
done
echo "done: $(ls "$DEST" | wc -l | tr -d ' ') files"
