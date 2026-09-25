# CLAUDE — Showreel 2026

A 15-second motion-design reel, 1920×1080 at 60 fps with a stereo soundtrack. It is built entirely from code: no keyframes, footage, samples or stock assets.

**Output:** `out/claude-showreel-2026.mp4`

## How it works

| Piece | What it does |
|---|---|
| `reel.html` + `reel.js` | The composition. `seek(t)` paints the whole stage (DOM type, Canvas 2D, two WebGL shaders) as a pure function of time. |
| `render.mjs` | Drives headless Chromium frame by frame. For each output frame it averages 4–14 subframes over a 180° shutter, so the motion blur is real (ffmpeg `tmix`). |
| `audio.py` | A numpy/scipy synth at 120 BPM in F minor. Sound effects are read from `out/events.json`, the cue sheet that `reel.js` exports, so every tick and whoosh lands on its frame. |
| `build.sh` | Runs the whole pipeline: cue sheet → WAV → frames → H.264. |

## Structure (one bar = 2 s)

| Time | Chapter | What's on screen |
|---|---|---|
| 0–1 s | 00 Intro | A dot becomes a line, then folds into the starburst mark, which explodes into a wipe |
| 1–3 s | 01 Type | Variable-font "TYPE", marquee rows showing the type specimen, "Aa." metric lines, Figma-style selection box |
| 3–5 s | 02 Motion | Bézier graph editor, spacing chart, an easing library; everything converges into one ball |
| 5–7 s | 03 Form | Raymarched chrome: sphere → metaballs → twisted box → 3D starburst → fly-through |
| 7–9 s | 04 Color | Domain-warped fluid, a swatch fan whose cards fly into the next grid |
| 9–11 s | 05 Systems | 12-column bento grid of live UI components, a layout reshuffle, zoom into a tile |
| 11–13 s | 06 Range | Push-cut montage (brand / interface / editorial / 3D), then a 3D word drum that lands on the name |
| 13–15 s | 07 Hello | End card; everything collapses back into the dot |

## Commands

```bash
./build.sh                              # full build (~17 min, 4 workers)
SKIP_FRAMES=1 ./build.sh                # re-encode with new audio, keep frames
node render.mjs --stills 5.5,9.6        # quick PNG stills → out/stills/
open reel.html (via any static server)  # live preview; space = pause, ←/→ = step
```

Fonts: Archivo (variable wdth/wght), Instrument Serif, JetBrains Mono, all under the OFL, in `fonts/`.
