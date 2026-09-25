"""Soundtrack for the reel: 120 BPM in F minor, synthesised from scratch.
Music is scored here; sound effects come from out/events.json (the cue sheet reel.js exports),
so every whoosh and tick lands on the frame that caused it.  →  out/reel.wav
"""
import json
import numpy as np
from scipy import signal

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
T = np.arange(N) / SR

dry = np.zeros((2, N))
wet = np.zeros((2, N))          # reverb send
duck_src = []                   # kick times for sidechain


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t0, gain=1.0, pan=0.0, send=0.0, duck=False, bus=None):
    """Mix a mono signal at t0 with equal-power pan."""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    s = sig * gain
    if i0 < 0:
        s = s[-i0:]
        i0 = 0
    s = s[: N - i0]
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    L, R = np.cos(a) * s, np.sin(a) * s
    tgt = bus if bus is not None else (duckbus if duck else dry)
    tgt[0, i0:i0 + len(s)] += L
    tgt[1, i0:i0 + len(s)] += R
    if send:
        wet[0, i0:i0 + len(s)] += L * send
        wet[1, i0:i0 + len(s)] += R * send


duckbus = np.zeros((2, N))      # sidechained against the kick


def tt(d):
    return np.arange(int(d * SR)) / SR


def sos(kind, f, order=2, q=None):
    if kind == 'bp':
        lo, hi = f
        return signal.butter(order, [lo, hi], btype='bandpass', fs=SR, output='sos')
    return signal.butter(order, f, btype={'lp': 'lowpass', 'hp': 'highpass'}[kind], fs=SR, output='sos')


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def sweep(x, fc, kind='lp', q=0.9, block=128):
    """Time-varying biquad (RBJ), fc = per-sample cutoff array."""
    y = np.zeros_like(x)
    z = np.zeros(2)
    for i in range(0, len(x), block):
        f = float(np.clip(fc[min(i + block // 2, len(fc) - 1)], 30, SR * 0.45))
        w = 2 * np.pi * f / SR
        al = np.sin(w) / (2 * q)
        c = np.cos(w)
        if kind == 'lp':
            b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2])
        elif kind == 'hp':
            b = np.array([(1 + c) / 2, -(1 + c), (1 + c) / 2])
        else:  # band-pass, constant peak gain
            b = np.array([al, 0, -al])
        a = np.array([1 + al, -2 * c, 1 - al])
        y[i:i + block], z = signal.lfilter(b / a[0], a / a[0], x[i:i + block], zi=z)
    return y


def saw(freq, d, detune=0.0, phase=None):
    """PolyBLEP saw; freq may be scalar or per-sample array."""
    n = int(d * SR)
    f = np.full(n, freq) if np.isscalar(freq) else freq[:n]
    f = f * 2 ** (detune / 1200)
    dt = f / SR
    ph = (np.cumsum(dt) + (rng.random() if phase is None else phase)) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    x = ph[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = ph > 1 - dt
    x = (ph[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def sine(freq, d, phase=0.0):
    n = int(d * SR)
    f = np.full(n, freq) if np.isscalar(freq) else freq[:n]
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def env_exp(d, tau, attack=0.002):
    t = tt(d)
    e = np.exp(-t / tau)
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    return e * a


def adsr(d, a, dcy, s, r):
    t = tt(d + r)
    e = np.where(t < a, t / a, np.where(t < a + dcy, 1 - (1 - s) * (t - a) / dcy, s))
    rel = t > d
    e[rel] = s * np.clip(1 - (t[rel] - d) / r, 0, 1)
    return e


def noise(d):
    return rng.standard_normal(int(d * SR))


# ─────────────────────────── instruments ───────────────────────────
def kick(gain=1.0, t0=0.0, long=False):
    d = 0.9 if long else 0.42
    t = tt(d)
    f = 44 + 120 * np.exp(-t * 38) + 30 * np.exp(-t * 9)
    body = sine(f, d) * np.exp(-t / (0.32 if long else 0.13))
    click = filt(noise(0.006), 'bp', (1500, 6000)) * np.linspace(1, 0, int(0.006 * SR)) * 0.4
    s = np.tanh(body * 1.6) * 0.9
    s[: len(click)] += click
    place(s, t0, gain, 0, send=0.03)
    duck_src.append(t0)


def clap(t0, gain=1.0, pan=0.0):
    d = 0.3
    n = filt(noise(d), 'bp', (900, 3200), 2)
    t = tt(d)
    e = np.zeros_like(t)
    for k, o in enumerate([0, .009, .019, .028]):
        e += (t >= o) * np.exp(-np.clip(t - o, 0, None) / (0.006 if k < 3 else 0.075)) * (0.8 if k < 3 else 1.0)
    place(n * e * 0.5, t0, gain, pan, send=0.22)


def hat(t0, gain=1.0, open_=False, pan=0.15):
    d = 0.3 if open_ else 0.06
    n = filt(noise(d), 'hp', 7500, 2)
    place(n * env_exp(d, 0.09 if open_ else 0.014) * 0.35, t0, gain, pan, send=0.05)


def snare(t0, gain=1.0, pan=0.0):
    d = 0.22
    t = tt(d)
    tone = sine(190 * (1 + 0.4 * np.exp(-t * 60)), d) * np.exp(-t / 0.05) * 0.5
    n = filt(noise(d), 'bp', (1200, 7000)) * np.exp(-t / 0.07) * 0.6
    place(tone + n, t0, gain, pan, send=0.12)


def crash(t0, gain=1.0, d=1.8):
    t = tt(d)
    n = filt(noise(d), 'hp', 4200, 2) * np.exp(-t / 0.55)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t + rng.random() * 6)) for f in [3112, 4317, 5521, 6802]) * 0.04 * np.exp(-t / 0.3)
    s = filt(n + metal, 'lp', 12000) * 0.3
    place(s, t0, gain, -0.25, send=0.3)
    place(filt(noise(d), 'hp', 4200, 2) * np.exp(-t / 0.55) * 0.3, t0, gain * 0.9, 0.25, send=0.3)


def sub_boom(t0, gain=1.0, d=1.4):
    t = tt(d)
    f = 43.65 + 60 * np.exp(-t * 7)
    s = np.tanh(sine(f, d) * 1.4) * np.exp(-t / (d * 0.38))
    place(s, t0, gain, 0, send=0.05)


def pluck(t0, m, d=0.22, gain=1.0, pan=0.0, bright=1.0, send=0.18):
    f = midi(m)
    x = saw(f, d, -6) * 0.5 + saw(f, d, 6) * 0.5
    t = tt(d)
    e = np.exp(-t / 0.075) * np.clip(t / 0.002, 0, 1)
    fc = 350 + bright * 5200 * np.exp(-t / 0.045)
    y = sweep(x, fc, 'lp', 0.8) * e
    place(y * 0.32, t0, gain, pan, send=send, duck=True)


def bass_note(t0, m, d=0.2, gain=1.0):
    f = midi(m)
    x = saw(f, d + 0.04) * 0.7 + np.sign(sine(f, d + 0.04)) * 0.25 + sine(f / 2, d + 0.04) * 0.5
    t = tt(d + 0.04)
    e = np.clip(t / 0.003, 0, 1) * np.where(t < d, np.exp(-t / 0.5), np.exp(-d / 0.5) * np.clip(1 - (t - d) / 0.04, 0, 1))
    fc = 180 + 900 * np.exp(-t / 0.06)
    y = sweep(x, fc, 'lp', 0.9) * e
    place(np.tanh(y * 1.5) * 0.42, t0, gain, 0, send=0.0, duck=True)


def pad(t0, notes, d, gain=1.0, cutoff=1400, send=0.35, attack=0.35):
    x = np.zeros(int((d + 0.6) * SR))
    for m in notes:
        for dt_, pn in [(-9, -.4), (0, 0), (8, .4)]:
            x += saw(midi(m), d + 0.6, dt_) / (3 * len(notes)) ** 0.5
    e = adsr(d, attack, 0.3, 0.8, 0.6)[: len(x)]
    y = filt(x, 'lp', cutoff, 2) * e[: len(x)]
    place(y * 0.22, t0, gain, -0.2, send=send, duck=True)
    place(np.roll(y, 480) * 0.22, t0, gain, 0.2, send=send, duck=True)


# ─────────────────────────── sfx from the cue sheet ───────────────────────────
def sfx(e):
    t0, ty, g, pan = e['t'], e['type'], e.get('gain', 1.0), e.get('pan', 0.0)
    if ty == 'pop':
        f = e.get('f', 800); d = 0.14; t = tt(d)
        s = sine(f * (0.55 + 0.9 * np.exp(-t * 60)), d) * np.exp(-t / 0.045)
        place(s * 0.5, t0, g, pan, send=0.2)
    elif ty == 'tick':
        f = e.get('f', 2000); d = 0.05; t = tt(d)
        s = sine(f, d) * np.exp(-t / 0.008) + filt(noise(d), 'hp', 5000) * np.exp(-t / 0.002) * 0.3
        place(s * 0.35, t0, g, pan, send=0.15)
    elif ty == 'blip':
        f = e.get('f', 1500); d = 0.2; t = tt(d)
        s = (sine(f, d) + 0.3 * sine(f * 2, d)) * np.exp(-t / 0.05)
        place(s * 0.3, t0, g, pan, send=0.35)
    elif ty == 'click':
        d = 0.04; t = tt(d)
        s = filt(noise(d), 'bp', (2000, 7000)) * np.exp(-t / 0.003) * 0.6 + sine(3200, d) * np.exp(-t / 0.006) * 0.25
        place(s * 0.5, t0, g, pan, send=0.1)
    elif ty == 'flick':
        d = 0.05; t = tt(d)
        s = filt(noise(d), 'bp', (1800, 6500)) * np.exp(-t / 0.01)
        place(s * 0.3, t0, g, pan, send=0.12)
    elif ty == 'ratchet':
        d = 0.02; t = tt(d)
        s = filt(noise(d), 'bp', (2500, 9000)) * np.exp(-t / 0.0025) + sine(1900, d) * np.exp(-t / 0.004) * 0.3
        place(s * 0.45, t0, g, 0.1, send=0.08)
    elif ty in ('whoosh', 'swoosh'):
        d = e.get('dur', 0.3); t = tt(d); x = t / d
        rev = e.get('rev')
        env = x ** 3 if rev else np.sin(np.pi * x) ** 2
        lo, hi = (250, 3800) if ty == 'whoosh' else (700, 6500)
        fc = lo * (hi / lo) ** (x if rev else np.sin(np.pi * x))
        start = t0 - (d * 0.5 if ty == 'whoosh' and not rev else 0)
        for sgn in (1, -1):
            n = sweep(noise(d), fc, 'bp', 1.3) * env
            place(n * 0.55, start, g, pan + sgn * 0.3, send=0.2)
    elif ty == 'riser':
        d = e.get('dur', 0.6); t = tt(d); x = t / d
        fc = 400 * (9000 / 400) ** x
        n = sweep(noise(d), fc, 'bp', 2.0) * (x ** 2.2)
        tone = saw(160 * 4 ** x, d) * 0.12 * x ** 3
        tone = filt(tone, 'lp', 3000)
        place((n * 0.7 + tone), t0, g * 0.55, -0.15, send=0.35)
        place((n * 0.7 + tone), t0 + 0.007, g * 0.55, 0.15, send=0.35)
    elif ty == 'impact':
        big = e.get('big'); soft = e.get('soft')
        kick(g * (1.0 if not soft else 0.8), t0, long=bool(big))
        sub_boom(t0, g * (0.9 if big else 0.55), d=1.9 if big else 1.0)
        d = 0.5; t = tt(d)
        place(filt(noise(d), 'lp', 2500) * np.exp(-t / 0.08) * 0.35, t0, g, 0, send=0.4)
        if not soft:
            crash(t0, g * (0.85 if big else 0.6), d=2.2 if big else 1.4)
    elif ty == 'hit':
        d = 0.25; t = tt(d)
        s = filt(noise(d), 'bp', (600, 5000)) * np.exp(-t / 0.05) * 0.4 + sine(110 * (1 + np.exp(-t * 40)), d) * np.exp(-t / 0.07) * 0.6
        place(s * 0.6, t0, g, pan, send=0.25)
    elif ty == 'thud':
        d = 0.25; t = tt(d)
        place(sine(55 + 60 * np.exp(-t * 30), d) * np.exp(-t / 0.07) * 0.8, t0, g, pan, send=0.05)
    elif ty == 'boing':
        d = 0.35; t = tt(d)
        f = 330 * (1 + 0.25 * np.sin(2 * np.pi * 11 * t) * np.exp(-t * 7)) * (1 - 0.3 * t)
        place(sine(f, d) * np.exp(-t / 0.1) * 0.35, t0, g, pan, send=0.2)
    elif ty == 'zip':
        d = e.get('dur', 0.2); t = tt(d); x = t / d
        f = 2400 * (0.18 ** x) if e.get('down') else 420 * (6 ** x)
        s = (sine(f, d) * 0.5 + 0.25 * np.sign(sine(f, d))) * np.sin(np.pi * x) ** 1.5
        place(filt(s, 'lp', 5000) * 0.28, t0, g, pan, send=0.25)
    elif ty == 'sub':
        d = 1.2; t = tt(d)
        place(np.tanh(sine(40 + 50 * np.exp(-t * 9), d) * 1.3) * np.exp(-t / 0.4) * 0.9, t0, g, 0, send=0.02)
        place(filt(noise(0.4), 'lp', 600) * np.exp(-tt(0.4) / 0.1) * 0.3, t0, g, 0, send=0.3)
    elif ty == 'bloop':
        d = 0.18; t = tt(d)
        f = 170 + 480 * (t / d) ** 0.6
        place(sine(f, d) * np.exp(-t / 0.06) * 0.45, t0, g, -0.2, send=0.3)
        place(sine(f * 1.5, d) * np.exp(-t / 0.05) * 0.25, t0 + 0.05, g, 0.25, send=0.3)
    elif ty == 'bell':
        f = e.get('f', 880); d = 1.6; t = tt(d)
        mod = sine(f * 1.4, d) * 3.2 * np.exp(-t / 0.35)
        s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t / 0.5) + 0.3 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t / 0.2)
        place(s * 0.18, t0, g, pan - 0.2, send=0.5)
    elif ty == 'shimmer':
        for k, m in enumerate([77, 80, 84, 87, 89, 92, 96]):
            d = 0.5; t = tt(d)
            place(sine(midi(m), d) * np.exp(-t / 0.18) * 0.1, t0 + k * 0.035, g, (k - 3) / 4, send=0.6)


# ─────────────────────────── score ───────────────────────────
BEAT = 0.5
# (start, root midi, chord tones midi)
CHORDS = [
    (1.0, 41, [53, 56, 60, 63, 67]),   # Fm9
    (3.0, 37, [49, 53, 56, 60, 63]),   # Dbmaj7(9)
    (5.0, 32, [51, 55, 56, 60, 63]),   # Abmaj7
    (7.0, 39, [51, 55, 58, 62, 65]),   # Eb6/9
    (9.0, 41, [53, 56, 60, 63, 67]),   # Fm9
    (11.0, 37, [49, 53, 56, 60, 65]),  # Db
    (12.0, 39, [51, 55, 58, 63, 67]),  # Eb (build)
    (13.0, 29, [53, 56, 60, 63, 67, 72]),  # Fm9 — landing
]


def chord_at(t):
    c = CHORDS[0]
    for ch in CHORDS:
        if t >= ch[0]:
            c = ch
    return c


# intro pad + drone
pad(0.15, [53, 56, 60, 63], 0.95, gain=0.55, cutoff=700, attack=0.5)

# groove 1.0 → 11.0
for k in range(20):
    t0 = 1.0 + k * BEAT
    kick(0.95, t0)
    if k % 2 == 1:
        clap(t0, 0.75 if not (5.0 <= t0 < 7.0) else 0.5)
    hat(t0 + 0.25, 0.8)
    for s16 in (0.125, 0.375):
        if t0 >= 3.0 and not (5.0 <= t0 < 7.0):
            hat(t0 + s16, 0.28, pan=-0.2)
    if 9.0 <= t0 < 11.0:
        hat(t0 + 0.375, 0.45, open_=(k % 4 == 3))
# range 11 → 12: kick every beat, snare on the pushes
for t0 in (11.0, 11.5):
    kick(1.0, t0)
for t0 in (11.25, 11.5, 11.75):
    snare(t0, 0.55)
hat(11.25, 0.7); hat(11.75, 0.7)
# build 12 → 12.875: snare roll 8ths → 16ths → 32nds, then a breath of silence before the drop
roll = [12.0 + i * 0.25 for i in range(2)] + [12.5 + i * 0.125 for i in range(2)] + [12.75 + i * 0.0625 for i in range(2)] + [12.875 - 0.03125]
for i, t0 in enumerate(roll):
    snare(t0, 0.28 + 0.07 * i, pan=0.1 * (-1) ** i)

# bass: 8ths
for k in range(40):
    t0 = 1.0 + k * 0.25
    root = chord_at(t0)[1]
    step = k % 8
    m = root + (12 if step in (2, 5) else 0)
    if 5.0 <= t0 < 7.0 and step % 2:
        continue
    bass_note(t0, m, d=0.19, gain=0.9)
for k in range(4):
    bass_note(11.0 + k * 0.25, 37 + (12 if k % 2 else 0), d=0.19, gain=0.9)

# arp: 16ths on chord tones
PAT = [0, 2, 4, 2, 1, 3, 4, 3]
for k in range(int((12.875 - 1.0) / 0.125)):
    t0 = 1.0 + k * 0.125
    ch = chord_at(t0)[2]
    if 5.0 <= t0 < 7.0 and k % 2:
        continue
    oct_ = 12 if (7.0 <= t0 < 9.0 or t0 >= 12.0) else 0
    bright = 0.35 + 0.65 * min(1, (t0 - 1.0) / 4) if t0 < 12 else 0.6 + 0.4 * (t0 - 12)
    g = 0.55 if t0 < 12 else 0.55 + 0.35 * (t0 - 12)
    pluck(t0, ch[PAT[k % 8] % len(ch)] + oct_, gain=g * (0.75 if k % 2 else 1.0), pan=0.28 * (-1) ** k, bright=bright)

# pads per section
for (a, root, ch), b in zip(CHORDS[:-1], [c[0] for c in CHORDS[1:]]):
    pad(a, ch[:4], b - a, gain=0.6 if a < 12 else 0.75, cutoff=1100 if a != 7.0 else 1600, attack=0.12)

# landing 13.0: Fm9 stab + long pad + slow arp tail
pad(13.0, [41, 53, 56, 60, 63, 67], 1.55, gain=1.1, cutoff=2400, send=0.5, attack=0.01)
for k, m in enumerate([65, 68, 72, 75, 79, 80, 84, 87]):
    pluck(13.0 + k * 0.125, m, gain=0.5 * (1 - k / 10), pan=0.3 * (-1) ** k, bright=0.7, send=0.45)
bass_note(13.0, 29, d=1.3, gain=0.9)
bass_note(13.0, 41, d=1.3, gain=0.5)

# cue sheet from the visuals
for e in json.load(open('out/events.json')):
    sfx(e)

# ─────────────────────────── mix ───────────────────────────
# sidechain the tonal bus against the kicks
env = np.ones(N)
for k0 in duck_src:
    i0 = int(k0 * SR)
    L = int(0.35 * SR)
    if i0 >= N:
        continue
    seg = 1 - 0.62 * np.exp(-np.arange(min(L, N - i0)) / (0.075 * SR)) * np.clip(np.arange(min(L, N - i0)) / (0.004 * SR), 0, 1)
    env[i0:i0 + len(seg)] = np.minimum(env[i0:i0 + len(seg)], seg)
dry += duckbus * env

# reverb: synthetic stereo plate
ir_len = int(2.4 * SR)
ti = np.arange(ir_len) / SR
irs = []
for ch in range(2):
    n = rng.standard_normal(ir_len) * np.exp(-ti / 0.42)
    n = filt(filt(n, 'lp', 6500), 'hp', 220)
    n[: int(0.018 * SR)] = 0
    irs.append(n / np.sqrt(np.sum(n ** 2)))
rev = np.stack([signal.fftconvolve(wet[c], irs[c])[:N] for c in range(2)])
mix = dry + rev * 0.9

# master: clean lows, gentle glue, peak-normalise, tail fade
mix = np.stack([filt(mix[c], 'hp', 28) for c in range(2)])
mix /= np.max(np.abs(mix)) + 1e-9
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
fade = np.clip((DUR - T) / 0.12, 0, 1) ** 1.5
mix *= fade
mix *= 10 ** (-1.0 / 20) / np.max(np.abs(mix))
rms = 20 * np.log10(np.sqrt(np.mean(mix ** 2)) + 1e-12)
print(f'peak -1.0 dBFS  rms {rms:.1f} dBFS  kicks {len(duck_src)}')

from scipy.io import wavfile
wavfile.write('out/reel.wav', SR, (mix.T * 32767).astype(np.int16))
print('wrote out/reel.wav')
