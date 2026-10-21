#!/usr/bin/env bash
# Rasterize assets-src/icon*.svg into public/icons/*.png using macOS Quick Look (qlmanage).
# No dependencies to install. Re-run after editing the SVGs and commit the PNGs.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p public/icons

render() { # <svg> <size> <out.png>
  qlmanage -t -s "$2" -o "$tmp" "$1" >/dev/null 2>&1
  mv "$tmp/$(basename "$1").png" "$3"
}

render assets-src/icon.svg 192 public/icons/icon-192.png
render assets-src/icon.svg 512 public/icons/icon-512.png
render assets-src/icon.svg 180 public/icons/apple-touch-icon.png
render assets-src/icon-maskable.svg 512 public/icons/icon-maskable-512.png
echo "Icons written to public/icons/"
