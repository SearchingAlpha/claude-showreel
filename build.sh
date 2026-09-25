#!/usr/bin/env bash
# Full pipeline: cue sheet → soundtrack → frames (motion-blurred) → H.264 master.
set -euo pipefail
cd "$(dirname "$0")"
FFMPEG="${FFMPEG:-$HOME/.local/lib/python3.9/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2}"
WORKERS="${WORKERS:-4}"

node render.mjs --events
python3 audio.py
if [[ "${SKIP_FRAMES:-0}" != 1 ]]; then
  rm -rf out/frames
  node render.mjs --frames --workers "$WORKERS"
fi
"$FFMPEG" -hide_banner -loglevel warning -y -framerate 60 -i out/frames/%05d.png -i out/reel.wav \
  -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -profile:v high -x264-params aq-mode=3 \
  -c:a aac -b:a 320k -movflags +faststart -shortest out/claude-showreel-2026.mp4
"$FFMPEG" -hide_banner -loglevel warning -y -i out/claude-showreel-2026.mp4 \
  -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -x264-params aq-mode=3 \
  -c:a aac -b:a 192k -movflags +faststart out/claude-showreel-2026-web.mp4
echo "→ out/claude-showreel-2026.mp4 (master)  out/claude-showreel-2026-web.mp4 (share)"
