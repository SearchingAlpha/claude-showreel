// Deterministic renderer: drives reel.html's seek(t) in headless Chromium.
//   node render.mjs --stills 1.0,2.3        → out/stills/t_1.000.png (no motion blur)
//   node render.mjs --events                → out/events.json (sound cue sheet)
//   node render.mjs --frames [a:b] [--workers 4]  → out/frames/%05d.png with sub-frame motion blur
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'out');
const FFMPEG = process.env.FFMPEG || path.join(os.homedir(), '.local/lib/python3.9/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2');
const CHROME = process.env.CHROME || path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell');
const FPS = 60, DUR = 15, SHUTTER = 0.5; // 180° shutter

// sub-frames per frame: more where things move fast
const K_RANGES = [
  [0.98, 1.36, 8], [1.44, 1.8, 32], [1.8, 1.92, 12], [2.84, 3.06, 8], [3.98, 4.44, 10], [4.44, 4.82, 8], [7.0, 7.52, 10], [6.68, 7.06, 12], [8.48, 9.02, 8],
  [9.98, 10.46, 6], [10.5, 11.02, 12], [11.2, 12.2, 12], [12.2, 13.12, 14], [14.44, 15.0, 6],
];
const kAt = t => { for (const [a, b, k] of K_RANGES) if (t >= a && t < b) return k; return 4; };

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };

function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function openPage(port) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/reel.html?render`);
  await page.evaluate(() => window.READY);
  const cdp = await page.context().newCDPSession(page);
  const shot = async t => {
    await page.evaluate(t => window.seek(t), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };
  return { browser, page, shot };
}

async function stills(port, times) {
  const dir = path.join(OUT, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const { browser, shot } = await openPage(port);
  for (const t of times) {
    const t0 = Date.now();
    fs.writeFileSync(path.join(dir, `t_${t.toFixed(3)}.png`), await shot(t));
    console.log(`still ${t.toFixed(3)}s  ${Date.now() - t0}ms`);
  }
  await browser.close();
}

// one chunk = consecutive frames sharing K; ffmpeg averages each group of K sub-frames
async function renderChunk(ctx, { f0, f1, k }) {
  const dir = path.join(OUT, 'frames');
  const ff = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(FPS * k), '-i', '-',
    '-vf', `tmix=frames=${k},select='not(mod(n+1\\,${k}))'`, '-fps_mode', 'passthrough', '-start_number', String(f0), path.join(dir, '%05d.png')],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  for (let f = f0; f < f1; f++) {
    for (let s = 0; s < k; s++) {
      const t = (f + (s + 0.5) / k * SHUTTER - SHUTTER / 2) / FPS;
      const buf = await ctx.shot(Math.max(0, Math.min(DUR - 1e-4, t)));
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
  }
  ff.stdin.end();
  await done;
}

async function frames(port, a, b, workers) {
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  const chunks = [];
  let f = a;
  while (f < b) {
    const k = kAt(f / FPS); let e = f + 1;
    while (e < b && kAt(e / FPS) === k && e - f < 24) e++;
    chunks.push({ f0: f, f1: e, k }); f = e;
  }
  chunks.sort((x, y) => (y.f1 - y.f0) * y.k - (x.f1 - x.f0) * x.k);
  const total = chunks.reduce((s, c) => s + (c.f1 - c.f0), 0);
  let doneFrames = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async () => {
    const ctx = await openPage(port);
    while (chunks.length) {
      const c = chunks.shift();
      await renderChunk(ctx, c);
      doneFrames += c.f1 - c.f0;
      const el = (Date.now() - t0) / 1000;
      console.log(`frames ${c.f0}-${c.f1 - 1} k=${c.k}  ${doneFrames}/${total}  ${el.toFixed(0)}s elapsed`);
    }
    await ctx.browser.close();
  }));
}

const srv = await serve();
const port = srv.address().port;
try {
  if (opt('--stills')) await stills(port, String(opt('--stills')).split(',').map(Number));
  if (opt('--events')) {
    const { browser, page } = await openPage(port);
    const ev = await page.evaluate(() => window.EVENTS());
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify(ev, null, 1));
    console.log(`events: ${ev.length}`);
    await browser.close();
  }
  if (opt('--frames')) {
    const r = opt('--frames');
    const [a, b] = r === true ? [0, FPS * DUR] : r.split(':').map(Number);
    await frames(port, a, b, Number(opt('--workers') || 4));
  }
} finally { srv.close(); }
