'use strict';
// CLAUDE — SHOWREEL 2026. Every frame is a pure function of t: seek(t) paints the whole stage.
const W = 1920, H = 1080, FPS = 60, DUR = 15;
const RENDER = new URLSearchParams(location.search).has('render');
const C = {
  ink: '#0D0D0F', paper: '#EEE9DF', verm: '#FF4020', tang: '#FF8A1F', lime: '#D7FF3C',
  mint: '#5CF2B0', cobalt: '#2A3BFF', lilac: '#B9A8FF', pink: '#FF8FC6',
};

// ───────────────────────── math ─────────────────────────
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const bell = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
const E = {
  lin: x => x,
  inQuad: x => x * x, outQuad: x => 1 - (1 - x) * (1 - x),
  inCubic: x => x * x * x, outCubic: x => 1 - (1 - x) ** 3,
  ioCubic: x => (x < .5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outQuart: x => 1 - (1 - x) ** 4, ioQuart: x => (x < .5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  outQuint: x => 1 - (1 - x) ** 5,
  inExpo: x => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
  outExpo: x => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  ioExpo: x => (x <= 0 ? 0 : x >= 1 ? 1 : x < .5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  outBack: (x, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  ioBack: (x, s = 2.5949) => (x < .5 ? ((2 * x) ** 2 * ((s + 1) * 2 * x - s)) / 2 : ((2 * x - 2) ** 2 * ((s + 1) * (x * 2 - 2) + s) + 2) / 2),
  outBounce: x => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
    return n * (x -= 2.625 / d) * x + .984375;
  },
};
// damped spring step response, t in seconds
function spring(t, f = 2.4, z = .38) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
// CSS cubic-bezier as y = f(x)
function bez(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s;
  const f = x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, s = x;
    for (let i = 0; i < 40; i++) { s = (lo + hi) / 2; if (X(s) < x) lo = s; else hi = s; }
    return Y(s);
  };
  f.X = X; f.Y = Y;
  return f;
}
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const RGB = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${RGB(hex).join(',')},${a})`;
const mixc = (a, b, t) => { const A = RGB(a), B = RGB(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const pad = (n, l = 2) => String(n).padStart(l, '0');

// ───────────────────────── dom ─────────────────────────
const stage = document.getElementById('stage');
function h(tag, o = {}, parent = stage) {
  const e = document.createElement(tag);
  if (o.cls) e.className = o.cls;
  if (o.text != null) e.textContent = o.text;
  if (o.html != null) e.innerHTML = o.html;
  if (o.style) Object.assign(e.style, o.style);
  parent.appendChild(e);
  return e;
}
const css = (e, s) => Object.assign(e.style, s);
// place element centred (ax, ay in % of own box) at x, y
function tf(e, x, y, { s = 1, sx = s, sy = s, r = 0, ax = -50, ay = -50 } = {}) {
  e.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) translate(${ax}%,${ay}%) rotate(${r.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
}
const vf = (e, wdth, wght) => { e.style.fontVariationSettings = `'wdth' ${wdth.toFixed(2)}, 'wght' ${wght.toFixed(1)}`; };
const show = (e, on, d = 'block') => { e.style.display = on ? d : 'none'; };
function canvas(parent, w = W, hh = H, style = {}) {
  const c = h('canvas', { style: Object.assign({ position: 'absolute', left: '0', top: '0', width: w + 'px', height: hh + 'px' }, style) }, parent);
  c.width = w; c.height = hh;
  return c;
}
function starSVG(size, color, wr = .2) {
  const c = size / 2, sw = size * wr, L = c - sw / 2;
  let d = '';
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 4, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
    d += `<line x1="${(c - dx).toFixed(2)}" y1="${(c - dy).toFixed(2)}" x2="${(c + dx).toFixed(2)}" y2="${(c + dy).toFixed(2)}"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;display:block"><g stroke="${color}" stroke-width="${sw}" stroke-linecap="round">${d}</g></svg>`;
}
// capsule rays through (x,y): segs = [[angleDeg, halfLen, thickness], ...]
function drawSegs(g, x, y, segs, rot, color) {
  g.save(); g.translate(x, y); g.rotate(rot * Math.PI / 180);
  g.strokeStyle = color; g.fillStyle = color; g.lineCap = 'round';
  for (const [a, L, T] of segs) {
    const l = Math.max(0, L - T / 2), r = a * Math.PI / 180;
    if (l < .5) { g.beginPath(); g.arc(0, 0, T / 2, 0, Math.PI * 2); g.fill(); continue; }
    g.lineWidth = T; g.beginPath();
    g.moveTo(-Math.cos(r) * l, -Math.sin(r) * l); g.lineTo(Math.cos(r) * l, Math.sin(r) * l); g.stroke();
  }
  g.restore();
}
const STAR4 = [0, 45, 90, 135];

// polar shape outlines, morph → circle
function shapePts(type, r, rot = 0, morph = 0, N = 96) {
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, la = a - rot;
    let rr = r;
    if (type === 'square') rr = r * .88 / Math.max(Math.abs(Math.cos(la)), Math.abs(Math.sin(la)));
    else if (type === 'tri') {
      const seg = Math.PI * 2 / 3, m = ((la - Math.PI / 2) % seg + seg) % seg - seg / 2;
      rr = r * 1.25 * Math.cos(Math.PI / 3) / Math.cos(m);
    } else if (type === 'pill') {
      const n = 5, rx = r * 1.55, ry = r * .62;
      rr = 1 / ((Math.abs(Math.cos(la)) / rx) ** n + (Math.abs(Math.sin(la)) / ry) ** n) ** (1 / n);
    } else if (type === 'star') rr = r * (.5 + .55 * (.5 + .5 * Math.cos(8 * la)) ** 3);
    rr = lerp(rr, r, morph);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function fillPts(g, x, y, pts, sx = 1, sy = 1) {
  g.beginPath();
  pts.forEach(([px, py], i) => (i ? g.lineTo(x + px * sx, y + py * sy) : g.moveTo(x + px * sx, y + py * sy)));
  g.closePath();
}

// ───────────────────────── timeline registries ─────────────────────────
const EV = [];                       // sound-design cue sheet, consumed by audio.py
const sfx = (t, type, o = {}) => EV.push(Object.assign({ t: +t.toFixed(4), type }, o));
const SC = [];
function Scene(name, t0, t1, z) {
  const root = h('div', { cls: 'scene', style: { zIndex: z } });
  const s = { name, t0, t1, root, render: () => {} };
  SC.push(s);
  return s;
}

// ───────────────────────── GL helper ─────────────────────────
function glProgram(cv, frag) {
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: true, alpha: true, antialias: false });
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p');
  const U = {};
  return {
    draw(u) {
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      for (const k in u) {
        const l = U[k] !== undefined ? U[k] : (U[k] = gl.getUniformLocation(pr, k));
        const v = u[k];
        if (typeof v === 'number') gl.uniform1f(l, v);
        else if (v.length === 2) gl.uniform2fv(l, v);
        else if (v.length === 3) gl.uniform3fv(l, v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}

const BLOB_FRAG = `
precision highp float;
uniform vec2 uRes, uCenter; uniform float uFocal;
uniform float uTime, uMorph, uSplit, uTwist, uWob, uCamD, uScale, uFlat, uEnvRot;
uniform vec3 uRot, uTint;
mat2 r2(float a){float c=cos(a),s=sin(a);return mat2(c,s,-s,c);}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sdBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.)-r;}
float sdCap(vec3 p,vec3 a,float r){vec3 ba=2.*a;float h=clamp(dot(p+a,ba)/dot(ba,ba),0.,1.);return length(p+a-ba*h)-r;}
float fA(vec3 p){
  float d=length(p)-1.;
  d+=uWob*.075*sin(3.1*p.x+uTime*3.3)*sin(2.7*p.y+uTime*2.1+1.)*sin(3.3*p.z+uTime*2.6+2.);
  return d;
}
float fB(vec3 p){
  float T=uTime*2.4, s=uSplit;
  vec3 a=vec3(cos(T),.35*sin(T*1.3),sin(T))*.8*s;
  vec3 b=vec3(cos(T+2.094),.35*sin(T*1.3+2.),sin(T+2.094))*.8*s;
  vec3 c=vec3(cos(T+4.189),.35*sin(T*1.3+4.),sin(T+4.189))*.8*s;
  float k=mix(.5,.34,s);
  float d=length(p-a)-mix(1.,.6,s);
  d=smin(d,length(p-b)-mix(1.,.52,s),k);
  d=smin(d,length(p-c)-mix(1.,.46,s),k);
  return d;
}
float fC(vec3 p){ p.xz=r2(uTwist*p.y)*p.xz; return sdBox(p,vec3(.6,.95,.6),.22)*.6; }
float fD(vec3 p){
  float d=1e5;
  for(int i=0;i<4;i++){ float a=float(i)*.7853982; d=min(d,sdCap(p,vec3(cos(a),sin(a),0.)*1.12,.19)); }
  return smin(d,length(p)-.36,.2);
}
float map(vec3 p){
  p/=uScale;
  p.yz=r2(uRot.x)*p.yz; p.xz=r2(uRot.y)*p.xz; p.xy=r2(uRot.z)*p.xy;
  float m=uMorph, d;
  if(m<1.) d=mix(fA(p),fB(p),m);
  else if(m<2.) d=mix(fB(p),fC(p),m-1.);
  else d=mix(fC(p),fD(p),m-2.);
  return d*uScale;
}
vec3 nrm(vec3 p,float e){
  vec2 k=vec2(1.,-1.);
  return normalize(k.xyy*map(p+k.xyy*e)+k.yyx*map(p+k.yyx*e)+k.yxy*map(p+k.yxy*e)+k.xxx*map(p+k.xxx*e));
}
vec3 env(vec3 d){
  d.xz=r2(uEnvRot)*d.xz;
  float y=d.y, az=atan(d.x,d.z);
  vec3 c=mix(vec3(.012,.012,.016),vec3(.07,.065,.07),smoothstep(-1.,1.,y));
  c+=vec3(.35,.09,.03)*smoothstep(-.1,-.9,y);                                    // warm floor bounce
  c+=vec3(1.,.97,.92)*3.2*smoothstep(.62,.9,y);                                  // top softbox
  c+=vec3(1.,.25,.1)*3.*smoothstep(.22,.06,abs(az+1.9))*smoothstep(-.7,-.1,y)*smoothstep(.95,.5,y);  // vermilion strip
  c+=vec3(.16,.23,1.)*3.6*smoothstep(.24,.07,abs(az-1.55))*smoothstep(-.8,-.1,y); // cobalt strip
  c+=vec3(.84,1.,.24)*2.*smoothstep(.35,.1,abs(abs(az)-3.14159))*smoothstep(.25,.0,abs(y-.05)); // lime rim
  c+=vec3(.93,.9,.86)*.45*smoothstep(.1,1.,d.z);                                 // front fill
  return c;
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
  vec2 fc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 q=(fc-uCenter)/uFocal;
  vec3 ro=vec3(0.,0.,uCamD), rd=normalize(vec3(q.x,-q.y,-1.));
  float Rb=1.5*uScale, b=dot(ro,rd), c=dot(ro,ro)-Rb*Rb, hh=b*b-c;
  if(hh<0.){gl_FragColor=vec4(0.);return;}
  hh=sqrt(hh);
  float t=max(-b-hh,0.), t1=-b+hh, mr=1e9, tm=t, px=1./uFocal;
  bool hit=false;
  for(int i=0;i<120;i++){
    float d=map(ro+rd*t);
    float ra=d/(t*px); if(ra<mr){mr=ra;tm=t;}
    if(d<.0004*t){hit=true;break;}
    t+=d*.9; if(t>t1)break;
  }
  float alpha=1.;
  if(!hit){ alpha=1.-smoothstep(0.,1.3,mr); if(alpha<=0.){gl_FragColor=vec4(0.);return;} t=tm; }
  vec3 p=ro+rd*t, n=nrm(p,.0008*t), v=-rd, r=reflect(rd,n);
  float ndv=clamp(dot(n,v),0.,1.), fr=pow(1.-ndv,5.);
  vec3 iri=.5+.5*cos(6.2831*(vec3(0.,.33,.67)+ndv*1.35+.12));
  vec3 base=mix(vec3(.96,.94,.9),iri,.42);
  vec3 col=env(r)*base*(.78+.5*fr);
  vec3 L=normalize(vec3(-.5,.8,.6));
  col+=pow(max(dot(r,L),0.),90.)*2.5;
  float ao=0., sc=1.;
  for(int i=1;i<5;i++){float hs=.035*float(i)*uScale; ao+=(hs-map(p+n*hs))*sc; sc*=.6;}
  col*=mix(.35,1.,clamp(1.-2.2*ao/uScale,0.,1.));
  col=pow(aces(col),vec3(1./2.2));
  float lam=clamp(dot(n,normalize(vec3(-.45,.6,.75))),0.,1.);
  vec3 flt=uTint*(.8+.2*lam);
  col=mix(col,flt,uFlat);
  gl_FragColor=vec4(col*alpha,alpha);
}`;

// ───────────────────────── HUD ─────────────────────────
const hud = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', zIndex: 100, pointerEvents: 'none' } });
const hTL = h('div', { cls: 'a mono', html: 'CLAUDE <span style="opacity:.45">&nbsp;/ DESIGNER</span>', style: { left: '96px', top: '38px' } }, hud);
const hTR = h('div', { cls: 'a mono', html: '<span style="opacity:.45">SHOWREEL&nbsp;</span> MMXXVI', style: { left: 'auto', right: '96px', top: '38px' } }, hud);
const hBL = h('div', { cls: 'a mono', style: { left: '96px', top: '1026px' } }, hud);
const hBRbox = h('div', { cls: 'a', style: { left: 'auto', right: '96px', top: '1024px', height: '19px', width: '220px', overflow: 'hidden' } }, hud);
const hBRa = h('div', { cls: 'a mono', style: { left: 'auto', right: '0', top: '2px' } }, hBRbox);
const hBRb = h('div', { cls: 'a mono', style: { left: 'auto', right: '0', top: '2px' } }, hBRbox);
const hBar = h('div', { cls: 'a', style: { left: '380px', top: '1034px', width: '1160px', height: '1px', background: 'currentColor', opacity: .25 } }, hud);
const hFill = h('div', { cls: 'a', style: { left: '380px', top: '1033px', width: '1160px', height: '3px', background: 'currentColor', transformOrigin: '0 0' } }, hud);
const CHAPTERS = [[0, '00', 'INTRO'], [1, '01', 'TYPE'], [3, '02', 'MOTION'], [5, '03', 'FORM'], [7, '04', 'COLOR'], [9, '05', 'SYSTEMS'], [11, '06', 'RANGE'], [13, '07', 'HELLO']];
CHAPTERS.forEach(([ct]) => h('div', { cls: 'a', style: { left: (380 + ct / DUR * 1160) + 'px', top: '1028px', width: '1px', height: '13px', background: 'currentColor', opacity: .5 } }, hud));
const marks = [[40, 40, 1, 1], [1880, 40, -1, 1], [40, 1040, 1, -1], [1880, 1040, -1, -1]].map(([x, y, dx, dy]) => {
  const m = h('div', { cls: 'a', style: { left: x + 'px', top: y + 'px' } }, hud);
  h('div', { cls: 'a', style: { left: (dx > 0 ? 0 : -14) + 'px', top: '0', width: '14px', height: '1px', background: 'currentColor' } }, m);
  h('div', { cls: 'a', style: { left: '0', top: (dy > 0 ? 0 : -14) + 'px', width: '1px', height: '14px', background: 'currentColor' } }, m);
  return m;
});
function hudColor(t) {
  if (t < 1.0) return C.paper;
  if (t < 2.93) return C.ink;
  if (t < 7.0) return C.paper;
  if (t < 11.0) return C.ink;
  if (t < 11.25) return C.ink;
  if (t < 11.5) return C.paper;
  if (t < 11.75) return C.ink;
  return C.paper;
}
function renderHUD(t) {
  const on = clamp(prog(t, .0, .18) * (1 - prog(t, 14.72, 14.95)));
  hud.style.opacity = on;
  hud.style.color = hudColor(t);
  const f = Math.min(Math.floor(t * FPS + 1e-6), DUR * FPS);
  hBL.innerHTML = `<span style="opacity:.45">TC&nbsp;</span> 00:00:${pad(Math.floor(f / FPS))}:${pad(f % FPS)}`;
  hFill.style.transform = `scaleX(${(t / DUR).toFixed(5)}) scaleY(.34)`;
  let ci = 0; CHAPTERS.forEach(([ct], i) => { if (t >= ct) ci = i; });
  const [ct, cn, cl] = CHAPTERS[ci];
  const p = E.outExpo(prog(t, ct, ct + .32));
  hBRa.innerHTML = `${cn} <span style="opacity:.45">—</span> ${cl}`;
  hBRa.style.transform = `translateY(${(1 - p) * 20}px)`;
  if (ci > 0 && p < 1) {
    const [, pn, pl] = CHAPTERS[ci - 1];
    hBRb.innerHTML = `${pn} <span style="opacity:.45">—</span> ${pl}`;
    hBRb.style.transform = `translateY(${-p * 20}px)`; show(hBRb, true);
  } else show(hBRb, false);
}

// grain + vignette
const grainTiles = [];
{
  const R = rng(99);
  for (let k = 0; k < 8; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (R() + R() + R() - 1.5) * 150 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = clamp(v, 0, 255); im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); grainTiles.push(c.toDataURL());
  }
}
const vign = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', zIndex: 98, pointerEvents: 'none', background: 'radial-gradient(ellipse 75% 75% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,.12) 100%)', mixBlendMode: 'multiply' } });
const grain = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', zIndex: 99, pointerEvents: 'none', mixBlendMode: 'overlay', opacity: .11, backgroundSize: '256px 256px' } });
function renderGrain(t) {
  const f = Math.floor(t * FPS + 1e-6);
  grain.style.backgroundImage = `url(${grainTiles[f % 8]})`;
  grain.style.backgroundPosition = `${(f * 73) % 256}px ${(f * 151) % 256}px`;
}

// ═════════════════════════ 00 · IGNITION  (0 → 1.0) ═════════════════════════
{
  const s = Scene('ignition', 0, 1.34, 50);
  const cv = canvas(s.root), g = cv.getContext('2d');
  const R = rng(11);
  const sparks = Array.from({ length: 46 }, () => ({ a: R() * Math.PI * 2, v: 1800 + R() * 3400, r: 2 + R() * 5, c: R() < .65 ? C.verm : C.paper, dl: R() * .05 }));
  sfx(.08, 'pop', { f: 820 });
  sfx(.25, 'whoosh', { dur: .3, pan: -.2, gain: .55 });
  for (let k = 1; k < 4; k++) sfx(.5 + k * .045, 'tick', { f: 1500 + k * 450, gain: .45, pan: (k - 2) * .4 });
  sfx(.3, 'riser', { dur: .7, gain: .8 });
  sfx(1.0, 'impact', { gain: 1 });
  s.render = t => {
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W, H);
    g.fillStyle = C.ink; g.fillRect(0, 0, W, H);
    const cx = 960, cy = 540;
    // blueprint grid
    const bpo = 1 - prog(t, .92, 1.0);
    if (bpo > 0) {
      g.lineWidth = 1;
      for (let c = 0; c <= 12; c++) {
        const x = 96 + c * 144, dl = Math.abs(c - 6) * .025, hl = H / 2 * E.outExpo(prog(t, .04 + dl, .7 + dl));
        g.strokeStyle = rgba(C.paper, .075 * bpo);
        g.beginPath(); g.moveTo(x + .5, cy - hl); g.lineTo(x + .5, cy + hl); g.stroke();
      }
      const wl = W / 2 * E.outExpo(prog(t, .02, .6));
      g.beginPath(); g.moveTo(cx - wl, cy + .5); g.lineTo(cx + wl, cy + .5); g.stroke();
      const gc = E.outCubic(prog(t, .52, .9));
      if (gc > 0) {
        g.strokeStyle = rgba(C.paper, .28 * bpo); g.setLineDash([3, 7]);
        g.beginPath(); g.arc(cx, cy, 200, -Math.PI / 2, -Math.PI / 2 + gc * Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
      const la = prog(t, .6, .66) * bpo;
      if (la > 0) {
        g.fillStyle = rgba(C.paper, .6 * la); g.font = '500 12px Mono'; g.letterSpacing = '2px';
        g.fillText('45°', cx + 150, cy - 64); g.fillText('R 200', cx + 214, cy - 10);
        g.fillText('X 960  Y 540', cx - 330, cy + 26);
        g.fillStyle = rgba(C.verm, la); g.fillRect(cx + 199, cy - 2, 4, 4);
      }
    }
    // the mark
    let segs = null, rot = 0, sc = 1;
    if (t < .25) {
      const sp = spring(t - .08, 3.4, .42), sq = Math.sin(Math.PI * prog(t, .18, .25));
      if (sp > 0) { g.fillStyle = C.verm; g.beginPath(); g.ellipse(cx, cy, Math.max(0, 11 * sp * (1 + .35 * sq)), Math.max(0, 11 * sp * (1 - .3 * sq)), 0, 0, Math.PI * 2); g.fill(); }
    } else if (t < .5) {
      const p = E.outExpo(prog(t, .25, .5));
      segs = [[0, lerp(11, 580, p), lerp(22, 5, E.outCubic(prog(t, .25, .42)))]];
    } else {
      const L = lerp(580, 150, E.outExpo(prog(t, .5, .74))), T = lerp(5, 34, E.outExpo(prog(t, .52, .78)));
      segs = [0, 1, 2, 3].map(k => [k * 45 * E.outBack(prog(t, .5 + k * .045, .74 + k * .045), 1.6), L, T]);
      rot = 95 * E.inCubic(prog(t, .7, 1.0)) + 70 * E.outExpo(prog(t, 1.0, 1.34));
      sc = 1 - .22 * E.inQuad(prog(t, .76, 1.0));
    }
    if (segs && t < 1.0) drawSegs(g, cx, cy, segs.map(([a, L, T]) => [a, L * sc, T * sc]), rot, C.verm);
    if (t >= 1.0) {
      const q = E.outExpo(prog(t, 1.0, 1.3)), q2 = E.outExpo(prog(t, 1.018, 1.32));
      drawSegs(g, cx, cy, STAR4.map(a => [a, lerp(117, 2800, q), lerp(26.5, 1290, q)]), rot, C.verm);
      g.globalCompositeOperation = 'destination-out';
      drawSegs(g, cx, cy, STAR4.map(a => [a, lerp(0, 2800, q2), lerp(0, 1250, q2)]), rot, '#000');
      g.globalCompositeOperation = 'source-over';
      for (const p of sparks) {
        const dt = t - 1.0 - p.dl; if (dt <= 0) continue;
        const d = p.v * (1 - Math.exp(-6 * dt)) / 6, al = 1 - prog(dt, .12, .32);
        if (al <= 0) continue;
        g.fillStyle = p.c; g.globalAlpha = al;
        g.beginPath(); g.arc(cx + Math.cos(p.a) * (60 + d), cy + Math.sin(p.a) * (60 + d), p.r * (1 - .5 * prog(dt, 0, .3)), 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
    }
  };
}

// ═════════════════════════ 01 · TYPE  (1.0 → 3.0) ═════════════════════════
const TS = 680, TBASE = 735;           // specimen size + baseline
const PERIOD = { x: 0, y: 0, r: 0 };   // handed to MOTION
{
  const s = Scene('type', 1.0, 3.04, 20);
  css(s.root, { background: C.paper });
  // A — giant word
  const word = h('div', { cls: 'a nw', style: { fontSize: '500px', lineHeight: '360px', height: '360px', color: C.ink, letterSpacing: '-0.01em' } }, s.root);
  const letters = [...'TYPE'].map(ch => { const m = h('span', { cls: 'mask', style: { height: '360px' } }, word); return h('span', { cls: 'in', text: ch }, m); });
  for (let i = 0; i < 4; i++) sfx(1.0 + i * .035, 'tick', { f: 900 + i * 120, gain: .35, pan: (i - 1.5) * .3 });
  sfx(1.25, 'blip', { f: 1320, gain: .35 });
  // B — specimen rows
  const RW = ['TYPOGRAPHY', 'KERNING', 'letterforms', 'TYPE', 'LIGATURES', 'HIERARCHY', 'variable', 'GRIDS'];
  const RS = ['fill', 'outline', 'serif', 'verm', 'fill', 'outline', 'serif', 'fill'];
  const rows = RW.map((wd, i) => {
    const st = RS[i], col = st === 'verm' ? C.verm : C.ink;
    const el = h('div', { cls: 'row' }, s.root);
    const span = st === 'serif'
      ? `<span class="serif it" style="font-size:176px;letter-spacing:-.01em">${wd}</span>`
      : `<span style="font-size:150px;line-height:1;${st === 'outline' ? `color:transparent;-webkit-text-stroke:2.5px ${C.ink}` : `color:${col}`}">${wd}</span>`;
    el.innerHTML = Array(7).fill(span + starSVG(58, col, .2)).join('');
    return { el, st };
  });
  sfx(1.48, 'whoosh', { dur: .35, pan: .4, gain: .6 });
  // C — specimen: A a . + metric lines
  const MET = [['CAP HEIGHT', 720, 1], ['X-HEIGHT', 510, 3], ['BASELINE', 0, 5], ['DESCENDER', -205, 6]];
  const mlines = MET.map(([n, v], i) => {
    const y = TBASE - v / 1000 * TS;
    const line = h('div', { cls: 'a', style: { height: '2px', background: v === 0 ? C.verm : C.ink, transformOrigin: '100% 50%' } }, s.root);
    const lm = h('div', { cls: 'a', style: { left: 'auto', right: '96px', top: (y - 26) + 'px', overflow: 'hidden', height: '20px' } }, s.root);
    const lab = h('div', { cls: 'mono', html: `${n} <span style="opacity:.45">&nbsp;${v}</span>`, style: { color: C.ink } }, lm);
    const vm = h('div', { cls: 'a', style: { left: '96px', top: (y - 26) + 'px', overflow: 'hidden', height: '20px' } }, s.root);
    const val = h('div', { cls: 'mono', text: `${pad(i + 1)}`, style: { color: C.ink, opacity: .45 } }, vm);
    return { line, y, lab, val, lm, vm };
  });
  for (let i = 0; i < 4; i++) sfx(2.06 + i * .04, 'tick', { f: 2200 - i * 200, gain: .3, pan: .5 });
  const AX = 560, aX = AX + .48 * TS;
  const glyph = (ch, x, italic, color) => {
    const m = h('div', { cls: 'a', style: { left: (x - .1 * TS) + 'px', top: (TBASE - .8 * TS) + 'px', width: (.72 * TS) + 'px', height: (1.04 * TS) + 'px', overflow: 'hidden' } }, s.root);
    const g = h('div', { cls: `a serif nw${italic ? ' it' : ''}`, text: ch, style: { left: (.1 * TS) + 'px', top: (.8 * TS - .84 * TS) + 'px', fontSize: TS + 'px', lineHeight: TS + 'px', color } }, m);
    return g;
  };
  const gA = glyph('A', AX, false, C.ink), ga = glyph('a', aX, true, C.ink);
  // selection box around the "a"
  const sel = h('div', { cls: 'a' }, s.root);
  const bx0 = aX + .013 * TS, bx1 = aX + .452 * TS, by0 = TBASE - .516 * TS, by1 = TBASE + .009 * TS;
  css(sel, { left: bx0 + 'px', top: by0 + 'px', width: (bx1 - bx0) + 'px', height: (by1 - by0) + 'px', border: `2px solid ${C.cobalt}`, boxSizing: 'border-box' });
  const handles = [[0, 0], [1, 0], [0, 1], [1, 1], [.5, 0], [.5, 1], [0, .5], [1, .5]].map(([u, v]) => h('div', { cls: 'a', style: { width: '12px', height: '12px', background: '#fff', border: `2px solid ${C.cobalt}`, boxSizing: 'border-box', left: (u * (bx1 - bx0) - 6) + 'px', top: (v * (by1 - by0) - 6) + 'px' } }, sel));
  const selTag = h('div', { cls: 'a mono', text: '298 × 357', style: { background: C.cobalt, color: '#fff', padding: '5px 9px', borderRadius: '4px', fontSize: '12px', left: ((bx1 - bx0) / 2) + 'px', top: (by1 - by0 + 14) + 'px', transform: 'translateX(-50%)' } }, sel);
  sfx(2.22, 'click', { gain: .4, pan: .2 });
  // the period — becomes the ball in MOTION
  const pr = .052 * TS, px0 = aX + .474 * TS + .075 * TS + pr, py0 = TBASE - .0435 * TS;
  const dot = h('div', { cls: 'a', style: { width: (pr * 2) + 'px', height: (pr * 2) + 'px', borderRadius: '50%', background: C.verm } }, s.root);
  sfx(2.26, 'pop', { f: 700, gain: .5 });
  sfx(2.5, 'swoosh', { dur: .25, pan: .3, gain: .45 });
  sfx(2.56, 'boing', { gain: .6 });
  sfx(2.85, 'thud', { gain: .5 });

  s.render = t => {
    // A
    const aOn = t < 1.66;
    show(word, aOn);
    if (aOn) {
      letters.forEach((l, i) => {
        const d = i * .035;
        const yin = 1 - E.outExpo(prog(t, 1.0 + d, 1.42 + d)), yout = E.inCubic(prog(t, 1.47 + d * .6, 1.62 + d * .6));
        l.style.transform = `translateY(${(yin * 105 - yout * 105).toFixed(2)}%)`;
        const pw = E.outExpo(prog(t, 1.02 + d, 1.46 + d)), pulse = .5 + .5 * Math.sin((t - 1.25) * 14 + i);
        vf(l, lerp(62, 125, pw), lerp(160, 900, pw) - (t > 1.3 ? 90 * pulse * prog(t, 1.3, 1.4) : 0));
        l.style.color = i === 1 && t >= 1.25 ? C.verm : C.ink;
      });
      tf(word, 960, 540, { s: 1 + .04 * E.outCubic(prog(t, 1.0, 1.5)) });
    }
    // B
    const bOn = t >= 1.46 && t < 2.16;
    rows.forEach((R, i) => {
      show(R.el, bOn, 'flex'); if (!bOn) return;
      const dir = i % 2 ? 1 : -1, d0 = 1.46 + i * .022;
      const ent = 1 - E.outQuart(prog(t, d0, d0 + .44));
      const x = -1900 + dir * (t - 1.5) * 560 - dir * ent * 2000;
      if (R.st !== 'serif') {
        const ph = 2 * Math.PI * (t - 1.5) * 1.25 - i * .8;
        vf(R.el, lerp(62, 125, .5 + .5 * Math.sin(ph)), lerp(140, 900, .5 + .5 * Math.sin(ph + 1.3)));
      }
      const sy = 1 - E.ioCubic(prog(t, 1.98 + i * .014, 2.1 + i * .014));
      R.el.style.transform = `translate(${x.toFixed(1)}px,${i * 135}px) scaleY(${sy.toFixed(4)})`;
    });
    // C — metric lines
    mlines.forEach((m, i) => {
      const on = t >= 2.02 + i * .012 && t < 2.8;
      show(m.line, on); show(m.lm, on); show(m.vm, on);
      if (!on) return;
      const rowY = MET[i][2] * 135 + 67.5, e = E.outExpo(prog(t, 2.04 + i * .02, 2.34 + i * .02));
      const y = lerp(rowY, m.y, e);
      const ex = E.ioCubic(prog(t, 2.5 + i * .035, 2.72 + i * .035));
      css(m.line, { left: lerp(0, 96, e) + 'px', width: lerp(1920, 1728, e) + 'px', top: (y - 1) + 'px', transform: `scaleX(${(1 - ex).toFixed(4)})` });
      const le = E.outExpo(prog(t, 2.16 + i * .04, 2.5 + i * .04)), lx = E.inCubic(prog(t, 2.48 + i * .03, 2.6 + i * .03));
      m.lab.style.transform = m.val.style.transform = `translateY(${((1 - le) * 22 - lx * 22).toFixed(2)}px)`;
    });
    // glyphs
    const gOn = t >= 2.0 && t < 2.8;
    [gA, ga].forEach((g, i) => {
      show(g.parentNode, gOn); if (!gOn) return;
      const e = E.outExpo(prog(t, 2.06 + i * .07, 2.5 + i * .07)), x = E.inCubic(prog(t, 2.5 + i * .04, 2.66 + i * .04));
      g.style.transform = `translateY(${((1 - e) * 104 + x * 104).toFixed(2)}%)`;
    });
    const sOn = t >= 2.2 && t < 2.56;
    show(sel, sOn);
    if (sOn) {
      const e = E.outExpo(prog(t, 2.2, 2.4)), x = E.inCubic(prog(t, 2.46, 2.56));
      sel.style.opacity = (1 - x);
      sel.style.transform = `scale(${lerp(1.08, 1, e) - .04 * x})`;
      handles.forEach((hd, i) => { const sp = spring(t - 2.22 - i * .012, 4, .45); hd.style.transform = `scale(${Math.max(0, sp)})`; });
      selTag.style.opacity = prog(t, 2.28, 2.34);
    }
    // the period
    const dOn = t >= 2.24 && t < 2.87;
    show(dot, dOn);
    if (dOn) {
      const pop = spring(t - 2.24, 3.2, .4);
      const hp = prog(t, 2.56, 2.85), he = E.ioCubic(hp);
      const x = lerp(px0, 960, he), y = lerp(py0, 540, he) - 300 * Math.sin(Math.PI * hp) * (1 - .3 * hp);
      const vy = Math.cos(Math.PI * hp);
      const land = bell(t, 2.855, .018);
      const stretch = hp > 0 && hp < 1 ? .16 * Math.abs(vy) : 0;
      tf(dot, x, y, { sx: pop * (1 - stretch + .3 * land), sy: pop * (1 + stretch - .28 * land) });
      PERIOD.x = x; PERIOD.y = y; PERIOD.r = pr;
    }
  };
}

// ═════════════════════════ 02 · MOTION  (3.0 → 5.0) ═════════════════════════
{
  const s = Scene('motion', 2.86, 5.0, 30);
  css(s.root, { background: C.cobalt });
  const cv = canvas(s.root), g = cv.getContext('2d');
  const GX = 150, GY = 285, GS = 510;
  const ease = bez(.83, 0, .17, 1);
  const TX0 = 960, TX1 = 1720, TY = 540;
  const curve = Array.from({ length: 241 }, (_, i) => { const sP = i / 240; return [GX + ease.X(sP) * GS, GY + GS - ease.Y(sP) * GS]; });
  const LIB = [
    ['LINEAR', E.lin, 'circle', C.paper],
    ['EASE-OUT EXPO', E.outExpo, 'square', C.lime],
    ['IN-OUT BACK', E.ioBack, 'tri', C.pink],
    ['SPRING 180 / 12', x => spring(x * .5, 3.1, .3), 'pill', C.tang],
    ['BOUNCE', E.outBounce, 'star', C.lime],
  ];
  const LY = [330, 435, 540, 645, 750], LX0 = 600, LX1 = 1700;
  sfx(3.05, 'tick', { f: 2400, gain: .3 }); sfx(3.15, 'tick', { f: 2800, gain: .3, pan: -.4 }); sfx(3.2, 'tick', { f: 3100, gain: .3, pan: -.3 });
  sfx(3.3, 'whoosh', { dur: .6, pan: .6, gain: .45 });
  LIB.forEach((_, i) => sfx(4.02 + i * .02, 'swoosh', { dur: .3, pan: .5, gain: .22 }));
  sfx(4.47, 'blip', { f: 1760, gain: .3 });
  sfx(4.52, 'zip', { dur: .24, gain: .5 });
  sfx(4.76, 'pop', { f: 520, gain: .7 });
  const txt = (s, x, y, a = 1, col = C.paper, size = 12, align = 'left') => {
    g.font = `500 ${size}px Mono`; g.letterSpacing = '1.8px'; g.textAlign = align; g.fillStyle = rgba(col, a); g.fillText(s, x, y); g.textAlign = 'left';
  };
  s.render = t => {
    // iris
    if (t < 2.99) { const ir = lerp(PERIOD.r || 35, 1150, E.inExpo(prog(t, 2.88, 2.985))); s.root.style.clipPath = `circle(${ir.toFixed(1)}px at 960px 540px)`; }
    else s.root.style.clipPath = 'none';
    g.clearRect(0, 0, W, H);
    // ── A: graph editor + spacing chart
    const aOut = E.inCubic(prog(t, 3.96, 4.12));
    if (t < 4.12) {
      g.save(); g.translate(-240 * aOut, 0); g.globalAlpha = 1 - aOut;
      const gi = E.outExpo(prog(t, 2.98, 3.3));
      g.lineWidth = 1;
      for (let k = 0; k <= 6; k++) {
        const e = E.outExpo(prog(t, 3.0 + k * .018, 3.35 + k * .018));
        g.strokeStyle = rgba(C.paper, k === 0 || k === 6 ? .4 : .13);
        g.beginPath(); g.moveTo(GX + k * GS / 6 + .5, GY + GS); g.lineTo(GX + k * GS / 6 + .5, GY + GS - GS * e); g.stroke();
        g.beginPath(); g.moveTo(GX, GY + GS - k * GS / 6 + .5); g.lineTo(GX + GS * e, GY + GS - k * GS / 6 + .5); g.stroke();
      }
      const cp = E.outCubic(prog(t, 3.05, 3.42)), n = Math.floor(cp * 240);
      if (n > 1) {
        g.strokeStyle = C.paper; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); for (let i = 0; i <= n; i++) (i ? g.lineTo : g.moveTo).apply(g, curve[i]); g.stroke();
      }
      const P1 = [GX + .83 * GS, GY + GS], P2 = [GX + .17 * GS, GY], P0 = [GX, GY + GS], P3 = [GX + GS, GY];
      [[P0, P1, 3.15], [P3, P2, 3.2]].forEach(([a, b, tt]) => {
        const sp = spring(t - tt, 3.6, .42); if (sp <= 0) return;
        g.strokeStyle = rgba(C.paper, .55); g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(lerp(a[0], b[0], clamp(sp)), lerp(a[1], b[1], clamp(sp))); g.stroke();
        g.fillStyle = C.lime; const hs = 14 * sp; g.fillRect(b[0] - hs / 2, b[1] - hs / 2, hs, hs);
        g.fillStyle = C.paper; g.beginPath(); g.arc(a[0], a[1], 6 * sp, 0, Math.PI * 2); g.fill();
      });
      const title = 'EASE — cubic-bezier(.83, 0, .17, 1)', nc = Math.floor(prog(t, 3.04, 3.36) * title.length);
      txt(title.slice(0, nc) + (nc < title.length && nc > 0 ? '▍' : ''), GX, GY - 32, .9);
      txt('VALUE', GX - 22, GY + GS / 2, .5 * gi, C.paper, 11, 'right');
      txt('TIME →', GX + GS, GY + GS + 30, .5 * gi, C.paper, 11, 'right');
      // playhead
      const u = prog(t, 3.28, 3.95), yv = ease(u);
      if (t > 3.26) {
        const phx = GX + u * GS, phy = GY + GS - yv * GS;
        g.strokeStyle = rgba(C.lime, .9); g.lineWidth = 2; g.beginPath(); g.moveTo(phx, GY - 8); g.lineTo(phx, GY + GS + 8); g.stroke();
        g.strokeStyle = rgba(C.paper, .35); g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(phx, phy); g.lineTo(TX0 - 60, phy); g.stroke(); g.setLineDash([]);
        g.fillStyle = C.lime; g.beginPath(); g.arc(phx, phy, 8, 0, Math.PI * 2); g.fill();
        txt(`t ${u.toFixed(2)}  v ${yv.toFixed(2)}`, phx + 16, phy - 14, .85, C.paper, 11);
      }
      // track + spacing chart
      const te = E.outExpo(prog(t, 3.02, 3.4));
      g.strokeStyle = rgba(C.paper, .3); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(TX0 - 20, TY + 78); g.lineTo(lerp(TX0 - 20, TX1 + 20, te), TY + 78); g.stroke();
      txt('SPACING CHART', TX0 - 20, TY - 88, .6 * te, C.paper, 11);
      txt('F 00', TX0 - 20, TY + 110, .5 * te, C.paper, 11);
      txt('F 40', TX1 + 20, TY + 110, .5 * te, C.paper, 11, 'right');
      for (let k = 0; k <= 20; k++) {
        const uk = k / 20; if (uk > u + 1e-6 || t < 3.28) continue;
        const gx = lerp(TX0, TX1, ease(uk));
        g.strokeStyle = rgba(C.paper, .3); g.lineWidth = 1.5; g.beginPath(); g.arc(gx, TY, 46, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = rgba(C.paper, .8); g.beginPath(); g.moveTo(gx, TY + 70); g.lineTo(gx, TY + 86); g.stroke();
      }
      // ball
      const bx = lerp(TX0, TX1, yv);
      const vel = Math.abs(ease(clamp(u + .01)) - ease(clamp(u - .01))) / .02;
      const st = Math.min(.45, vel * .12 * (t > 3.28 && t < 3.95 ? 1 : 0));
      const grow = t < 3.1 ? lerp(PERIOD.r || 35, 46, E.outCubic(prog(t, 2.9, 3.1))) : 46;
      g.fillStyle = t < 2.92 ? C.verm : mixc(C.verm, C.lime, prog(t, 2.92, 3.02));
      g.beginPath(); g.ellipse(bx, TY, grow * (1 + st), grow / (1 + st), 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // ── B: easing library
    if (t >= 3.98 && t < 4.8) {
      const lo = 1 - prog(t, 4.5, 4.64);
      LIB.forEach(([name, fn, type, col], i) => {
        const y = LY[i], e = E.outExpo(prog(t, 3.98 + i * .03, 4.3 + i * .03));
        g.globalAlpha = lo;
        txt(name, lerp(20, 150, e), y + 4, .9 * e, C.paper, 12);
        // mini curve icon
        const ix = 420, iy = y - 22, is = 44;
        g.strokeStyle = rgba(C.paper, .25 * e); g.lineWidth = 1; g.strokeRect(ix + .5, iy + .5, is, is);
        g.strokeStyle = rgba(C.lime, e); g.lineWidth = 2; g.beginPath();
        for (let k = 0; k <= 40; k++) { const xx = k / 40, yy = fn(xx); (k ? g.lineTo : g.moveTo).call(g, ix + xx * is, iy + is - yy * is * .8 - is * .1); }
        g.stroke();
        g.strokeStyle = rgba(C.paper, .18 * e); g.beginPath(); g.moveTo(LX0 - 40, y + .5); g.lineTo(lerp(LX0 - 40, LX1 + 40, e), y + .5); g.stroke();
        g.globalAlpha = 1;
      });
      if (t < 4.52) {
        LIB.forEach(([, fn, type, col], i) => {
          const y = LY[i], pop = spring(t - 4.0 - i * .025, 3.4, .45);
          const P = tt => fn(prog(tt, 4.03, 4.46));
          for (let k = 7; k >= 0; k--) {
            const tt = t - k * .014, x = lerp(LX0, LX1, P(tt));
            const rot = type === 'square' ? Math.PI * P(tt) : type === 'star' ? Math.PI * .5 * P(tt) : 0;
            g.fillStyle = k ? rgba(col, .12 * (1 - k / 8)) : col;
            fillPts(g, x, y, shapePts(type, 32 * Math.max(0, pop), rot)); g.fill();
          }
        });
      }
    }
    // ── C: converge → one ball → sphere
    if (t >= 4.52) {
      LIB.forEach(([, , type, col], i) => {
        const p = prog(t, 4.52 + i * .018, 4.76 + i * .01), e = E.ioCubic(p);
        const x0 = LX1, y0 = LY[i];
        const cx = lerp(lerp(x0, 1300, e), lerp(1300, 960, e), e), cy = lerp(lerp(y0, y0 + (i - 2) * -40 - 160, e), lerp(y0 + (i - 2) * -40 - 160, 540, e), e);
        if (t < 4.78) { g.fillStyle = mixc(col, C.lime, e); fillPts(g, cx, cy, shapePts(type, lerp(32, 46, e), 0, e)); g.fill(); }
      });
      if (t >= 4.76) {
        const r = lerp(46, 183, spring(t - 4.76, 2.2, .5));
        const grd = g.createRadialGradient(960 - r * .35, 540 - r * .4, r * .1, 960, 540, r);
        const shade = prog(t, 4.84, 4.99);
        grd.addColorStop(0, C.lime); grd.addColorStop(1, mixc(C.lime, '#9DBB20', shade));
        g.fillStyle = grd; g.beginPath(); g.arc(960, 540, r, 0, Math.PI * 2); g.fill();
        const rw = prog(t, 4.76, 5.0);
        if (rw < 1) { g.strokeStyle = rgba(C.paper, .6 * (1 - rw)); g.lineWidth = 2; g.beginPath(); g.arc(960, 540, lerp(60, 620, E.outExpo(rw)), 0, Math.PI * 2); g.stroke(); }
      }
    }
  };
}

// ═════════════════════════ 03 · FORM  (5.0 → 7.0) ═════════════════════════
function formParams(t) {
  const u = t - 5.0;
  const morph = t < 5.5 ? 0 : t < 6.0 ? E.outCubic(prog(t, 5.5, 5.66)) : t < 6.5 ? 1 + E.outCubic(prog(t, 6.0, 6.16)) : 2 + E.outCubic(prog(t, 6.5, 6.66));
  const split = E.outBack(prog(t, 5.52, 5.86), 1.4) * (1 - .55 * E.ioCubic(prog(t, 5.86, 6.02)));
  const twist = 2.3 * E.outBack(prog(t, 6.02, 6.4), 1.5) + .35 * Math.sin((t - 6.0) * 8) * prog(t, 6.2, 6.4);
  const wob = prog(t, 5.06, 5.3) * (1 - prog(t, 5.5, 5.62));
  const camD = lerp(6.0, 3.9, E.outExpo(prog(t, 5.03, 5.62)));
  let punch = 0;
  for (const b of [5.5, 6.0, 6.5]) if (t >= b) punch += .07 * Math.exp(-(t - b) * 11);
  const fly = E.inExpo(prog(t, 6.7, 7.0));
  return {
    uRes: [W, H], uCenter: [960, 540], uFocal: 1080, uTime: u, uMorph: morph, uSplit: split, uTwist: twist, uWob: wob,
    uCamD: camD, uScale: (1 + punch) * lerp(1, 8.2, fly), uFlat: 1 - E.outQuad(prog(t, 5.0, 5.28)), uEnvRot: u * .9,
    uRot: [.3 + .35 * Math.sin(u * 1.3), u * 1.4 + 1.3 * E.outExpo(prog(t, 6.5, 6.9)), (t > 6.5 ? (t - 6.5) * 2.4 : 0) + 3.2 * fly],
    uTint: [.843, 1, .235],
  };
}
{
  const s = Scene('form', 5.0, 7.0, 32);
  const word = h('div', { cls: 'a nw', style: { fontSize: '470px', lineHeight: '340px', height: '340px', letterSpacing: '0.01em' } }, s.root);
  const FL = [...'FORM'].map(ch => { const m = h('span', { cls: 'mask', style: { height: '340px' } }, word); return h('span', { cls: 'in', text: ch }, m); });
  const glc = canvas(s.root); const blob = glProgram(glc, BLOB_FRAG);
  const fc = canvas(s.root), g = fc.getContext('2d');
  const STAGES = ['SPHERE', 'METABALLS ×3', 'TWISTED BOX', 'STARBURST'];
  sfx(5.0, 'sub', { gain: .9 });
  sfx(5.5, 'bloop', { gain: .7 });
  sfx(6.0, 'bell', { f: 880, gain: .5 });
  sfx(6.5, 'bell', { f: 1320, gain: .35 });
  sfx(6.5, 'swoosh', { dur: .3, pan: -.3, gain: .4 });
  sfx(6.62, 'riser', { dur: .38, gain: .6 });
  sfx(6.8, 'whoosh', { dur: .3, pan: 0, gain: .8 });
  const txt = (str, x, y, a = 1, col = C.paper, size = 12, align = 'left') => {
    g.font = `500 ${size}px Mono`; g.letterSpacing = '1.8px'; g.textAlign = align; g.fillStyle = rgba(col, a); g.fillText(str, x, y); g.textAlign = 'left';
  };
  s.render = t => {
    s.root.style.background = mixc(C.cobalt, C.ink, E.outQuad(prog(t, 5.0, 5.36)));
    const P = formParams(t);
    blob.draw(P);
    // outline word behind the object
    const fly = E.inExpo(prog(t, 6.7, 6.95));
    tf(word, 960, 540, { s: 1 + .5 * fly });
    word.style.opacity = 1 - fly;
    FL.forEach((l, i) => {
      const e = E.outExpo(prog(t, 5.1 + i * .045, 5.55 + i * .045));
      l.style.transform = `translateY(${((1 - e) * 104).toFixed(2)}%)`;
      vf(l, 112 + 13 * Math.sin((t - 5) * 3 + i * .9), 800);
      const filled = t >= 5.5 + i * .5 && t < 6.0 + i * .5 && i < 3;
      l.style.color = filled ? C.verm : 'transparent';
      l.style.webkitTextStroke = filled ? '0px transparent' : `2px ${rgba(C.paper, .34)}`;
    });
    // annotations
    g.clearRect(0, 0, W, H);
    const an = prog(t, 5.15, 5.35) * (1 - prog(t, 6.66, 6.8));
    if (an > 0) {
      g.globalAlpha = an;
      const rPx = 1080 / Math.sqrt(P.uCamD ** 2 - 1) * (P.uMorph >= 3 ? 1.1 : 1);
      // orbit
      const oe = E.outCubic(prog(t, 5.15, 5.6));
      g.save(); g.translate(960, 540); g.rotate(-.18);
      g.strokeStyle = rgba(C.paper, .32); g.lineWidth = 1.2; g.setLineDash([2, 6]);
      g.beginPath(); g.ellipse(0, 0, rPx * 1.55, rPx * .42, 0, 0, Math.PI * 2 * oe); g.stroke(); g.setLineDash([]);
      const sa = (t - 5) * 2.6;
      g.fillStyle = C.lime; g.beginPath(); g.arc(Math.cos(sa) * rPx * 1.55, Math.sin(sa) * rPx * .42, 7, 0, Math.PI * 2); g.fill();
      g.restore();
      // leader line to readout
      const lx = 960 + Math.cos(-.6) * rPx * 1.02, ly = 540 - Math.sin(-.6) * rPx * 1.02;
      const le = E.outExpo(prog(t, 5.25, 5.6));
      g.strokeStyle = rgba(C.paper, .6); g.lineWidth = 1;
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lerp(lx, 1480, le), lerp(ly, 812, le)); g.lineTo(lerp(lx, 1824, le), 812); g.stroke();
      g.fillStyle = C.paper; g.beginPath(); g.arc(lx, ly, 4, 0, Math.PI * 2); g.fill();
      const st = Math.min(3, Math.floor(P.uMorph + .5));
      const k = P.uMorph < 1 ? .5 : P.uMorph < 2 ? lerp(.5, .34, P.uSplit) : 0;
      txt('SIGNED DISTANCE FIELD', 1824, 840, .55, C.paper, 11, 'right');
      txt(`STEPS 120   SMIN K ${k.toFixed(2)}`, 1824, 864, .9, C.paper, 12, 'right');
      txt(`TWIST ${P.uTwist.toFixed(2)} RAD   T ${(t - 5).toFixed(3)}S`, 1824, 888, .9, C.paper, 12, 'right');
      // stage list
      txt('PRIMITIVE', 96, 150, .5, C.paper, 11);
      STAGES.forEach((nm, i) => {
        const on = i === st, y = 180 + i * 24;
        const e = E.outExpo(prog(t, 5.2 + i * .04, 5.5 + i * .04));
        txt(`${pad(i + 1)}  ${nm}`, 96 + 22 + (1 - e) * -30, y, (on ? 1 : .35) * e);
        if (on) { g.fillStyle = C.lime; g.fillRect(96, y - 9, 9, 9); }
      });
      g.globalAlpha = 1;
    }
  };
}

// ═════════════════════════ 04 · COLOR  (7.0 → 9.0) ═════════════════════════
const FLUID_FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime, uZoom;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
const mat2 M=mat2(.8,.6,-.6,.8);
float fbm(vec2 p){float f=0.,a=.5;for(int i=0;i<4;i++){f+=a*noise(p);p=M*p*2.03;a*=.5;}return f;}
vec3 ramp(float x){
  vec3 c0=vec3(.165,.231,1.),c1=vec3(.725,.659,1.),c2=vec3(1.,.561,.776),c3=vec3(1.,.251,.125),c4=vec3(1.,.541,.122),c5=vec3(.843,1.,.235);
  x=clamp(x,0.,1.)*5.;
  if(x<1.)return mix(c0,c1,smoothstep(0.,1.,x));
  if(x<2.)return mix(c1,c2,smoothstep(0.,1.,x-1.));
  if(x<3.)return mix(c2,c3,smoothstep(0.,1.,x-2.));
  if(x<4.)return mix(c3,c4,smoothstep(0.,1.,x-3.));
  return mix(c4,c5,smoothstep(0.,1.,x-4.));
}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y*uZoom;
  float t=uTime*.5;
  vec2 q=vec2(fbm(p+t*.3),fbm(p+vec2(5.2,1.3)-t*.25));
  vec2 r=vec2(fbm(p+2.2*q+vec2(1.7,9.2)+t*.5),fbm(p+2.2*q+vec2(8.3,2.8)-t*.4));
  float f=fbm(p+2.1*r);
  vec3 col=ramp(smoothstep(.22,.82,f*1.1+.25*r.x-.05));
  col=mix(col,vec3(.06,.07,.42),smoothstep(.55,.2,f)*.5);
  col+=.12*pow(clamp(q.y*1.2-.2,0.,1.),5.);
  col*=.92;
  gl_FragColor=vec4(col,1.);
}`;
const SWATCHES = [['VERMILION', C.verm, 'verm'], ['TANGERINE', C.tang, 'tang'], ['CHARTREUSE', C.lime, 'lime'], ['MINT', C.mint, 'mint'],
  ['COBALT', C.cobalt, 'cobalt'], ['LILAC', C.lilac, 'lilac'], ['PINK', C.pink, 'pink'], ['INK', C.ink, 'ink']];
// SYSTEMS grid (12 col, 24 gutter)
const SX = c => 96 + c * 146, SWD = n => n * 122 + (n - 1) * 24;
const RH = (820 - 48) / 3, SY = r => 150 + r * (RH + 24), SHD = n => n * RH + (n - 1) * 24;
const rectOf = ([c, n, r, m]) => ({ x: SX(c), y: SY(r), w: SWD(n), h: SHD(m) });
const L1 = { verm: [0, 5, 0, 1], lime: [5, 3, 0, 1], cobalt: [8, 4, 0, 1], mint: [0, 3, 1, 1], ink: [3, 6, 1, 2], pink: [9, 3, 1, 1], lilac: [0, 3, 2, 1], tang: [9, 3, 2, 1] };
const L2 = { ink: [0, 6, 0, 2], verm: [6, 6, 0, 1], cobalt: [6, 3, 1, 1], lime: [9, 3, 1, 1], pink: [0, 3, 2, 1], mint: [3, 3, 2, 1], tang: [6, 3, 2, 1], lilac: [9, 3, 2, 1] };
{
  const s = Scene('color', 7.0, 9.0, 34);
  const fcv = canvas(s.root, 960, 540, { width: W + 'px', height: H + 'px' });
  const fluid = glProgram(fcv, FLUID_FRAG);
  const head = h('div', { cls: 'a nw serif it', style: { fontSize: '128px', lineHeight: '150px', color: C.paper, textShadow: '0 4px 40px rgba(13,13,15,.18)' } }, s.root);
  const HW = ['Color,', 'with', 'intent.'].map(w => { const m = h('span', { cls: 'mask', style: { height: '150px', padding: '0 .08em' } }, head); return h('span', { cls: 'in', text: w }, m); });
  const wipe = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', background: C.paper } }, s.root);
  const PV = [960, 1012];
  const HEXCH = '0123456789ABCDEF';
  const sw = SWATCHES.map(([name, col, key], i) => {
    const e = h('div', { cls: 'a', style: { borderRadius: '16px', overflow: 'hidden', background: C.paper, zIndex: 10 + i } }, s.root);
    const chip = h('div', { cls: 'a', style: { width: '100%', background: col } }, e);
    const lab = h('div', { cls: 'a', style: { left: '0', top: '560px', width: '250px', height: '200px', padding: '22px 22px', boxSizing: 'border-box', color: C.ink } }, e);
    h('div', { cls: 'mono', text: `CL—${pad(i + 1)}`, style: { fontSize: '11px', opacity: .5 } }, lab);
    h('div', { text: name, style: { fontVariationSettings: "'wdth' 112, 'wght' 800", fontSize: '25px', marginTop: '12px', letterSpacing: '-.005em' } }, lab);
    const hex = h('div', { cls: 'mono', text: col.toUpperCase(), style: { fontSize: '15px', marginTop: '8px', letterSpacing: '.1em' } }, lab);
    h('div', { cls: 'mono', text: RGB(col).join(' · '), style: { fontSize: '11px', opacity: .5, marginTop: '6px' } }, lab);
    const rivet = h('div', { cls: 'a', style: { left: '113px', top: '708px', width: '24px', height: '24px', borderRadius: '50%', background: 'rgba(13,13,15,.14)', boxShadow: 'inset 0 2px 3px rgba(0,0,0,.3)' } }, e);
    return { e, chip, lab, hex, col, key, rivet, theta: -49 + 14 * i };
  });
  sfx(7.0, 'impact', { gain: .55, soft: 1 });
  SWATCHES.forEach((_, i) => sfx(7.02 + i * .03, 'flick', { gain: .35, pan: (i - 3.5) / 5 }));
  sfx(7.24, 'swoosh', { dur: .45, pan: 0, gain: .4 });
  sfx(8.0, 'shimmer', { dur: .5, gain: .45 });
  sfx(8.48, 'swoosh', { dur: .2, pan: .2, gain: .4 });
  SWATCHES.forEach((_, i) => sfx(8.9 + i * .012, 'tick', { f: 1200 + i * 110, gain: .2, pan: (i - 3.5) / 5 }));
  s.render = t => {
    fluid.draw({ uRes: [960, 540], uTime: t - 7.0 + 3.0, uZoom: lerp(3.4, 1.05, E.outExpo(prog(t, 7.0, 7.7))) });
    // headline
    HW.forEach((w, i) => {
      const e = E.outExpo(prog(t, 7.5 + i * .07, 7.95 + i * .07)), x = E.inCubic(prog(t, 8.38 + i * .03, 8.52 + i * .03));
      w.style.transform = `translateY(${((1 - e) * 105 - x * 105).toFixed(2)}%)`;
    });
    tf(head, 960, 196);
    const we = E.outExpo(prog(t, 8.6, 8.92));
    wipe.style.clipPath = `inset(${((1 - we) * 100).toFixed(3)}% 0 0 0)`;
    show(wipe, we > 0);
    // swatches
    sw.forEach((S, i) => {
      const rise = 950 * (1 - E.outExpo(prog(t, 7.0 + i * .03, 7.5 + i * .03)));
      let th = S.theta * E.outBack(prog(t, 7.2 + i * .012, 7.74 + i * .012), 1.3);
      th += 2.2 * Math.sin(2 * Math.PI * (t - 7.7) * 1.1) * prog(t, 7.7, 7.95) * (1 - prog(t, 8.3, 8.48));
      th *= 1 - E.inBack(prog(t, 8.46, 8.66), 1.4);
      const lift = 70 * bell(t, 8.03 + i * .045, .07) + 16 * bell(t, 7.74 + i * .012, .06);
      const arm = 340 + lift, rad = th * Math.PI / 180;
      let cx = PV[0] + Math.sin(rad) * arm, cy = PV[1] - Math.cos(rad) * arm + rise;
      let w = 250, hh = 760, br = 16;
      const T = rectOf(L1[S.key]);
      const f = E.outExpo(prog(t, 8.62 + i * .02, 8.985));
      cx = lerp(cx, T.x + T.w / 2, f); cy = lerp(cy, T.y + T.h / 2, f);
      w = lerp(w, T.w, f); hh = lerp(hh, T.h, f); br = lerp(16, 20, f); th = lerp(th, 0, f);
      css(S.e, { width: w + 'px', height: hh + 'px', borderRadius: br + 'px', transform: `translate(${(cx - w / 2).toFixed(2)}px,${(cy - hh / 2).toFixed(2)}px) rotate(${th.toFixed(3)}deg)`,
        boxShadow: `0 ${30 * (1 - f)}px ${60 * (1 - f)}px rgba(0,0,0,${.26 * (1 - f)}), 0 2px 6px rgba(0,0,0,${.18 * (1 - f)})` });
      S.chip.style.height = lerp(560, hh, f) + 'px';
      S.lab.style.opacity = 1 - prog(f, 0, .4);
      S.rivet.style.opacity = 1 - prog(f, 0, .3);
      // hex scramble
      const hx = S.col.toUpperCase();
      let str = '#';
      const fr = Math.floor(t * FPS);
      for (let c = 1; c < 7; c++) str += t >= 7.3 + c * .05 + i * .02 ? hx[c] : HEXCH[(fr * 7 + c * 13 + i * 5) % 16];
      S.hex.textContent = str;
    });
  };
}

// ═════════════════════════ 05 · SYSTEMS  (9.0 → 11.0) ═════════════════════════
{
  const s = Scene('systems', 9.0, 11.0, 33);
  css(s.root, { background: C.paper });
  const base = canvas(s.root), bg = base.getContext('2d');
  bg.strokeStyle = rgba(C.ink, .045); bg.lineWidth = 1;
  for (let y = 6; y < H; y += 24) { bg.beginPath(); bg.moveTo(0, y + .5); bg.lineTo(W, y + .5); bg.stroke(); }
  const cols = Array.from({ length: 12 }, (_, c) => {
    const d = h('div', { cls: 'a', style: { left: SX(c) + 'px', top: '120px', width: '122px', height: '880px', background: rgba(C.verm, .07), borderLeft: `1px solid ${rgba(C.verm, .35)}`, borderRight: `1px solid ${rgba(C.verm, .35)}`, boxSizing: 'border-box', transformOrigin: '50% 0' } }, s.root);
    const l = h('div', { cls: 'a mono', text: pad(c + 1), style: { left: (SX(c) + 61) + 'px', top: '98px', fontSize: '11px', color: C.verm, transform: 'translateX(-50%)' } }, s.root);
    return { d, l };
  });
  const spec = h('div', { cls: 'a mono', html: `12 COL <span style="opacity:.4">/</span> 24 GUTTER <span style="opacity:.4">/</span> 8PT BASELINE`, style: { left: '96px', top: '70px', fontSize: '11px', color: C.verm } }, s.root);
  const grid = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', transformOrigin: '0 0' } }, s.root);
  const TCOL = { verm: C.verm, tang: C.tang, lime: C.lime, mint: C.mint, cobalt: C.cobalt, lilac: C.lilac, pink: C.pink, ink: C.ink };
  const tiles = {};
  const ORDER = ['verm', 'lime', 'cobalt', 'mint', 'ink', 'pink', 'lilac', 'tang'];
  ORDER.forEach((k, i) => {
    const dark = k === 'ink' || k === 'cobalt';
    const e = h('div', { cls: 'tile', style: { background: TCOL[k], color: dark ? C.paper : C.ink } }, grid);
    const inner = h('div', { cls: 'a', style: { width: '100%', height: '100%' } }, e);
    tiles[k] = { e, inner, i, dark };
  });
  const lab = (k, a, b) => { h('div', { cls: 'tl', text: a, style: { opacity: .7 } }, tiles[k].inner); h('div', { cls: 'tr', text: b, style: { opacity: .45 } }, tiles[k].inner); };
  lab('verm', 'TYPE SCALE', '01'); lab('lime', 'TOGGLE', '02'); lab('cobalt', 'DATA', '03'); lab('mint', 'ICONS · 24 / 2PX', '04');
  lab('ink', 'BRAND · LOCKUP V3', '05'); lab('pink', 'SLIDER', '06'); lab('lilac', 'AVATARS', '07'); lab('tang', 'BUTTON / PRIMARY', '08');
  // verm — type specimen
  const aa = h('div', { cls: 'a nw', text: 'Aa', style: { left: '26px', top: 'auto', bottom: '-6px', fontSize: '190px', lineHeight: '190px', color: C.ink } }, tiles.verm.inner);
  const vspec = h('div', { cls: 'a', style: { left: 'auto', top: 'auto', right: '26px', bottom: '26px', textAlign: 'right', color: C.ink } }, tiles.verm.inner);
  const vs1 = h('div', { cls: 'mono', text: 'ARCHIVO VARIABLE', style: { fontSize: '12px', marginBottom: '10px' } }, vspec);
  const vs2 = h('div', { cls: 'mono', style: { fontSize: '12px', opacity: .6 } }, vspec);
  const vs3 = h('div', { cls: 'mono', style: { fontSize: '12px', opacity: .6, marginTop: '4px' } }, vspec);
  const vtrack = h('div', { style: { position: 'relative', width: '200px', height: '4px', background: 'rgba(13,13,15,.2)', marginTop: '14px', marginLeft: 'auto', borderRadius: '2px' } }, vspec);
  const vknob = h('div', { cls: 'a', style: { top: '-6px', width: '16px', height: '16px', borderRadius: '50%', background: C.ink } }, vtrack);
  // lime — toggle
  const tg = h('div', { cls: 'a', style: { left: '50%', top: '50%', width: '176px', height: '96px', borderRadius: '48px', transform: 'translate(-50%,-44%)' } }, tiles.lime.inner);
  const tk = h('div', { cls: 'a', style: { top: '8px', height: '80px', borderRadius: '40px', background: C.paper, boxShadow: '0 4px 10px rgba(0,0,0,.25)' } }, tg);
  const tgl = h('div', { cls: 'a mono', style: { left: '50%', top: 'auto', bottom: '22px', transform: 'translateX(-50%)', fontSize: '12px' } }, tiles.lime.inner);
  // cobalt — data
  const dcv = canvas(tiles.cobalt.inner, 520, 190, { left: '20px', top: 'auto', bottom: '14px' }), dg = dcv.getContext('2d');
  const big = h('div', { cls: 'a nw', style: { left: 'auto', right: '24px', top: '44px', fontSize: '66px', lineHeight: '66px', fontVariationSettings: "'wdth' 100, 'wght' 850", color: C.paper } }, tiles.cobalt.inner);
  const R1 = rng(5), D1 = Array.from({ length: 11 }, () => .25 + .75 * R1()), D2 = Array.from({ length: 11 }, () => .2 + .8 * R1());
  // mint — icons
  const icv = canvas(tiles.mint.inner, 360, 110, { left: '50%', top: '50%', transform: 'translate(-50%,-38%)' }), ig = icv.getContext('2d');
  // ink — brand lockup
  const ccv = canvas(tiles.ink.inner, 852, 540, { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }), cg = ccv.getContext('2d');
  const wm = h('div', { cls: 'a nw serif', text: 'Claude', style: { left: '50%', top: '50%', fontSize: '150px', lineHeight: '150px', color: C.paper } }, tiles.ink.inner);
  // pink — slider
  const sl = h('div', { cls: 'a', style: { left: '50%', top: '56%', width: '300px', height: '10px', borderRadius: '5px', background: 'rgba(13,13,15,.18)', transform: 'translate(-50%,-50%)' } }, tiles.pink.inner);
  const slf = h('div', { cls: 'a', style: { height: '10px', borderRadius: '5px', background: C.ink } }, sl);
  const slk = h('div', { cls: 'a', style: { top: '-17px', width: '44px', height: '44px', borderRadius: '50%', background: C.ink, border: `4px solid ${C.paper}`, boxSizing: 'border-box' } }, sl);
  const slv = h('div', { cls: 'a mono', style: { top: '-62px', fontSize: '13px', background: C.ink, color: C.paper, padding: '5px 8px', borderRadius: '5px' } }, sl);
  // lilac — avatars
  const av = h('div', { cls: 'a', style: { left: '50%', top: '54%', width: '0', height: '0' } }, tiles.lilac.inner);
  const AVS = [[C.verm, 'AK'], [C.cobalt, 'MR'], [C.lime, 'JL'], [C.ink, 'SO'], [C.paper, '+9']].map(([c, n], i) => h('div', { cls: 'a mono', text: n, style: {
    width: '84px', height: '84px', borderRadius: '50%', background: c, border: `5px solid ${C.lilac}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '17px', color: c === C.ink || c === C.cobalt ? C.paper : C.ink, left: (-190 + i * 64) + 'px', top: '-42px', zIndex: 10 - i } }, av));
  // tang — button + cursor
  const btn = h('div', { cls: 'a nw', html: 'Get started&nbsp;&nbsp;→', style: { left: '50%', top: '54%', padding: '22px 34px', borderRadius: '44px', background: C.ink, color: C.paper, fontSize: '24px', fontVariationSettings: "'wdth' 100, 'wght' 600", overflow: 'hidden' } }, tiles.tang.inner);
  const ripple = h('div', { cls: 'a', style: { width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(238,233,223,.35)' } }, btn);
  const cur = h('div', { cls: 'a', html: `<svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 22 L28 22 Z" fill="${C.paper}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/></svg>` }, tiles.tang.inner);
  sfx(9.0, 'impact', { gain: .45, soft: 1 });
  for (let c = 0; c < 12; c++) sfx(9.0 + c * .015, 'tick', { f: 2600 + c * 60, gain: .08, pan: (c - 5.5) / 7 });
  ORDER.forEach((_, i) => sfx(9.04 + i * .03, 'pop', { f: 600 + i * 70, gain: .22, pan: (i - 3.5) / 5 }));
  [9.5, 10.0, 10.5].forEach(tt => sfx(tt, 'click', { gain: .45, pan: .1 }));
  sfx(9.78, 'click', { gain: .5, pan: .5 });
  sfx(10.0, 'swoosh', { dur: .4, pan: -.2, gain: .5 });
  sfx(10.5, 'riser', { dur: .5, gain: .6 });
  s.render = t => {
    // guides
    const go = 1 - prog(t, 10.38, 10.6);
    cols.forEach(({ d, l }, c) => {
      const e = E.outExpo(prog(t, 9.0 + c * .016, 9.45 + c * .016));
      d.style.transform = `scaleY(${e.toFixed(4)})`; d.style.opacity = go;
      l.style.opacity = go * prog(t, 9.1 + c * .016, 9.2 + c * .016);
    });
    spec.style.opacity = go * prog(t, 9.1, 9.25);
    base.style.opacity = go;
    // zoom into the vermilion tile
    const Z = E.inExpo(prog(t, 10.55, 11.0));
    const TV = rectOf(L2.verm), tcx = TV.x + TV.w / 2, tcy = TV.y + TV.h / 2;
    const S = lerp(1, Math.max(W / TV.w, H / TV.h) * 1.12, Z);
    const ox = lerp(tcx, 960, Z) - S * tcx, oy = lerp(tcy, 540, Z) - S * tcy;
    grid.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px) scale(${S.toFixed(4)})`;
    // layout interpolation
    for (const k of ORDER) {
      const T = tiles[k], a = rectOf(L1[k]), b = rectOf(L2[k]);
      const p = prog(t, 10.0 + T.i * .022, 10.4 + T.i * .022), e = E.outExpo(p);
      const lift = 1 - .045 * Math.sin(Math.PI * clamp(p * 1.4));
      const x = lerp(a.x, b.x, e), y = lerp(a.y, b.y, e), w = lerp(a.w, b.w, e), hh = lerp(a.h, b.h, e);
      css(T.e, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px', transform: `scale(${lift.toFixed(4)})`, zIndex: p > 0 && p < 1 ? 5 : 1 });
      const ce = E.outExpo(prog(t, 9.04 + T.i * .03, 9.4 + T.i * .03));
      T.inner.style.opacity = ce * (k === 'verm' ? 1 - prog(t, 10.55, 10.72) : 1);
      T.inner.style.transform = `translateY(${(1 - ce) * 24}px)`;
    }
    // verm
    const wg = 520 + 380 * Math.sin(2 * Math.PI * (t - 9.0) * .9), wd = 100 + 25 * Math.sin(2 * Math.PI * (t - 9.0) * .6 + 1.2);
    vf(aa, wd, wg);
    vs2.textContent = `WGHT ${Math.round(wg)}`; vs3.textContent = `WDTH ${Math.round(wd)}`;
    vknob.style.left = ((wg - 100) / 800 * 184) + 'px';
    // lime toggle
    const flips = [9.5, 10.0, 10.5].filter(x => t >= x);
    const on = flips.length % 2 === 1, last = flips.length ? flips[flips.length - 1] : 9.0;
    const sp = flips.length ? spring(t - last, 3.2, .55) : 1;
    const from = on ? 0 : 1, to = on ? 1 : 0, kp = lerp(from, to, clamp(sp, -.2, 1.2));
    const stretch = flips.length ? 22 * bell(t, last + .06, .06) : 0;
    const kw = 80 + stretch;
    css(tk, { width: kw + 'px', left: (8 + clamp(kp, -.1, 1.1) * (80 - stretch)).toFixed(2) + 'px' });
    tg.style.background = mixc('#BCD62F', C.ink, clamp(kp));
    tgl.innerHTML = `MOTION&nbsp;&nbsp;<b>${kp > .5 ? 'ON' : 'OFF'}</b>`;
    // cobalt data
    dg.clearRect(0, 0, 520, 190);
    const dm = E.outExpo(prog(t, 10.0, 10.4));
    const pts = [];
    for (let i = 0; i < 11; i++) {
      const gr = E.outBack(prog(t, 9.12 + i * .03, 9.5 + i * .03), 1.6);
      const v = lerp(D1[i], D2[i], dm) * gr, bh = v * 104, x = i * 40;
      dg.fillStyle = rgba(C.paper, i === 10 ? 1 : .85); dg.fillRect(x, 186 - bh, 24, bh);
      pts.push([x + 12, 186 - bh - 16]);
    }
    const lp = E.outCubic(prog(t, 9.3, 9.7));
    dg.strokeStyle = C.lime; dg.lineWidth = 3; dg.beginPath();
    pts.forEach(([x, y], i) => { if (i / 10 <= lp) (i ? dg.lineTo : dg.moveTo).call(dg, x, y); }); dg.stroke();
    dg.fillStyle = C.lime; pts.forEach(([x, y], i) => { if (i / 10 <= lp) { dg.beginPath(); dg.arc(x, y, 5, 0, Math.PI * 2); dg.fill(); } });
    big.textContent = `+${Math.round(248 * E.outExpo(prog(t, 9.1, 9.7)))}%`;
    // mint icons
    ig.clearRect(0, 0, 360, 110);
    ig.strokeStyle = C.ink; ig.lineWidth = 6; ig.lineCap = 'round'; ig.lineJoin = 'round';
    const beatK = (x0) => { let a = 0; for (const b of [9.5, 10.0, 10.5]) if (t >= b) a += spring(t - b, 3, .5); return a; };
    ig.save(); ig.translate(45, 55); ig.rotate(beatK() * Math.PI / 4);
    ig.beginPath(); ig.moveTo(-26, 0); ig.lineTo(26, 0); ig.moveTo(0, -26); ig.lineTo(0, 26); ig.stroke(); ig.restore();
    const ax = 135 + 10 * Math.sin((t - 9) * 9);
    ig.beginPath(); ig.moveTo(ax - 26, 55); ig.lineTo(ax + 24, 55); ig.moveTo(ax + 6, 37); ig.lineTo(ax + 24, 55); ig.lineTo(ax + 6, 73); ig.stroke();
    const ck = ((t - 9.1) % .5) / .5, cke = E.outCubic(clamp(ck * 1.6));
    const cpts = [[205, 57], [222, 74], [255, 38]];
    ig.beginPath(); ig.moveTo(...cpts[0]);
    if (cke < .35) ig.lineTo(lerp(cpts[0][0], cpts[1][0], cke / .35), lerp(cpts[0][1], cpts[1][1], cke / .35));
    else { ig.lineTo(...cpts[1]); const q = (cke - .35) / .65; ig.lineTo(lerp(cpts[1][0], cpts[2][0], q), lerp(cpts[1][1], cpts[2][1], q)); }
    ig.stroke();
    drawSegs(ig, 315, 55, STAR4.map(a => [a, 28, 8]), (t - 9) * 120, C.ink);
    // ink brand lockup
    const le = E.outExpo(prog(t, 9.1, 9.5));
    const starR = 64, sx = 426 - 250, sy = 270;
    cg.clearRect(0, 0, 852, 540);
    const ce = E.outCubic(prog(t, 9.12, 9.6));
    cg.strokeStyle = rgba(C.paper, .22); cg.lineWidth = 1;
    const L = (x0, y0, x1, y1) => { cg.beginPath(); cg.moveTo(lerp((x0 + x1) / 2, x0, ce), lerp((y0 + y1) / 2, y0, ce)); cg.lineTo(lerp((x0 + x1) / 2, x1, ce), lerp((y0 + y1) / 2, y1, ce)); cg.stroke(); };
    L(0, sy, 852, sy); L(sx, 0, sx, 540);
    L(sx - 270, sy - 270, sx + 270, sy + 270); L(sx - 270, sy + 270, sx + 270, sy - 270);
    const wmBase = sy + 150 * (.84 - .5) + 0, wmX = sx + starR + 40;
    L(0, wmBase, 852, wmBase); L(0, wmBase - 150 * .72, 852, wmBase - 150 * .72); L(0, wmBase - 150 * .51, 852, wmBase - 150 * .51);
    cg.setLineDash([3, 5]); cg.beginPath(); cg.arc(sx, sy, starR * 1.25 * ce, 0, Math.PI * 2); cg.stroke(); cg.beginPath(); cg.arc(sx, sy, starR * .5 * ce, 0, Math.PI * 2); cg.stroke(); cg.setLineDash([]);
    cg.font = '500 10px Mono'; cg.letterSpacing = '1.5px'; cg.fillStyle = rgba(C.paper, .5 * ce);
    cg.fillText('BASELINE', 24, wmBase - 8); cg.fillText('CAP', 24, wmBase - 150 * .72 - 8); cg.fillText('X', 24, wmBase - 150 * .51 - 8);
    cg.fillText('1X', sx + starR * 1.25 + 6, sy - 6);
    cg.strokeStyle = rgba(C.lime, .9 * ce); cg.beginPath(); cg.moveTo(sx + starR, sy + 110); cg.lineTo(wmX, sy + 110); cg.stroke();
    cg.fillStyle = rgba(C.lime, .9 * ce); cg.fillText('40', (sx + starR + wmX) / 2 - 7, sy + 126);
    let sr = 0; for (const b of [9.5, 10.0, 10.5]) if (t >= b) sr += 45 * spring(t - b, 2.6, .45);
    const pop = spring(t - 9.1, 2.8, .45);
    drawSegs(cg, sx, sy, STAR4.map(a => [a, starR * pop, starR * .3 * pop]), sr - 90 * (1 - le), C.verm);
    wm.style.transform = `translate(${(wmX - 426).toFixed(1)}px, ${(-75 + (1 - le) * 40).toFixed(1)}px)`;
    wm.style.opacity = le;
    // pink slider
    const SV = [[9.0, .3], [9.5, .72], [10.0, .45], [10.5, .88]];
    let v = .3; for (let i = 1; i < SV.length; i++) if (t >= SV[i][0]) v = lerp(SV[i - 1][1], SV[i][1], clamp(spring(t - SV[i][0], 2.6, .5), -.2, 1.2));
    slf.style.width = (v * 300) + 'px'; slk.style.left = (v * 300 - 22) + 'px';
    slv.textContent = Math.round(v * 100); slv.style.left = (v * 300) + 'px'; slv.style.transform = 'translateX(-50%)';
    // lilac avatars
    AVS.forEach((a, i) => { const e = spring(t - 9.12 - i * .045, 2.8, .5); a.style.transform = `translateX(${(1 - e) * 60}px) scale(${clamp(e, 0, 1.2)})`; a.style.opacity = clamp(e * 2); });
    // tang button
    const cp = E.outCubic(prog(t, 9.46, 9.74));
    const bw = btn.offsetWidth, bh2 = btn.offsetHeight;
    const press = bell(t, 9.8, .045);
    btn.style.transform = `translate(-50%,-50%) scale(${(1 - .06 * press).toFixed(4)})`;
    const rp = prog(t, 9.78, 10.1);
    css(ripple, { left: (bw * .62 - 20) + 'px', top: (bh2 / 2 - 20) + 'px', transform: `scale(${(rp * 9).toFixed(3)})`, opacity: rp > 0 ? (1 - rp) : 0 });
    const tw2 = tiles.tang.e.offsetWidth, th2 = tiles.tang.e.offsetHeight;
    const cx0 = tw2 * .92, cy0 = th2 * 1.05, cx1 = tw2 / 2 + bw * .12, cy1 = th2 * .54;
    cur.style.transform = `translate(${lerp(cx0, cx1, cp).toFixed(1)}px,${lerp(cy0, cy1, cp).toFixed(1)}px) scale(${1 - .12 * press})`;
  };
}

// ═════════════════════════ 06 · RANGE — montage  (11.0 → 12.0) ═════════════════════════
const PUSH = [[11.25, [1, 0]], [11.5, [0, 1]], [11.75, [-1, 0]], [12.0, [0, 1]]];
const pushAt = (t, T) => E.outExpo(prog(t, T, T + .16));
{
  const s = Scene('montage', 11.0, 12.17, 40);
  const panels = [C.verm, C.ink, C.paper, C.cobalt].map(c => h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', background: c, overflow: 'hidden' } }, s.root));
  // P1 · BRAND
  const brand = h('div', { cls: 'a nw', style: { fontSize: '360px', lineHeight: '264px', height: '264px', color: C.ink, letterSpacing: '-.02em' } }, panels[0]);
  const BL = [...'BRAND'].map(ch => { const m = h('span', { cls: 'mask', style: { height: '264px' } }, brand); return h('span', { cls: 'in', text: ch }, m); });
  const bstar = h('div', { cls: 'a', html: starSVG(96, C.paper, .22) }, panels[0]);
  h('div', { cls: 'a mono', text: 'IDENTITY SYSTEMS', style: { left: '96px', top: '140px', color: C.ink } }, panels[0]);
  h('div', { cls: 'a mono', text: '01 / 04', style: { left: 'auto', right: '96px', top: '140px', color: C.ink } }, panels[0]);
  // P2 · INTERFACE
  const iword = h('div', { cls: 'a nw serif it', text: 'Interface', style: { fontSize: '290px', lineHeight: '290px', color: C.paper } }, panels[1]);
  const ibox = h('div', { cls: 'a', style: { border: `2px solid ${C.lime}`, boxSizing: 'border-box' } }, panels[1]);
  const ihand = [0, 1, 2, 3].map(() => h('div', { cls: 'a', style: { width: '14px', height: '14px', background: C.ink, border: `2px solid ${C.lime}`, boxSizing: 'border-box' } }, ibox));
  const itag = h('div', { cls: 'a mono', style: { background: C.lime, color: C.ink, padding: '6px 10px', borderRadius: '4px', fontSize: '12px' } }, panels[1]);
  const icur = h('div', { cls: 'a', html: `<svg width="40" height="48" viewBox="0 0 34 40"><path d="M3 2 L3 32 L11 25 L17 38 L23 35 L17 22 L28 22 Z" fill="${C.lime}" stroke="${C.ink}" stroke-width="2.5" stroke-linejoin="round"/></svg>` }, panels[1]);
  h('div', { cls: 'a mono', text: 'INTERFACE & PRODUCT', style: { left: '96px', top: '140px', color: C.paper } }, panels[1]);
  h('div', { cls: 'a mono', text: '02 / 04', style: { left: 'auto', right: '96px', top: '140px', color: C.paper } }, panels[1]);
  // P3 · EDITORIAL
  const ed = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px' } }, panels[2]);
  h('div', { cls: 'a', style: { left: '96px', top: '170px', width: '1728px', height: '3px', background: C.ink } }, ed);
  h('div', { cls: 'a mono', html: 'ISSUE Nº 26 <span style="opacity:.4">—</span> AUTUMN', style: { left: '96px', top: '140px', color: C.ink } }, ed);
  h('div', { cls: 'a mono', text: '03 / 04', style: { left: 'auto', right: '96px', top: '140px', color: C.ink } }, ed);
  const EL = ['The shape', 'of quiet', 'things.'].map((w, i) => { const m = h('div', { cls: 'a', style: { left: '90px', top: (230 + i * 190) + 'px', height: '236px', overflow: 'hidden' } }, ed); return h('div', { cls: 'serif nw', text: w, style: { fontSize: '200px', lineHeight: '200px', color: C.ink, fontStyle: i === 1 ? 'italic' : 'normal' } }, m); });
  const ebars = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 22; r++) {
    const wv = r % 7 === 6 ? .45 : .82 + .18 * Math.sin(r * 3.1 + c);
    ebars.push(h('div', { cls: 'a', style: { left: (1130 + c * 270) + 'px', top: (240 + r * 32) + 'px', width: (240 * wv) + 'px', height: '10px', background: rgba(C.ink, .22), transformOrigin: '0 0' } }, ed));
  }
  const eblock = h('div', { cls: 'a', style: { left: '1690px', top: '240px', width: '134px', height: '700px', background: C.verm } }, ed);
  h('div', { cls: 'a nw', text: 'Nº 26', style: { left: '1757px', top: '796px', fontSize: '64px', fontVariationSettings: "'wdth' 125, 'wght' 900", color: C.ink, transform: 'translate(-50%,-50%) rotate(-90deg)', transformOrigin: '50% 50%' } }, ed);
  // P4 · 3D
  const d3 = h('div', { cls: 'a nw', text: '3D', style: { fontSize: '760px', lineHeight: '560px', height: '560px', color: 'transparent', webkitTextStroke: `3px ${rgba(C.paper, .4)}`, fontVariationSettings: "'wdth' 125, 'wght' 900" } }, panels[3]);
  const g4 = canvas(panels[3]); const blob4 = glProgram(g4, BLOB_FRAG);
  h('div', { cls: 'a mono', text: '3D & MATERIAL', style: { left: '96px', top: '140px', color: C.paper } }, panels[3]);
  h('div', { cls: 'a mono', text: '04 / 04', style: { left: 'auto', right: '96px', top: '140px', color: C.paper } }, panels[3]);
  sfx(11.0, 'impact', { gain: .7, soft: 1 });
  PUSH.forEach(([T], i) => { sfx(T - .02, 'whoosh', { dur: .2, pan: [.6, 0, -.6, 0][i], gain: .65 }); sfx(T, 'hit', { gain: .6 }); });
  s.render = t => {
    const T0 = [11.0, 11.25, 11.5, 11.75];
    panels.forEach((p, k) => {
      const tin = T0[k], tout = PUSH[k][0];
      const on = t >= tin && t < tout + .17;
      show(p, on); if (!on) return;
      let ox = 0, oy = 0;
      if (k > 0) { const [dx, dy] = PUSH[k - 1][1], e = pushAt(t, tin); ox += dx * (1 - e) * W; oy += dy * (1 - e) * H; }
      { const [dx, dy] = PUSH[k][1], e = pushAt(t, tout); ox -= dx * e * W; oy -= dy * e * H; }
      p.style.transform = `translate(${ox.toFixed(1)}px,${oy.toFixed(1)}px)`;
    });
    // P1
    {
      const u = t - 11.0;
      BL.forEach((l, i) => { const e = E.outExpo(prog(u, i * .018, .22 + i * .018)); l.style.transform = `translateY(${((1 - e) * 104).toFixed(2)}%)`; vf(l, lerp(70, 125, E.outExpo(prog(u, .02 + i * .02, .3 + i * .02))), 900); });
      tf(brand, 960, 560, { s: lerp(1.12, 1, E.outExpo(prog(u, 0, .4))) - .02 * u });
      const bw = brand.offsetWidth * (1.12 - .12 * E.outExpo(prog(u, 0, .4)));
      tf(bstar, 960 + bw / 2 - 20, 372, { s: spring(u - .06, 3, .45), r: u * 260 });
    }
    // P2
    {
      const u = t - 11.25;
      tf(iword, 960, 560);
      const ww = iword.offsetWidth + 60, wh = 300;
      const drag = E.outCubic(prog(u, .1, .3)) * 90;
      const bx = 960 - ww / 2, by = 560 - wh / 2 + 16;
      const be = E.outExpo(prog(u, 0, .12));
      css(ibox, { left: bx + 'px', top: by + 'px', width: (ww + drag) + 'px', height: (wh + drag * .2) + 'px', opacity: be });
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b], i) => css(ihand[i], { left: (a * (ww + drag) - 7) + 'px', top: (b * (wh + drag * .2) - 7) + 'px' }));
      itag.textContent = `W ${Math.round(ww + drag)}  H ${Math.round(wh + drag * .2)}`;
      css(itag, { left: (bx + (ww + drag) / 2) + 'px', top: (by + wh + drag * .2 + 16) + 'px', transform: 'translateX(-50%)', opacity: be });
      const cx = lerp(1600, bx + ww - 4, E.outCubic(prog(u, 0, .1))) + drag, cy = lerp(900, by + wh - 4, E.outCubic(prog(u, 0, .1))) + drag * .2;
      icur.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
      iword.style.transform += ` scaleX(${(1 + drag / ww).toFixed(4)})`;
    }
    // P3
    {
      const u = t - 11.5;
      EL.forEach((l, i) => { const e = E.outExpo(prog(u, i * .03, .28 + i * .03)); l.style.transform = `translateY(${((1 - e) * 100).toFixed(2)}%)`; });
      ebars.forEach((b, i) => { b.style.transform = `scaleX(${E.outExpo(prog(u, .02 + (i % 22) * .006 + Math.floor(i / 22) * .03, .3 + (i % 22) * .006))})`; });
      eblock.style.transform = `scaleY(${E.outExpo(prog(u, 0, .25))})`; eblock.style.transformOrigin = '0 0';
      ed.style.transform = `translateY(${(-u * 40).toFixed(1)}px)`;
    }
    // P4
    if (t >= 11.75) {
      const u = t - 11.75;
      tf(d3, 960, 560, { s: lerp(1.15, 1, E.outExpo(prog(u, 0, .4))) });
      blob4.draw({ uRes: [W, H], uCenter: [960, 560], uFocal: 1080, uTime: u + 1.3, uMorph: 1.0, uSplit: .95, uTwist: 0, uWob: 0, uCamD: 4.2,
        uScale: lerp(.7, 1.05, E.outExpo(prog(u, 0, .3))), uFlat: 0, uEnvRot: u * 2 + 1, uRot: [.4, u * 3, .2], uTint: [1, 1, 1] });
    }
  };
}

// ═════════════════════════ word drum  (12.0 → 13.0) ═════════════════════════
const DRUM = { N: 12, FH: 170, P: 1500 };
DRUM.R = DRUM.FH / 2 / Math.tan(Math.PI / DRUM.N);
DRUM.K = DRUM.P / (DRUM.P - DRUM.R);
{
  // angular velocity profile → normalised cumulative, so the drum lands exactly on face 0 at 13.0
  const TH = 360 * 3 + 30 * 5, NS = 2000, v = i => { const p = i / NS; return p < .2 ? E.outQuad(p / .2) : p < .74 ? 1 : lerp(1, .09, E.ioCubic((p - .74) / .26)); };
  const cum = [0]; for (let i = 1; i <= NS; i++) cum.push(cum[i - 1] + (v(i - 1) + v(i)) / 2);
  const tot = cum[NS], vEnd = TH * v(NS) / (tot / NS);
  DRUM.phi = t => {
    if (t <= 12.0) return TH;
    if (t < 13.0) { const x = (t - 12.0) * NS, i = Math.floor(x); return TH * (1 - lerp(cum[i], cum[Math.min(NS, i + 1)], x - i) / tot); }
    const u = t - 13.0, w = 2 * Math.PI * 3.4, z = .32;
    return -(vEnd / w) * Math.exp(-z * w * u) * Math.sin(w * u);
  };
  // face-change ticks for the sound design
  let last = Math.round(DRUM.phi(12.0) / 30);
  for (let t = 12.0; t < 13.0; t += 1 / 2000) { const f = Math.round(DRUM.phi(t) / 30); if (f !== last) { sfx(t, 'ratchet', { gain: .35 + .25 * prog(t, 12, 12.6) }); last = f; } }
}
{
  const s = Scene('drum', 12.0, 13.45, 60);
  css(s.root, { background: C.ink });
  const persp = h('div', { cls: 'a', style: { width: W + 'px', height: H + 'px', perspective: DRUM.P + 'px', perspectiveOrigin: '960px 540px' } }, s.root);
  const drum = h('div', { cls: 'a', style: { left: '960px', top: '540px', transformStyle: 'preserve-3d' } }, persp);
  const WORDS = ['CLAUDE', 'MOTION', 'TYPOGRAPHY', 'BRAND', '3D', 'SYSTEMS', 'EDITORIAL', 'INTERFACE', 'COLOR', 'ART DIRECTION', 'KINETIC', 'IDENTITY'];
  const faces = WORDS.map(w => h('div', { cls: 'a face', text: w }, drum));
  const win = [-1, 1].map(d => h('div', { cls: 'a', style: { left: '300px', top: (540 + d * 122) + 'px', width: '1320px', height: '1px', background: rgba(C.paper, .28), transformOrigin: '50% 50%' } }, s.root));
  const role = h('div', { cls: 'a mono', text: 'ROLE', style: { left: '300px', top: '532px', color: rgba(C.paper, .55) } }, s.root);
  const ctr = h('div', { cls: 'a mono', style: { left: 'auto', right: '300px', top: '532px', color: rgba(C.paper, .55) } }, s.root);
  sfx(12.0, 'riser', { dur: 1.0, gain: .9 });
  s.render = t => {
    s.root.style.transform = `translateY(${((1 - pushAt(t, 12.0)) * H).toFixed(1)}px)`;
    const phi = DRUM.phi(t);
    drum.style.transform = `rotateX(${phi.toFixed(3)}deg)`;
    const burst = E.outExpo(prog(t, 13.0, 13.4));
    faces.forEach((f, k) => {
      const a = ((phi - 30 * k) % 360 + 540) % 360 - 180, c = Math.cos(a * Math.PI / 180);
      const R = DRUM.R + (k ? burst * 500 : 0);
      f.style.transform = `rotateX(${(-30 * k).toFixed(1)}deg) translateZ(${R.toFixed(1)}px) translate(-50%,-50%)`;
      const front = Math.abs(a) < 15;
      f.style.opacity = (k === 0 && t >= 13.0) ? 0 : (clamp((c - .15) / .85) ** 1.4 * (front ? 1 : .55) * (k ? 1 - burst : 1)).toFixed(3);
    });
    const we = E.outExpo(prog(t, 12.04, 12.4)) * (1 - prog(t, 13.0, 13.2));
    win.forEach(l => { l.style.transform = `scaleX(${we.toFixed(4)})`; });
    role.style.opacity = ctr.style.opacity = we;
    const fi = ((Math.round(phi / 30) % 12) + 12) % 12;
    ctr.textContent = `${pad(fi === 0 ? 12 : fi)} / 12`;
  };
}

// ═════════════════════════ 07 · HELLO — end card  (13.0 → 15.0) ═════════════════════════
{
  const s = Scene('end', 13.0, 15.0, 70);
  const cv = canvas(s.root), g = cv.getContext('2d');
  const name = h('div', { cls: 'a nw', style: { color: C.paper, letterSpacing: '-.01em' } }, s.root);
  const NL = [...'CLAUDE'].map(ch => { const m = h('span', { cls: 'mask', style: { height: '.75em', lineHeight: '.75em' } }, name); return h('span', { cls: 'in', text: ch }, m); });
  const sub = h('div', { cls: 'a nw serif it', style: { fontSize: '62px', lineHeight: '76px', color: rgba(C.paper, .88) } }, s.root);
  const SW2 = ['Designer', 'of', 'motion,', 'type', '&', 'systems.'].map(w => { const m = h('span', { cls: 'mask', style: { height: '76px', padding: '0 .12em' } }, sub); return h('span', { cls: 'in', text: w }, m); });
  const rule = h('div', { cls: 'a', style: { left: '96px', top: '880px', width: '1728px', height: '1px', background: rgba(C.paper, .3) } }, s.root);
  const META = [['SHOWREEL 2026 — 15 SEC', 96, 0], ['EVERY FRAME WRITTEN IN CODE', 960, -50], ['CLAUDE.AI  ↗', 1824, -100]];
  const metas = META.map(([txt, x, ax]) => {
    const m = h('div', { cls: 'a', style: { left: x + 'px', top: '900px', height: '20px', overflow: 'hidden', transform: `translateX(${ax}%)` } }, s.root);
    return { m, i: h('div', { cls: 'mono', style: { color: C.paper } }, m), txt };
  });
  const R = rng(3);
  const parts = Array.from({ length: 34 }, () => ({ a: R() * Math.PI * 2, v: 700 + R() * 1400, r: 2 + R() * 4, c: R() < .6 ? C.verm : C.paper }));
  sfx(13.0, 'impact', { gain: 1.15, big: 1 });
  sfx(13.06, 'pop', { f: 640, gain: .6 });
  sfx(13.32, 'shimmer', { dur: .6, gain: .35 });
  for (let i = 0; i < 8; i++) sfx(13.6 + i * .04, 'tick', { f: 2800 + (i % 3) * 300, gain: .12, pan: (i - 4) / 5 });
  sfx(14.45, 'swoosh', { dur: .3, pan: 0, gain: .45, rev: 1 });
  sfx(14.78, 'zip', { dur: .12, gain: .45, down: 1 });
  sfx(14.9, 'blip', { f: 1760, gain: .5 });
  const SCR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  s.render = t => {
    const u = t - 13.0;
    const fs = lerp(150 * DRUM.K, 244, E.outExpo(prog(t, 13.04, 13.6)));
    const phi = DRUM.phi(t) * Math.PI / 180;
    const ny = lerp(540, 470, E.outExpo(prog(t, 13.1, 13.6))) - DRUM.R * DRUM.K * Math.sin(phi);
    name.style.fontSize = fs.toFixed(2) + 'px'; name.style.lineHeight = '.75em';
    const collapse = E.ioCubic(prog(t, 14.46, 14.6));
    NL.forEach((l, i) => {
      const e = E.outExpo(prog(t, 13.04 + i * .025, 13.6 + i * .025));
      const breathe = 4 * Math.sin((t - 13.6) * 3 + i * .7) * prog(t, 13.6, 13.9);
      vf(l, lerp(lerp(100, 125, e) + breathe, 62, collapse), lerp(800, 900, e));
      const out = E.inCubic(prog(t, 14.54 + i * .018, 14.68 + i * .018));
      l.style.transform = `translateY(${(out * 104).toFixed(2)}%)`;
    });
    tf(name, 960, ny);
    // the mark
    g.clearRect(0, 0, W, H);
    const nw = name.offsetWidth;
    const pop = spring(t - 13.05, 2.6, .45);
    let sx = 960 + nw / 2 + fs * .28, sy = ny - fs * .22, sR = fs * .19 * pop, rot = -140 * (1 - clamp(pop)) + u * 30;
    const mv = E.ioCubic(prog(t, 14.55, 14.78));
    sx = lerp(sx, 960, mv); sy = lerp(sy, 540, mv); sR = lerp(sR, 70, mv); rot += 180 * mv;
    const rt = E.inCubic(prog(t, 14.78, 14.9));
    const T = lerp(sR * .34, 26, rt), L = lerp(sR, 13, rt);
    const vanish = 1 - E.inBack(prog(t, 14.9, 14.985), 2.2);
    if (vanish > 0) drawSegs(g, sx, sy, STAR4.map(a => [a, L * vanish, T * vanish]), rot, C.verm);
    // shockwave + sparks
    const sw = prog(t, 13.0, 13.45);
    if (sw < 1) {
      g.strokeStyle = rgba(C.paper, .5 * (1 - sw)); g.lineWidth = 2;
      g.beginPath(); g.arc(960, 540, lerp(120, 1100, E.outExpo(sw)), 0, Math.PI * 2); g.stroke();
      for (const p of parts) {
        const d = p.v * (1 - Math.exp(-5 * u)) / 5, al = 1 - prog(u, .15, .45);
        if (al <= 0) continue;
        g.globalAlpha = al; g.fillStyle = p.c;
        g.beginPath(); g.arc(960 + Math.cos(p.a) * (160 + d), 540 + Math.sin(p.a) * (60 + d * .6), p.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }
    // subtitle
    SW2.forEach((w, i) => {
      const e = E.outExpo(prog(t, 13.3 + i * .035, 13.75 + i * .035)), x = E.inCubic(prog(t, 14.46 + i * .015, 14.58 + i * .015));
      w.style.transform = `translateY(${((1 - e) * 105 + x * 105).toFixed(2)}%)`;
    });
    tf(sub, 960, 690);
    // meta row
    const re = E.outExpo(prog(t, 13.52, 13.95)) * (1 - E.inCubic(prog(t, 14.44, 14.6)));
    rule.style.transform = `scaleX(${re.toFixed(4)})`;
    const fr = Math.floor(t * FPS);
    metas.forEach((m, j) => {
      let str = '';
      for (let c = 0; c < m.txt.length; c++) {
        const ch = m.txt[c], at = 13.6 + j * .06 + c * .012;
        str += t >= at || ch === ' ' ? ch : t >= at - .15 ? SCR[(fr * 3 + c * 7 + j) % SCR.length] : ' ';
      }
      m.i.textContent = str;
      m.i.style.transform = `translateY(${(E.inCubic(prog(t, 14.44 + j * .02, 14.56 + j * .02)) * 22).toFixed(2)}px)`;
    });
  };
}

// ═════════════════════════ seek ═════════════════════════
function seek(t) {
  for (const s of SC) {
    const on = t >= s.t0 && t < s.t1;
    s.root.style.display = on ? 'block' : 'none';
    if (on) s.render(t, t - s.t0);
  }
  renderHUD(t); renderGrain(t);
}
window.seek = seek;
window.EVENTS = () => EV.slice().sort((a, b) => a.t - b.t);
window.READY = (async () => {
  await Promise.all(['900 100px Archivo', 'italic 900 100px Archivo', '100px Instrument', 'italic 100px Instrument', '500 100px Mono'].map(f => document.fonts.load(f)));
  await document.fonts.ready;
  seek(0);
  return true;
})();

// ───────────────────────── interactive preview ─────────────────────────
if (!RENDER) {
  const fit = () => { const k = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `translate(${(innerWidth - W * k) / 2}px,${(innerHeight - H * k) / 2}px) scale(${k})`; };
  addEventListener('resize', fit); fit();
  let playing = true, t0 = performance.now(), tp = 0;
  const audio = new Audio('out/reel.wav');
  const loop = () => {
    if (playing) { tp = ((performance.now() - t0) / 1000) % DUR; }
    seek(tp); requestAnimationFrame(loop);
  };
  window.READY.then(() => { audio.play().catch(() => {}); t0 = performance.now(); loop(); });
  addEventListener('keydown', e => {
    if (e.code === 'Space') { playing = !playing; if (playing) { t0 = performance.now() - tp * 1000; audio.currentTime = tp; audio.play().catch(() => {}); } else audio.pause(); }
    if (e.code === 'ArrowRight') { playing = false; audio.pause(); tp = Math.min(DUR - 1e-3, tp + (e.shiftKey ? .5 : 1 / FPS)); }
    if (e.code === 'ArrowLeft') { playing = false; audio.pause(); tp = Math.max(0, tp - (e.shiftKey ? .5 : 1 / FPS)); }
  });
}
