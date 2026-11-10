/* MIDGAR FLAP — an original, FF7-inspired Flappy-style fan game.
 * Everything (art, font, audio) is generated procedurally at runtime.
 * No third-party or Square Enix assets are used. */
(() => {
'use strict';

// ------------------------------------------------------------------ config
const H = 640;                 // logical world height (width adapts to the window)
const MIN_W = 300, MAX_W = 860;
const GROUND_H = 80, GROUND_Y = H - GROUND_H;
const STEP = 1 / 120;          // fixed simulation step
const GRAVITY = 1400, FLAP_V = 400, MAX_FALL = 620;
const HIT_R = 13, HIT_OY = -4; // hit circle (tighter than the sprite)
const FEET = 17, HEAD = 15;    // ground / ceiling contact offsets from bird.y
const CAP_W = 80, BODY_W = 64, CAP_H = 34;
const U = 2.2;                 // hero sprite "pixel" size
const BEST_KEY = 'ff7-flappy-best', MUTE_KEY = 'ff7-flappy-muted';

const ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_OVER = 3;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const muteBtn = document.getElementById('mute');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function store(key, val) {
  try { if (val === undefined) return window.localStorage.getItem(key); window.localStorage.setItem(key, String(val)); } catch (e) { /* storage unavailable */ }
  return null;
}

// ------------------------------------------------------------------ audio (Web Audio only, all synthesized)
const Sfx = (() => {
  let ac = null, master = null, noiseBuf = null;
  let muted = store(MUTE_KEY) === '1';

  function unlock() {
    if (!ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.55;
        master.connect(ac.destination);
        const len = Math.floor(ac.sampleRate * 0.6);
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ac = null; return; }
    }
    if (ac.state === 'suspended') ac.resume();
  }
  function setMuted(m) {
    muted = m;
    store(MUTE_KEY, m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 0.55;
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, fType, f0, f1, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf;
    f.type = fType;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.03);
  }
  return {
    unlock, setMuted,
    isMuted: () => muted,
    flap() { tone(300, 640, 0.09, 'square', 0.09); noise(0.07, 0.07, 'highpass', 2500, 5000); },
    score() { tone(880, 880, 0.08, 'triangle', 0.2); tone(1318, 1318, 0.18, 'triangle', 0.18, 0.07); },
    hit() { noise(0.35, 0.5, 'lowpass', 2200, 160); tone(170, 45, 0.3, 'sawtooth', 0.25); },
    over() { [440, 392, 349, 294].forEach((f, i) => tone(f, f * 0.99, 0.2, 'triangle', 0.16, 0.3 + i * 0.16)); },
  };
})();

// ------------------------------------------------------------------ 5x7 pixel font (original, drawn with rectangles)
const FONT = {};
(function defineFont() {
  const g = {
    A: '.###. #...# #...# ##### #...# #...# #...#', B: '####. #...# #...# ####. #...# #...# ####.',
    C: '.#### #.... #.... #.... #.... #.... .####', D: '####. #...# #...# #...# #...# #...# ####.',
    E: '##### #.... #.... ####. #.... #.... #####', F: '##### #.... #.... ####. #.... #.... #....',
    G: '.#### #.... #.... #.### #...# #...# .###.', H: '#...# #...# #...# ##### #...# #...# #...#',
    I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.', J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
    K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#', L: '#.... #.... #.... #.... #.... #.... #####',
    M: '#...# ##.## #.#.# #.#.# #...# #...# #...#', N: '#...# ##..# #.#.# #..## #...# #...# #...#',
    O: '.###. #...# #...# #...# #...# #...# .###.', P: '####. #...# #...# ####. #.... #.... #....',
    Q: '.###. #...# #...# #...# #.#.# #..#. .##.#', R: '####. #...# #...# ####. #.#.. #..#. #...#',
    S: '.#### #.... #.... .###. ....# ....# ####.', T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
    U: '#...# #...# #...# #...# #...# #...# .###.', V: '#...# #...# #...# #...# #...# .#.#. ..#..',
    W: '#...# #...# #...# #.#.# #.#.# ##.## #...#', X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
    Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..', Z: '##### ....# ...#. ..#.. .#... #.... #####',
    0: '.###. #...# #..## #.#.# ##..# #...# .###.', 1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
    2: '.###. #...# ....# ...#. ..#.. .#... #####', 3: '.###. #...# ....# ..##. ....# #...# .###.',
    4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.', 5: '##### #.... ####. ....# ....# #...# .###.',
    6: '..##. .#... #.... ####. #...# #...# .###.', 7: '##### ....# ...#. ..#.. .#... .#... .#...',
    8: '.###. #...# #...# .###. #...# #...# .###.', 9: '.###. #...# #...# .#### ....# ...#. .##..',
    '.': '..... ..... ..... ..... ..... .##.. .##..', ',': '..... ..... ..... ..... .##.. ..#.. .#...',
    '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..', '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    "'": '.##.. ..#.. .#... ..... ..... ..... .....', '-': '..... ..... ..... ##### ..... ..... .....',
    ':': '..... .##.. .##.. ..... .##.. .##.. .....', '/': '....# ...#. ...#. ..#.. .#... .#... #....',
  };
  for (const k in g) FONT[k] = g[k].split(' ');
})();

let EPS = 0.5; // tiny overlap (logical px) to hide anti-aliasing seams between rects

const textW = (s, sc) => s.length * 6 * sc - sc;
function fitScale(s, want, maxW) { let sc = want; while (sc > 1 && textW(s, sc) > maxW) sc--; return sc; }
function wrapText(s, sc, maxW) {
  const words = s.toUpperCase().split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (!cur || textW(t, sc) <= maxW) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function glyphRun(s, x0, y, sc, color) {
  const multi = Array.isArray(color);
  if (!multi) ctx.fillStyle = color;
  for (let r = 0; r < 7; r++) {
    if (multi) ctx.fillStyle = color[r];
    let cx = x0;
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]];
      if (g) {
        const row = g[r];
        let c = 0;
        while (c < 5) {
          if (row[c] === '#') {
            let e = c;
            while (e < 5 && row[e] === '#') e++;
            ctx.fillRect(cx + c * sc, y + r * sc, (e - c) * sc + EPS, sc + EPS);
            c = e;
          } else c++;
        }
      }
      cx += 6 * sc;
    }
  }
}
function drawText(str, x, y, sc, color, align, opt) {
  const s = String(str).toUpperCase();
  const w = textW(s, sc);
  const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  opt = opt || {};
  if (opt.outline) {
    const d = Math.max(1, Math.round(sc / 3));
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, -d], [-d, d], [d, d]]) glyphRun(s, x0 + dx, y + dy, sc, opt.outline);
  }
  if (opt.shadow) glyphRun(s, x0 + sc * 0.5, y + sc * 0.9, sc, opt.shadow);
  glyphRun(s, x0, y, sc, color);
}

// ------------------------------------------------------------------ state
let W = 480, S = 1, dpr = 1;
let state = ST_TITLE, stateT = 0, time = 0, scroll = 0;
let paused = false;
let score = 0, best = parseInt(store(BEST_KEY), 10) || 0, newBest = false;
let scoreBump = 0, shake = 0, flash = 0;
let flavor = '';
let lastCenter = H * 0.42;
const pipes = [];
const particles = [];
const bird = { x: 120, y: H * 0.42, vy: 0, rot: 0, flapT: 0 };

const FLAVORS = [
  "This isn't just a reprint of the game...",
  'The planet is crying. Also, you clipped a pipe.',
  'Mako energy is limited. Your retries are not.',
  'Even the toughest mercenary hits a pipe sometimes.',
  "Midgar's pipes are unforgiving. You are stubborn.",
  'Plate clearance denied. Recalibrate and retry.',
  'The reactors never sleep. Neither should you.',
];

const birdX = () => clamp(W * 0.28, 96, 190);
const curSpeed = () => Math.min(235, 150 + score * 3.5);

// ------------------------------------------------------------------ cached art (rebuilt on resize)
let skyC = null, vignette = null, stars = [], motes = [];
let tFar, tMid, tNear, tFog, tGround;
let beaconsFar = [], stacksMid = [];
const LAY = { far: { h: 300 }, mid: { h: 320 }, near: { h: 210 } };

function makeTile(period, h, draw) {
  const c = document.createElement('canvas');
  const tw = Math.max(1, Math.round(period * S)), th = Math.max(1, Math.round(h * S));
  c.width = tw; c.height = th;
  const g = c.getContext('2d');
  g.setTransform(tw / period, 0, 0, th / h, 0, 0);
  draw(g, period, h);
  return { c, tw, th, period, h };
}
function drawTile(t, scr, y) {
  const m = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sh = ((Math.round(scr * S) % t.tw) + t.tw) % t.tw;
  const x0 = Math.round(m.e) - sh;
  const yy = Math.round(m.f + y * S);
  for (let x = x0 - t.tw; x < canvas.width + t.tw; x += t.tw) {
    if (x + t.tw > 0 && x < canvas.width) ctx.drawImage(t.c, x, yy);
  }
  ctx.setTransform(m);
}
function glowAt(g, x, y, r, rgb, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}
function haze(g, P, LH, a, span) {
  const gr = g.createLinearGradient(0, LH - span, 0, LH);
  gr.addColorStop(0, 'rgba(40,200,170,0)');
  gr.addColorStop(1, `rgba(40,200,170,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, LH - span, P, span);
}
function windows(g, r, x, top, w, bottom, dens, cols) {
  for (let wy = top + 8; wy < bottom - 8; wy += 9) {
    for (let wx = x + 5; wx < x + w - 6; wx += 8) {
      if (r() < dens) { g.fillStyle = cols[r() < 0.82 ? 0 : 1]; g.fillRect(wx, wy, 3, 4); }
    }
  }
}

function drawFar(g, P, LH) {
  const r = rng(11);
  let x = 0;
  while (x < P) {
    let w = 34 + Math.floor(r() * 46);
    if (P - x < w + 34) w = P - x;
    const h = 80 + Math.floor(r() * 170);
    g.fillStyle = '#0d1c31'; g.fillRect(x, LH - h, w, h);
    g.fillStyle = '#16314e'; g.fillRect(x, LH - h, 2, h); g.fillRect(x, LH - h, w, 2);
    if (r() < 0.4) {
      const ax = x + Math.floor(w / 2);
      g.fillStyle = '#0d1c31'; g.fillRect(ax - 1, LH - h - 26, 2, 26);
      beaconsFar.push({ x: ax, y: LH - h - 26 });
    }
    windows(g, r, x, LH - h, w, LH, 0.2, ['#2b8a82', '#d2bd6a']);
    x += w;
  }
  haze(g, P, LH, 0.38, 170);
}

function drawMid(g, P, LH) {
  const r = rng(23);
  // low base blocks
  let x = 0;
  while (x < P) {
    let w = 40 + Math.floor(r() * 40);
    if (P - x < w + 40) w = P - x;
    const h = 40 + Math.floor(r() * 70);
    g.fillStyle = '#091525'; g.fillRect(x, LH - h, w, h);
    g.fillStyle = '#12293f'; g.fillRect(x, LH - h, w, 2);
    windows(g, r, x, LH - h, w, LH, 0.16, ['#47ffb4', '#47ffb4']);
    x += w;
  }
  // long pipe run (uniform => seamless) with flanges every 64px
  g.fillStyle = '#0d2236'; g.fillRect(0, LH - 48, P, 8);
  g.fillStyle = '#1a4160'; g.fillRect(0, LH - 48, P, 2);
  for (let k = 0; k < P / 64; k++) { g.fillStyle = '#10304a'; g.fillRect(k * 64 + 30, LH - 52, 6, 16); }
  for (const lx of [90, 300, 430, 600]) { g.fillStyle = '#47ffb4'; g.fillRect(lx, LH - 44, 3, 3); glowAt(g, lx + 1, LH - 43, 14, '71,255,180', 0.35); }

  const dome = (dx, w) => {
    const cx = dx + w / 2, by = LH - 40;
    glowAt(g, cx, by, w * 0.85, '71,255,180', 0.3);
    g.fillStyle = '#0a1626'; g.fillRect(dx, by, w, 40);
    g.fillStyle = '#0c1c30';
    g.beginPath(); g.ellipse(cx, by, w / 2, 70, 0, Math.PI, Math.PI * 2); g.fill();
    g.strokeStyle = '#17344f'; g.lineWidth = 1.5;
    for (const f of [0.34, 0.68]) { g.beginPath(); g.ellipse(cx, by, (w / 2) * f, 70, 0, Math.PI, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#14283d'; g.fillRect(dx - 4, by - 4, w + 8, 6);
    g.fillStyle = '#47ffb4'; g.fillRect(dx, by - 2, w, 2);
    g.fillStyle = '#0f2236'; g.fillRect(cx - 3, by - 78, 6, 10);
  };
  const tower = (tx, w, h) => {
    const cx = tx + w / 2;
    g.fillStyle = '#0a192b';
    g.beginPath();
    g.moveTo(tx, LH); g.lineTo(tx + w * 0.19, LH - h * 0.55); g.lineTo(tx + w * 0.12, LH - h);
    g.lineTo(tx + w * 0.88, LH - h); g.lineTo(tx + w * 0.81, LH - h * 0.55); g.lineTo(tx + w, LH);
    g.closePath(); g.fill();
    g.fillStyle = '#143049'; g.beginPath(); g.ellipse(cx, LH - h, w * 0.38, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#47ffb4'; g.fillRect(cx - w * 0.2, LH - h * 0.3, 3, 6); g.fillRect(cx + w * 0.1, LH - h * 0.45, 3, 6);
    glowAt(g, cx, LH - h - 6, 46, '150,255,220', 0.2);
    stacksMid.push({ x: cx, y: LH - h, kind: 'steam' });
  };
  const stack = (sx, h) => {
    g.fillStyle = '#0b192a'; g.fillRect(sx, LH - h, 14, h);
    g.fillStyle = '#15324c'; g.fillRect(sx, LH - h, 3, h);
    for (let k = 0; k < 3; k++) { g.fillStyle = k % 2 ? '#0b192a' : '#7a2d24'; g.fillRect(sx, LH - h + 14 + k * 14, 14, 6); }
    g.fillStyle = '#102338'; g.fillRect(sx - 2, LH - h - 4, 18, 5);
    g.fillStyle = '#ff5a4a'; g.fillRect(sx + 5, LH - h - 9, 4, 4);
    beaconsFar.push({ x: sx + 7, y: LH - h - 7, mid: true });
    stacksMid.push({ x: sx + 7, y: LH - h - 4, kind: 'smoke' });
  };
  dome(24, 120); stack(176, 210); tower(214, 96, 150); stack(330, 170);
  dome(372, 100); stack(500, 230); tower(530, 90, 130);
  haze(g, P, LH, 0.22, 120);
}

function drawNear(g, P, LH) {
  const r = rng(37);
  const col = '#050c16', edge = '#0e2438';
  let x = 0;
  while (x < P) {
    let w = 30 + Math.floor(r() * 40);
    if (P - x < w + 30) w = P - x;
    const h = 24 + Math.floor(r() * 36);
    g.fillStyle = col; g.fillRect(x, LH - h, w, h);
    g.fillStyle = edge; g.fillRect(x, LH - h, w, 2);
    x += w;
  }
  // spherical tank on legs
  g.strokeStyle = col; g.lineWidth = 4;
  for (const dx of [-22, 0, 22]) { g.beginPath(); g.moveTo(60 + dx * 0.6, LH - 70); g.lineTo(60 + dx, LH); g.stroke(); }
  g.fillStyle = col; g.beginPath(); g.arc(60, LH - 88, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = edge; g.lineWidth = 2; g.beginPath(); g.arc(60, LH - 88, 32, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  g.fillStyle = '#47ffb4'; g.fillRect(58, LH - 124, 4, 4); glowAt(g, 60, LH - 122, 16, '71,255,180', 0.4);
  // lattice tower
  const tx = 170, tw = 44, th = 185;
  g.fillStyle = col; g.fillRect(tx, LH - th, 4, th); g.fillRect(tx + tw - 4, LH - th, 4, th);
  g.strokeStyle = col; g.lineWidth = 2;
  for (let y = LH; y > LH - th + 20; y -= 22) {
    g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + tw, y - 22); g.moveTo(tx + tw, y); g.lineTo(tx, y - 22); g.stroke();
  }
  g.fillRect(tx - 8, LH - th, tw + 16, 6);
  g.fillStyle = '#ff5a4a'; g.fillRect(tx + tw / 2 - 2, LH - th - 6, 4, 4); glowAt(g, tx + tw / 2, LH - th - 4, 14, '255,90,74', 0.35);
  // chimney
  g.fillStyle = col; g.fillRect(300, LH - 150, 20, 150); g.fillRect(297, LH - 154, 26, 6);
  g.fillStyle = edge; g.fillRect(300, LH - 150, 3, 150);
  // gantry
  g.fillStyle = col; g.fillRect(345, LH - 118, 130, 6);
  for (const gx of [350, 410, 468]) g.fillRect(gx, LH - 118, 5, 118);
  g.fillStyle = '#47ffb4'; g.fillRect(396, LH - 124, 3, 3); g.fillRect(440, LH - 124, 3, 3);
  // foreground pipe with flanges (uniform => seamless)
  g.fillStyle = col; g.fillRect(0, LH - 36, P, 14);
  g.fillStyle = edge; g.fillRect(0, LH - 36, P, 2);
  for (let k = 0; k < P / 52; k++) { g.fillStyle = col; g.fillRect(k * 52 + 24, LH - 40, 8, 22); }
}

function drawFog(g, P, h) {
  const r = rng(5);
  for (let i = 0; i < 8; i++) {
    const cx = r() * P, cy = h * (0.35 + r() * 0.5), rx = 90 + r() * 120, ry = 24 + r() * 26;
    for (const dx of [-P, 0, P]) {
      g.save(); g.translate(cx + dx, cy); g.scale(rx / ry, 1);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      gr.addColorStop(0, 'rgba(90,255,200,0.11)'); gr.addColorStop(1, 'rgba(90,255,200,0)');
      g.fillStyle = gr; g.fillRect(-ry, -ry, ry * 2, ry * 2);
      g.restore();
    }
  }
}

function drawGroundTile(g, P, h) {
  g.fillStyle = '#0f1b29'; g.fillRect(0, 0, P, h);
  g.fillStyle = '#5f7f99'; g.fillRect(0, 0, P, 6);
  g.fillStyle = '#9fc0d6'; g.fillRect(0, 0, P, 2);
  g.fillStyle = '#2b4259'; g.fillRect(0, 6, P, 3);
  g.fillStyle = '#16181f'; g.fillRect(0, 12, P, 16);
  g.save(); g.beginPath(); g.rect(0, 12, P, 16); g.clip();
  g.fillStyle = '#c99a26';
  for (let k = -32; k < P + 32; k += 32) {
    g.beginPath(); g.moveTo(k, 28); g.lineTo(k + 12, 28); g.lineTo(k + 28, 12); g.lineTo(k + 16, 12); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = '#070e17'; g.fillRect(0, 28, P, 2);
  g.fillStyle = '#0c1724'; g.fillRect(0, 30, P, h - 30);
  g.fillStyle = '#070e17'; g.fillRect(0, 30, 2, h - 30); g.fillRect(32, 30, 2, h - 30); g.fillRect(0, 56, P, 2);
  g.fillStyle = '#3d556c';
  for (const rx of [6, 24, 38, 56]) for (const ry of [36, 62]) g.fillRect(rx, ry, 3, 3);
  g.fillStyle = '#2fdc9c'; g.fillRect(8, 46, 16, 3); g.fillRect(42, 70, 12, 3);
  g.fillStyle = 'rgba(71,255,180,0.18)'; g.fillRect(8, 49, 16, 2);
}

function buildSky() {
  skyC = document.createElement('canvas');
  skyC.width = canvas.width; skyC.height = canvas.height;
  const g = skyC.getContext('2d');
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  const stops = [[0, [7, 10, 28]], [0.4, [11, 30, 48]], [0.72, [17, 78, 88]], [1, [44, 160, 140]]];
  for (let y = 0; y < H; y += 6) {
    const t = clamp(y / GROUND_Y, 0, 1);
    let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const a = stops[i], b = stops[i + 1], k = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    g.fillStyle = `rgb(${Math.round(lerp(a[1][0], b[1][0], k))},${Math.round(lerp(a[1][1], b[1][1], k))},${Math.round(lerp(a[1][2], b[1][2], k))})`;
    g.fillRect(0, y, W, 6.5);
  }
  const mx = W * 0.76, my = 120;
  glowAt(g, mx, my, 120, '150,255,220', 0.22);
  g.fillStyle = 'rgba(214,242,228,0.92)'; g.beginPath(); g.arc(mx, my, 32, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(160,205,190,0.8)';
  for (const [dx, dy, rr] of [[-10, -8, 7], [9, 6, 9], [-4, 14, 4], [12, -12, 4]]) { g.beginPath(); g.arc(mx + dx, my + dy, rr, 0, Math.PI * 2); g.fill(); }
}

function build() {
  beaconsFar = []; stacksMid = [];
  buildSky();
  tFar = makeTile(760, LAY.far.h, drawFar);
  const farBeacons = beaconsFar.filter(b => !b.mid);
  beaconsFar = []; stacksMid = [];
  tMid = makeTile(640, LAY.mid.h, drawMid);
  const midBeacons = beaconsFar.filter(b => b.mid);
  beaconsFar = farBeacons; beaconsFar.mid = midBeacons;
  tNear = makeTile(520, LAY.near.h, drawNear);
  tFog = makeTile(900, 150, drawFog);
  tGround = makeTile(64, GROUND_H + 12, drawGroundTile);
  vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.9);
  vignette.addColorStop(0, 'rgba(0,0,12,0)');
  vignette.addColorStop(1, 'rgba(0,0,12,0.6)');
  const r = rng(99);
  stars = []; for (let i = 0; i < 70; i++) stars.push({ x: r() * W, y: r() * (GROUND_Y - 200), s: r() < 0.2 ? 2 : 1, p: 0.8 + r() * 2.2, o: r() * 6 });
  motes = []; for (let i = 0; i < 26; i++) motes.push({ x: r() * W, y: r() * H, v: 8 + r() * 18, s: 1 + Math.floor(r() * 2), o: r() * 6 });
}

function resize() {
  const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight);
  const newW = Math.round(clamp(vw / vh * H, MIN_W, MAX_W));
  let cw, ch;
  if (vw / vh > newW / H) { ch = vh; cw = vh * newW / H; } else { cw = vw; ch = vw * H / newW; }
  stage.style.width = cw + 'px';
  stage.style.height = ch + 'px';
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const newS = cw * dpr / newW;
  const cwPx = Math.round(newW * newS), chPx = Math.round(H * newS);
  const changed = newW !== W || Math.abs(newS - S) > 0.001 || canvas.width !== cwPx || canvas.height !== chPx;
  W = newW; S = newS;
  if (changed) {
    canvas.width = cwPx; canvas.height = chPx;
    EPS = 0.75 / S;
    build();
  }
  bird.x = birdX();
}

// ------------------------------------------------------------------ hero sprite (original design, drawn from rectangles)
const C = {
  hair: '#f7d548', hairS: '#d9a526', hairD: '#a8721a', skin: '#f4c9a0', skinS: '#d49a76',
  navy: '#2c3b6e', navyL: '#4258a0', navyD: '#1d284d', sil: '#c3ccd9', silH: '#eef3f8', silS: '#7d889d',
  brn: '#6b4426', brnD: '#472c18', blade: '#dfe7f1', bladeS: '#8d9ab0', mako: '#6bfff0', gold: '#e3bf5a', out: '#130f26',
};
const heroCache = {};
function heroParts(pose, e, dead) {
  const key = pose * 3 + e + 1 + (dead ? 6 : 0);
  if (heroCache[key]) return heroCache[key];
  const P = [];
  const a = (x, y, w, h, c) => P.push([x, y, w, h, c]);
  // sword slung on the back (drawn first = behind)
  for (let i = 0; i < 10; i++) {
    const by = Math.round(i * 0.7);
    a(-3 - i, by, 2, 2, C.blade); a(-3 - i, by + 2, 2, 1, C.bladeS);
  }
  a(-2, -4, 2, 3, C.brn); a(-3, -5, 4, 1, C.gold);
  // legs
  if (pose === 0) {
    a(-2, 5, 2, 3, C.navyD); a(1, 5, 2, 3, C.navyD);
    a(-3, 7, 3, 2, C.brn); a(1, 7, 4, 2, C.brn);
  } else {
    a(-3, 5, 2, 2, C.navyD); a(-5, 6, 2, 2, C.navyD); a(-7, 7, 3, 2, C.brn);
    a(1, 5, 2, 2, C.navyD); a(3, 6, 2, 2, C.navyD); a(4, 7, 3, 2, C.brn);
  }
  // torso
  a(-3, -1, 6, 6, C.navy); a(-3, 0, 1, 5, C.navyD); a(0, 0, 2, 2, C.navyL);
  a(-3, 4, 6, 1, C.brn); a(0, 4, 1, 1, C.gold);
  // arm + glove
  if (pose === 0) { a(2, 0, 2, 4, C.navyL); a(2, 4, 3, 2, C.brn); }
  else { a(2, 0, 3, 2, C.navyL); a(5, -2, 2, 3, C.brn); }
  // pauldron
  a(-4, -2, 4, 3, C.sil); a(-4, -2, 4, 1, C.silH); a(-4, 0, 4, 1, C.silS);
  // head
  a(0, -3, 2, 1, C.skinS);
  a(-2, -8, 7, 5, C.skin); a(-2, -8, 1, 5, C.skinS); a(3, -4, 1, 1, C.skinS);
  if (dead) { a(2, -6, 1, 1, '#ff4d4d'); a(4, -6, 1, 1, '#ff4d4d'); a(3, -5, 1, 1, '#ff4d4d'); }
  else { a(3, -6, 1, 2, C.mako); a(2, -7, 3, 1, C.hairD); }
  // hair: cap, back, fringe
  a(-3, -11, 8, 3, C.hair); a(-3, -8, 2, 4, C.hairS); a(1, -9, 4, 1, C.hair); a(4, -8, 1, 2, C.hair);
  a(-3, -9, 8, 1, C.hairS);
  // spikes (lift/droop with vertical speed via e)
  a(-3, -14 - e, 2, 3 + e, C.hair); a(0, -15 - e, 2, 4 + e, C.hair); a(3, -14 - e, 2, 3 + e, C.hair);
  a(-6, -10 - e, 3, 2, C.hair); a(-8, -9 - e, 2, 2, C.hair);
  a(-6, -7 - e, 3, 2, C.hairS); a(-8, -6 - e, 2, 2, C.hairS);
  return (heroCache[key] = P);
}

function drawHero(x, y, rot, pose, e, dead) {
  const parts = heroParts(pose, e, dead);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  glowAt(ctx, 0, -4, 38, '107,255,200', 0.16);
  ctx.fillStyle = C.out;
  for (const p of parts) ctx.fillRect((p[0] - 1) * U, (p[1] - 1) * U, (p[2] + 2) * U, (p[3] + 2) * U);
  for (const p of parts) { ctx.fillStyle = p[4]; ctx.fillRect(p[0] * U, p[1] * U, p[2] * U + EPS, p[3] * U + EPS); }
  ctx.restore();
}

// ------------------------------------------------------------------ obstacles: mako reactor ducts
const BODY_BANDS = [[0, 4, '#0a111b'], [4, 6, '#19283a'], [10, 10, '#2a4157'], [20, 8, '#44637e'], [28, 6, '#5b7c97'],
  [34, 10, '#3a566f'], [44, 10, '#26394c'], [54, 6, '#192838'], [60, 4, '#0a111b']];
const CAP_BANDS = [[0, 5, '#16222f'], [5, 8, '#28405a'], [13, 10, '#43627d'], [23, 8, '#5b7c97'], [31, 10, '#3d5a74'],
  [41, 12, '#2a4259'], [53, 12, '#1e3146'], [65, 9, '#162536'], [74, 6, '#0e1822']];

function pipePart(cx, edgeY, dir) {
  const len = dir > 0 ? GROUND_Y + 4 - edgeY : edgeY + 6;
  if (len <= 0) return;
  ctx.save();
  ctx.translate(cx, edgeY);
  ctx.scale(1, dir); // local y = distance away from the gap
  const bx = -BODY_W / 2;
  for (const b of BODY_BANDS) { ctx.fillStyle = b[2]; ctx.fillRect(bx + b[0], CAP_H - 2, b[1] + EPS, len - CAP_H + 2); }
  for (let y = CAP_H + 30; y < len + 10; y += 58) {
    ctx.fillStyle = '#0a121c'; ctx.fillRect(-36, y - 1, 72, 12);
    ctx.fillStyle = '#1b2a3b'; ctx.fillRect(-35, y, 70, 10);
    ctx.fillStyle = '#4d6a85'; ctx.fillRect(-35, y, 70, 3);
    for (const rx of [-28, -10, 8, 26]) { ctx.fillStyle = '#9db5c9'; ctx.fillRect(rx, y + 4, 3, 3); }
    const vy = y + 22;
    if (vy + 24 < len + 10) {
      ctx.fillStyle = '#0a121c'; ctx.fillRect(-8, vy, 16, 26);
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 3 + y * 0.1);
      ctx.fillStyle = '#47ffb4'; ctx.fillRect(-6, vy + 2, 12, 22);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,20,24,0.55)';
      for (let k = 6; k < 22; k += 6) ctx.fillRect(-6, vy + k, 12, 2);
    }
  }
  // cap
  ctx.fillStyle = '#0a111b'; ctx.fillRect(-CAP_W / 2 - 1, -1, CAP_W + 2, CAP_H + 2);
  const cxl = -CAP_W / 2;
  for (const b of CAP_BANDS) { ctx.fillStyle = b[2]; ctx.fillRect(cxl + b[0], 0, b[1] + EPS, CAP_H); }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(cxl, 6, CAP_W, 2);
  ctx.fillStyle = '#46f5aa'; ctx.fillRect(cxl, 0, CAP_W, 4);
  ctx.fillStyle = '#1c7a5c'; ctx.fillRect(cxl, 4, CAP_W, 2);
  ctx.save();
  ctx.beginPath(); ctx.rect(cxl, 12, CAP_W, 12); ctx.clip();
  ctx.fillStyle = '#16181f'; ctx.fillRect(cxl, 12, CAP_W, 12);
  ctx.fillStyle = '#e6b422';
  for (let k = -56; k < 40; k += 16) {
    ctx.beginPath(); ctx.moveTo(k, 24); ctx.lineTo(k + 8, 24); ctx.lineTo(k + 20, 12); ctx.lineTo(k + 12, 12); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#0e1722'; ctx.fillRect(cxl, CAP_H - 5, CAP_W, 5);
  for (const [bx2, by2] of [[-36, 8], [32, 8], [-36, 27], [32, 27]]) {
    ctx.fillStyle = '#a8c0d4'; ctx.fillRect(bx2, by2, 4, 4); ctx.fillStyle = '#3a4d60'; ctx.fillRect(bx2 + 1, by2 + 1, 2, 2);
  }
  // mako glow spilling into the gap
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(0, 0, 0, -16);
  gr.addColorStop(0, 'rgba(70,245,170,0.32)'); gr.addColorStop(1, 'rgba(70,245,170,0)');
  ctx.fillStyle = gr; ctx.fillRect(cxl, -16, CAP_W, 16);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
function drawPipe(p) {
  const cx = p.x + CAP_W / 2;
  pipePart(cx, p.top, -1);
  pipePart(cx, p.bot, 1);
}

// ------------------------------------------------------------------ gameplay
function spawnPipe(x) {
  const gap = Math.max(138, 184 - score * 2);
  const lo = 64 + gap / 2, hi = GROUND_Y - 64 - gap / 2;
  let c = lo + Math.random() * (hi - lo);
  c = clamp(c, lastCenter - 150, lastCenter + 150);
  c = clamp(c, lo, hi);
  lastCenter = c;
  pipes.push({ x, top: c - gap / 2, bot: c + gap / 2, scored: false });
}

function resetRun() {
  pipes.length = 0;
  score = 0; newBest = false; scoreBump = 0;
  bird.x = birdX(); bird.y = H * 0.42; bird.vy = 0; bird.rot = 0; bird.flapT = 0;
  lastCenter = bird.y;
  spawnPipe(Math.min(W + 60, bird.x + 420));
}

function emit(n, x, y, spread, speed, life, size) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 160) particles.shift();
    const a = Math.random() * Math.PI * 2, v = Math.random() * speed;
    particles.push({ x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread,
      vx: Math.cos(a) * v - 30, vy: Math.sin(a) * v + 40, life: life * (0.6 + Math.random() * 0.4), max: life, s: size });
  }
}

function flap() {
  bird.vy = -FLAP_V;
  bird.flapT = 0.26;
  Sfx.flap();
  emit(7, bird.x - 8, bird.y + 10, 8, 70, 0.45, 3);
}

function setState(s) { state = s; stateT = 0; }

function die(hitGround) {
  Sfx.hit();
  shake = 0.35; flash = 0.55;
  if (score > best) { best = score; newBest = true; store(BEST_KEY, best); }
  flavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
  emit(18, bird.x, bird.y, 10, 160, 0.7, 3);
  if (hitGround) { bird.y = GROUND_Y - FEET; bird.vy = 0; setState(ST_OVER); Sfx.over(); }
  else { bird.vy = -170; setState(ST_DYING); }
}

function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
function hitsPipe(p) {
  const cx = bird.x, cy = bird.y + HIT_OY, r = HIT_R;
  const bx = p.x + (CAP_W - BODY_W) / 2 + 2, bw = BODY_W - 4;
  return circleRect(cx, cy, r, bx, -50, bw, p.top + 50) ||
         circleRect(cx, cy, r, p.x + 2, p.top - CAP_H + 2, CAP_W - 4, CAP_H - 2) ||
         circleRect(cx, cy, r, bx, p.bot, bw, GROUND_Y - p.bot) ||
         circleRect(cx, cy, r, p.x + 2, p.bot, CAP_W - 4, CAP_H - 2);
}

function update(dt) {
  time += dt; stateT += dt;
  if (scoreBump > 0) scoreBump = Math.max(0, scoreBump - dt * 4);
  if (shake > 0) shake = Math.max(0, shake - dt);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  bird.flapT = Math.max(0, bird.flapT - dt);

  let speed = 0;
  if (state === ST_TITLE) {
    speed = 55;
    const base = H * 0.46;
    bird.y = base + Math.sin(time * 3.2) * 9;
    bird.vy = Math.cos(time * 3.2) * 9 * 3.2;
    bird.rot = lerp(bird.rot, clamp(bird.vy * 0.004, -0.2, 0.2), Math.min(1, dt * 10));
    if (Math.floor(time * 4) % 2 === 0) bird.flapT = Math.max(bird.flapT, 0.05);
  } else if (state === ST_PLAY) {
    speed = curSpeed();
    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
    bird.y += bird.vy * dt;
    if (bird.y - HEAD < 0) { bird.y = HEAD; if (bird.vy < 0) bird.vy = 0; }
    bird.rot = lerp(bird.rot, clamp(bird.vy * 0.0019, -0.45, 1.15), Math.min(1, dt * 12));

    for (const p of pipes) p.x -= speed * dt;
    while (pipes.length && pipes[0].x + CAP_W < -30) pipes.shift();
    const spacing = 250 + (speed - 150) * 0.8;
    let last = pipes[pipes.length - 1];
    while (!last || last.x + spacing <= W + 60) {
      spawnPipe(last ? last.x + spacing : W + 60);
      last = pipes[pipes.length - 1];
    }

    if (bird.y + FEET >= GROUND_Y) { die(true); }
    else {
      for (const p of pipes) { if (hitsPipe(p)) { die(false); break; } }
    }
    if (state === ST_PLAY) {
      for (const p of pipes) {
        if (!p.scored && p.x + CAP_W / 2 < bird.x) {
          p.scored = true; score++; scoreBump = 1; Sfx.score();
        }
      }
      if (Math.random() < dt * 22) emit(1, bird.x - 14, bird.y + 6, 4, 20, 0.5, 2);
    }
  } else if (state === ST_DYING) {
    bird.vy = Math.min(MAX_FALL + 100, bird.vy + GRAVITY * 1.15 * dt);
    bird.y += bird.vy * dt;
    bird.rot = Math.min(1.7, bird.rot + dt * 7);
    if (bird.y + FEET >= GROUND_Y) {
      bird.y = GROUND_Y - FEET; bird.vy = 0; shake = Math.max(shake, 0.18);
      emit(10, bird.x, bird.y + 10, 10, 120, 0.5, 3);
      setState(ST_OVER); Sfx.over();
    }
  }
  scroll += speed * dt;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
  }
}

// ------------------------------------------------------------------ rendering
function drawBackground() {
  for (const s of stars) {
    ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * s.p + s.o));
    ctx.fillStyle = '#d8fff0';
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  // searchlights
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const bx = W * [0.16, 0.58, 0.92][i], by = GROUND_Y - 70;
    const ang = -Math.PI / 2 + Math.sin(time * 0.45 + i * 2.1) * 0.55;
    const len = 760, hw = 0.055;
    const gr = ctx.createLinearGradient(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
    gr.addColorStop(0, 'rgba(170,255,230,0.2)'); gr.addColorStop(1, 'rgba(170,255,230,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + Math.cos(ang - hw) * len, by + Math.sin(ang - hw) * len);
    ctx.lineTo(bx + Math.cos(ang + hw) * len, by + Math.sin(ang + hw) * len);
    ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  const farY = GROUND_Y + 12 - LAY.far.h, midY = GROUND_Y + 12 - LAY.mid.h, nearY = GROUND_Y + 12 - LAY.near.h;
  const sf = scroll * 0.06, sm = scroll * 0.18, sn = scroll * 0.42;
  drawTile(tFar, sf, farY);
  blink(beaconsFar, tFar.period, sf, farY, 0);
  drawTile(tMid, sm, midY);
  blink(beaconsFar.mid, tMid.period, sm, midY, 1.7);
  drawSmoke(sm, midY);
  drawTile(tFog, scroll * 0.25 + time * 6, GROUND_Y - 140);
  drawTile(tNear, sn, nearY);
  const gr = ctx.createLinearGradient(0, GROUND_Y - 90, 0, GROUND_Y);
  gr.addColorStop(0, 'rgba(60,230,170,0)'); gr.addColorStop(1, 'rgba(60,230,170,0.22)');
  ctx.fillStyle = gr; ctx.fillRect(0, GROUND_Y - 90, W, 90);
}

function blink(list, P, scr, ty, off) {
  if (!list) return;
  const on = Math.sin(time * 3 + off) > 0.2;
  if (!on) return;
  const sh = scr % P;
  for (let k = -1; k * P - sh < W + 20; k++) {
    for (const b of list) {
      const x = b.x - sh + k * P;
      if (x < -20 || x > W + 20) continue;
      ctx.fillStyle = '#ff5a4a'; ctx.fillRect(x - 2, ty + b.y - 2, 4, 4);
      glowAt(ctx, x, ty + b.y, 12, '255,90,74', 0.5);
    }
  }
}

function drawSmoke(scr, ty) {
  const P = tMid.period, sh = scr % P;
  for (let k = -1; k * P - sh < W + 80; k++) {
    for (const s of stacksMid) {
      const x0 = s.x - sh + k * P;
      if (x0 < -80 || x0 > W + 80) continue;
      const steam = s.kind === 'steam';
      for (let i = 0; i < 6; i++) {
        const ph = (time * (steam ? 0.14 : 0.2) + i / 6 + s.x * 0.013) % 1;
        const px = x0 + ph * (steam ? 18 : 46) + Math.sin(ph * 7 + i) * 4;
        const py = ty + s.y - ph * (steam ? 90 : 120);
        const r = 5 + ph * (steam ? 20 : 17);
        const a = (1 - ph) * Math.min(1, ph * 6) * (steam ? 0.22 : 0.32);
        ctx.fillStyle = steam ? `rgba(170,255,225,${a})` : `rgba(70,100,112,${a})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function drawGround() {
  drawTile(tGround, scroll, GROUND_Y);
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(0, GROUND_Y - 12, 0, GROUND_Y);
  gr.addColorStop(0, 'rgba(71,255,180,0)'); gr.addColorStop(1, 'rgba(71,255,180,0.2)');
  ctx.fillStyle = gr; ctx.fillRect(0, GROUND_Y - 12, W, 12);
  ctx.globalCompositeOperation = 'source-over';
}

function drawParticles() {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    const t = p.life / p.max;
    ctx.fillStyle = `rgba(107,255,200,${t * 0.9})`;
    const s = p.s * (0.5 + t * 0.6);
    ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawMotes() {
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const y = ((m.y - time * m.v) % H + H) % H;
    const x = ((m.x - scroll * 0.3 + Math.sin(time + m.o) * 10) % W + W) % W;
    ctx.fillStyle = `rgba(110,255,200,${0.25 + 0.25 * Math.sin(time * 2 + m.o)})`;
    ctx.fillRect(x, y, m.s, m.s);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawMateria(x, y, r, rgb) {
  glowAt(ctx, x, y, r * 2.2, rgb, 0.35);
  const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, `rgb(${rgb})`); gr.addColorStop(1, 'rgba(10,20,30,0.95)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9d6e4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2); ctx.stroke();
}

function drawWindow(x, y, w, h, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#e8f4f0'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.fillStyle = '#4a6fa0'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const gr = ctx.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#14386a'); gr.addColorStop(1, '#071230');
  ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.fillRect(x, y, w, 3);
  ctx.restore();
}

const TITLE_GRAD = ['#e6fff4', '#b4ffe0', '#82ffc8', '#55efaa', '#38cf8e', '#26a874', '#187a56'];
const OL = '#06121a';
function lines(arr, x, y, sc, color, lh, opt) {
  arr.forEach((l, i) => drawText(l, x, y + i * lh, sc, color, 'center', opt));
}
const blinkOn = (rate) => Math.floor(time * rate) % 2 === 0;

function drawFanNote() {
  const ph = 64;
  ctx.fillStyle = 'rgba(4,10,20,0.8)'; ctx.fillRect(0, H - ph, W, ph);
  ctx.fillStyle = '#2b4259'; ctx.fillRect(0, H - ph, W, 2);
  const l = wrapText('Fan work. Not affiliated with Square Enix.', 2, W - 24);
  lines(l, W / 2, H - ph + (ph - l.length * 18 + 4) / 2, 2, '#9fd8c4', 18);
}

function drawTitleUI() {
  const bob = Math.sin(time * 2) * 3;
  const sc = fitScale('MIDGAR', 8, W - 40);
  drawText('MIDGAR', W / 2, 66 + bob, sc, TITLE_GRAD, 'center', { outline: OL, shadow: 'rgba(0,255,170,0.25)' });
  drawText('FLAP', W / 2, 66 + bob + sc * 7 + 12, sc, TITLE_GRAD, 'center', { outline: OL, shadow: 'rgba(0,255,170,0.25)' });
  drawMateria(W / 2 - textW('FLAP', sc) / 2 - 22, 66 + bob + sc * 7 + 12 + sc * 3.5, 9, '71,255,180');
  drawMateria(W / 2 + textW('FLAP', sc) / 2 + 22, 66 + bob + sc * 7 + 12 + sc * 3.5, 9, '71,255,180');
  const sub = wrapText('An FF7-inspired fan game', 2, W - 30);
  lines(sub, W / 2, 66 + sc * 14 + 34, 2, '#bfe8dc', 18, { outline: OL });
  if (blinkOn(1.6)) {
    const l = wrapText('Tap / Click / Space to flap', 2, W - 40);
    lines(l, W / 2, 392, 2, '#ffffff', 20, { outline: OL });
  }
  if (best > 0) drawText('BEST: ' + best, W / 2, 452, 2, '#ffe27a', 'center', { outline: OL });
  drawFanNote();
}

function drawHUD() {
  const sc = 8;
  drawText(score, W / 2, 40 - scoreBump * 6, sc, '#ffffff', 'center', { outline: OL, shadow: 'rgba(0,255,170,0.35)' });
  drawText('BEST ' + best, 12, 14, 2, '#bfe8dc', 'left', { outline: OL });
}

function drawOverUI() {
  const a = clamp(stateT / 0.35, 0, 1);
  ctx.fillStyle = `rgba(0,4,12,${0.55 * a})`; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 24, 340), px = (W - pw) / 2;
  const slide = (1 - a) * 30;
  const py = 110 + slide, ph = 372;
  drawWindow(px, py, pw, ph, a);
  ctx.save();
  ctx.globalAlpha = a;
  const cx = W / 2, inner = pw - 36;
  const gsc = fitScale('GAME OVER', 5, inner);
  drawText('GAME OVER', cx, py + 28, gsc, '#ff6a5a', 'center', { outline: '#2a0a0e', shadow: 'rgba(0,0,0,0.4)' });
  drawText('SCORE', cx, py + 90, 2, '#9fc4ff', 'center');
  drawText(score, cx, py + 114, 6, '#ffffff', 'center', { outline: '#0a1430' });
  if (score >= 5) {
    const rgb = score >= 40 ? '255,90,90' : score >= 25 ? '255,220,90' : score >= 15 ? '90,160,255' : '71,255,180';
    drawMateria(px + 44, py + 135, 15, rgb);
  }
  drawText('BEST', cx, py + 178, 2, '#9fc4ff', 'center');
  drawText(best, cx, py + 200, 4, '#ffe27a', 'center', { outline: '#0a1430' });
  if (newBest && blinkOn(3)) drawText('NEW BEST!', cx, py + 238, 2, '#7dffc4', 'center', { outline: '#0a1430' });
  const fl = wrapText(flavor, 2, inner);
  lines(fl, cx, py + 270, 2, '#bfe8dc', 18);
  if (stateT > 0.5 && blinkOn(1.8)) {
    const t = 'TAP TO TRY AGAIN';
    drawText(t, cx, py + ph - 42, fitScale(t, 3, inner), '#ffffff', 'center', { outline: '#0a1430' });
  }
  ctx.restore();
}

function drawPaused() {
  ctx.fillStyle = 'rgba(0,4,12,0.6)'; ctx.fillRect(0, 0, W, H);
  drawText('PAUSED', W / 2, H / 2 - 30, fitScale('PAUSED', 6, W - 30), '#ffffff', 'center', { outline: OL });
  drawText('TAP TO RESUME', W / 2, H / 2 + 30, fitScale('TAP TO RESUME', 2, W - 30), '#bfe8dc', 'center', { outline: OL });
}

function render() {
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(skyC, 0, 0, W, H);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 22, (Math.random() - 0.5) * shake * 22);
  drawBackground();
  for (const p of pipes) { if (p.x < W + 60 && p.x + CAP_W > -60) drawPipe(p); }
  drawGround();
  drawParticles();
  const dead = state === ST_DYING || state === ST_OVER;
  const e = clamp(Math.round(bird.vy / 280), -1, 1);
  drawHero(bird.x, bird.y, bird.rot, bird.flapT > 0 ? 1 : 0, e, dead);
  drawMotes();
  ctx.restore();

  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

  if (state === ST_TITLE) drawTitleUI();
  else if (state === ST_PLAY || state === ST_DYING) drawHUD();
  else if (state === ST_OVER) { drawHUD(); drawOverUI(); }
  if (paused) drawPaused();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ input
function onAction() {
  Sfx.unlock();
  if (paused) { paused = false; return; }
  if (state === ST_TITLE) { resetRun(); setState(ST_PLAY); flap(); }
  else if (state === ST_PLAY) flap();
  else if (state === ST_OVER && stateT > 0.5) { resetRun(); setState(ST_PLAY); flap(); }
}
function togglePause() {
  if (state === ST_PLAY) paused = !paused;
  else if (paused) paused = false;
}
function updateMuteBtn() {
  const m = Sfx.isMuted();
  muteBtn.classList.toggle('off', m);
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  muteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="square">' +
    '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' +
    (m ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>') + '</svg>';
}
function toggleMute() { Sfx.setMuted(!Sfx.isMuted()); updateMuteBtn(); }

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) onAction();
  } else if (e.code === 'KeyM') { if (!e.repeat) toggleMute(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) togglePause(); }
}, { passive: false });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); }, { passive: false });

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('#mute')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  onAction();
}, { passive: false });
muteBtn.addEventListener('click', () => { toggleMute(); muteBtn.blur(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden && state === ST_PLAY) paused = true; });
window.addEventListener('blur', () => { if (state === ST_PLAY) paused = true; });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ------------------------------------------------------------------ main loop
let last = 0, acc = 0;
function frame(ts) {
  if (!last) last = ts;
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  if (!paused) {
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
  } else acc = 0;
  render();
  requestAnimationFrame(frame);
}

updateMuteBtn();
resize();
bird.x = birdX();
requestAnimationFrame(frame);
})();
