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
const BEST_KEY = 'ff7-flappy-best', MUTE_KEY = 'ff7-flappy-muted', NAME_KEY = 'ff7-flappy-name', CHAR_KEY = 'ff7-flappy-char';

// Difficulty curve: everything keeps ramping with score (no early hard cap).
const BASE_SPEED = 175, SPEED_PER_POINT = 4, SPEED_SOFT_CAP = 480;  // px/s scroll; soft cap only bites at score ~77+
const GAP_START = 180, GAP_SHRINK = 1.6, GAP_MIN = 124;             // gap hits its minimum at score ~35
const SPACE_START = 240, SPACE_SHRINK = 1.2, SPACE_MIN = 188;       // spacing tightens, hits min at score ~43
const MOVE_FROM = 15;                                               // moving pipes appear at this score
const AMP_START = 28, AMP_MAX = 48, FREQ_START = 1.2, FREQ_MAX = 2.4, MOVE_RAMP = 45; // amp px, freq rad/s, ramp length in points
const LEVEL_EVERY = 5;
const MAX_CENTER_STEP = 150, MIN_CENTER_STEP = 50, CLIMB_PX_PER_SEC = 250; // limits on centre change between neighbouring pipes

const ST_TITLE = 0, ST_PLAY = 1, ST_DYING = 2, ST_OVER = 3, ST_SELECT = 4;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const muteBtn = document.getElementById('mute');
const nameForm = document.getElementById('namebox');
const nameInput = document.getElementById('nameinput');
const nameSubmit = document.getElementById('namesubmit');
const nameContinue = document.getElementById('namecontinue');

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

// ------------------------------------------------------------------ global leaderboard (Supabase REST via plain fetch)
// Self-contained on purpose (only needs fetch/AbortController/timers) so it can be unit-tested outside the browser.
// <leaderboard>
const LB = (() => {
  const BASE = 'https://gfybimpuyzbwxhxhikpt.supabase.co/rest/v1/flap_scores';
  const KEY = 'sb_publishable_KIsjKLERCZHNllKXuOn1Uw_Ef9f3ADB';   // publishable (public) client key; never logged
  const TOP_URL = BASE + '?select=name,score&order=score.desc,created_at.asc&limit=10';
  const TIMEOUT_MS = 8000, NAME_MAX = 12, SCORE_MAX = 5000, TOP_N = 10;
  const NAME_OK = /^[A-Za-z0-9 _.-]+$/;

  // Strip disallowed characters and cap the length (used live while typing, so no trimming here).
  const filterName = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, NAME_MAX);
  // Final name for the POST: filtered + trimmed, 1..12 chars, allowed charset. null if unusable.
  function cleanName(s) {
    const n = filterName(s).trim();
    return n.length >= 1 && n.length <= NAME_MAX && NAME_OK.test(n) ? n : null;
  }
  const validScore = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= SCORE_MAX;

  // One HTTP call. Never rejects and never throws: resolves {ok, status, data?}. Network errors, timeouts,
  // non-2xx responses and unparsable bodies all come back as ok:false (callers treat that as "offline").
  function request(method, url, extraHeaders, body) {
    return new Promise((resolve) => {
      let done = false, timer = null, ctrl = null;
      const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
      try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; } catch (e) { ctrl = null; }
      timer = setTimeout(() => { finish({ ok: false, status: 0 }); try { if (ctrl) ctrl.abort(); } catch (e) { /* ignore */ } }, TIMEOUT_MS);
      try {
        const opt = { method, headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY }, extraHeaders), cache: 'no-store', credentials: 'omit' };
        if (body !== undefined) opt.body = body;
        if (ctrl) opt.signal = ctrl.signal;
        Promise.resolve(fetch(url, opt)).then((res) => {
          if (!res || !res.ok) return finish({ ok: false, status: res ? res.status : 0 });
          if (method !== 'GET') return finish({ ok: true, status: res.status });
          return res.json().then((data) => finish({ ok: true, status: res.status, data }), () => finish({ ok: false, status: res.status }));
        }).catch(() => finish({ ok: false, status: 0 }));
      } catch (e) { finish({ ok: false, status: 0 }); }
    });
  }

  // Top 10 as [{name, score}] (malformed rows dropped). Resolves {ok:true, rows} or {ok:false}.
  function fetchTop() {
    return request('GET', TOP_URL).then((r) => {
      if (!r.ok || !Array.isArray(r.data)) return { ok: false };
      const rows = [];
      for (const x of r.data) {
        if (x && typeof x.name === 'string' && Number.isInteger(x.score)) rows.push({ name: x.name.slice(0, NAME_MAX), score: x.score });
      }
      return { ok: true, rows: rows.slice(0, TOP_N) };
    });
  }

  // Validates, then POSTs one row. Invalid input resolves {ok:false, invalid:true} WITHOUT any network call.
  function submit(name, score) {
    const n = cleanName(name);
    if (n === null || !validScore(score)) return Promise.resolve({ ok: false, invalid: true });
    return request('POST', BASE, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, JSON.stringify({ name: n, score }))
      .then((r) => ({ ok: r.ok }));
  }

  return { NAME_MAX, SCORE_MAX, TOP_N, filterName, cleanName, validScore, fetchTop, submit };
})();
// </leaderboard>

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
    level() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.11, 'square', 0.1, i * 0.065)); },
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
    _: '..... ..... ..... ..... ..... ..... #####',
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
let W = 480, S = 1, dpr = 1, uiK = 1;   // uiK = logical units per CSS px (to clear the HTML mute button)
let state = ST_TITLE, stateT = 0, time = 0, scroll = 0;
let paused = false;
let score = 0, best = parseInt(store(BEST_KEY), 10) || 0, newBest = false;
let scoreBump = 0, shake = 0, flash = 0;
let lvPulse = 0, lvFlash = 0, shownLevel = 1, pipeSeq = 0;  // level-up effects, spawn counter
let flavor = '';
let lastCenter = H * 0.42;
const pipes = [];
const particles = [];
// Character select. selChar = saved pick (shown on the title); playChar = locked in when a run starts; selIdx = cursor.
// (Character is local only: the leaderboard table has no character column, so it is never sent to Supabase.)
let selChar = 'cloud', playChar = 'cloud', selIdx = 0, selDown = null;
const bird = { x: 120, y: H * 0.42, vy: 0, rot: 0, flapT: 0 };

// ---- leaderboard state
// Per-run record. A score can only be submitted for the run that actually went ST_PLAY -> game over, using the score
// frozen at the moment of death (run.final), and only once (run.submitted flips before the POST is even sent).
let run = null, runSeq = 0;
// Board cache: last successful list is kept and shown if a later fetch fails.
const board = { rows: null, loading: false, failed: false, reqId: 0, lastTry: 0, awaitFresh: false };
// Game-over flow: 'none' (not game over) -> 'wait' -> 'prompt' -> 'board'  (score 0 / ineligible runs go straight to 'board').
const over = { phase: 'none', t0: 0 };
// Name prompt (HTML overlay) state.
const np = { open: false, busy: false, failed: false, msg: '', openedAt: 0, layoutKey: '' };
const nowMs = () => (window.performance && performance.now ? performance.now() : Date.now());

function refreshBoard() {
  const id = ++board.reqId;
  board.loading = true; board.lastTry = nowMs();
  return LB.fetchTop().then((r) => {
    if (id !== board.reqId) return;               // a newer request superseded this one
    board.loading = false; board.awaitFresh = false;
    if (r.ok) { board.rows = r.rows; board.failed = false; } else board.failed = true;
  });
}
function canSubmit(r) {
  return !!(r && r === run && r.played && r.over && !r.submitted && LB.validScore(r.final));
}

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
const curSpeed = () => Math.min(SPEED_SOFT_CAP, BASE_SPEED + score * SPEED_PER_POINT);
const curGap = () => Math.max(GAP_MIN, GAP_START - score * GAP_SHRINK);
const curSpacing = () => Math.max(SPACE_MIN, SPACE_START - score * SPACE_SHRINK);
const curLevel = () => Math.floor(score / LEVEL_EVERY) + 1;
const moveT = () => clamp((score - MOVE_FROM) / MOVE_RAMP, 0, 1);       // 0 at score 15 -> 1 at score 60
const curAmp = () => lerp(AMP_START, AMP_MAX, moveT());
const curFreq = () => lerp(FREQ_START, FREQ_MAX, moveT());
const moveEvery = () => (score >= 30 ? 2 : 3);                           // every 3rd pipe, then every 2nd
const canMove = () => score >= MOVE_FROM;
// Largest allowed centre jump between neighbouring pipes. Fairness: the time you have to get from one gap to the next
// is the "clear flight" distance (spacing minus cap width minus hit diameter) divided by speed. Allow what a hero can
// climb in that time (~250 px/s with brisk tapping) plus ~80% of the slack inside the gap, minus a full swing when
// pipes can move. Capped at the old 150 px, never below 50.
const curCenterStep = () => {
  const tClear = (curSpacing() - CAP_W - 2 * HIT_R) / curSpeed();
  const step = CLIMB_PX_PER_SEC * tClear + 0.8 * (curGap() / 2 - HIT_R) - (canMove() ? curAmp() : 0);
  return clamp(step, MIN_CENTER_STEP, MAX_CENTER_STEP);
};

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

let lastVw = 0;
function resize() {
  // Legacy Android resizes the viewport when the soft keyboard opens; keep the layout steady while typing a name.
  if (np.open && window.innerWidth === lastVw && nameForm.contains(document.activeElement)) return;
  lastVw = window.innerWidth;
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
  W = newW; S = newS; uiK = newW / cw;
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
function cloudParts(pose, e, dead) {
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
  return P;
}

// ------------------------------------------------------------------ playable characters (original pixel art, rectangles only)
// Each parts fn pushes [x, y, w, h, colour] "pixels" (origin ~ body centre, +x = facing right). Every sprite keeps its
// body inside roughly the same box as Cloud; long props (blade, gun-arm, tail, staff) are visual only: the hit circle
// (HIT_R / HIT_OY) is shared by all characters, so physics and fairness never change.
const K = {
  out: '#130f26', red: '#ff4d4d', white: '#f4f6fa', steel: '#aab4c6', steelH: '#e6edf6', steelD: '#5d6678',
  skin: '#f4c9a0', skinS: '#d49a76', pale: '#f1e4de', paleS: '#cdb7b2', dark: '#1b1822', gold: '#e3bf5a',
};
const deadEyes = (a, x) => { x = x || 2; a(x, -6, 1, 1, K.red); a(x + 2, -6, 1, 1, K.red); a(x + 1, -5, 1, 1, K.red); };
function stdLegs(a, pose, pant, boot) {
  if (pose === 0) { a(-2, 5, 2, 3, pant); a(1, 5, 2, 3, pant); a(-3, 7, 3, 2, boot); a(1, 7, 4, 2, boot); }
  else { a(-3, 5, 2, 2, pant); a(-5, 6, 2, 2, pant); a(-7, 7, 3, 2, boot); a(1, 5, 2, 2, pant); a(3, 6, 2, 2, pant); a(4, 7, 3, 2, boot); }
}
function stdHead(a, skin, shade) { a(0, -3, 2, 1, shade); a(-2, -8, 7, 5, skin); a(-2, -8, 1, 5, shade); }

const CHAR_DEFS = [
  { id: 'cloud', name: 'Cloud', tag: 'Ex-SOLDIER', parts(a, pose, e, dead) { for (const p of cloudParts(pose, e, dead)) a(p[0], p[1], p[2], p[3], p[4]); } },
  { id: 'tifa', name: 'Tifa', tag: 'Martial artist', parts(a, pose, e, dead) {
    const h = '#3a2418', hS = '#26150e', rd = '#c42a3a', bk = '#1b1b24';
    a(-6, -9, 3, 2, h); a(-8, -7, 3, 2, h); a(-10, -5 - e, 2, 6, hS); a(-9, 0 - e, 2, 2, hS);   // long tied tail
    stdLegs(a, pose, K.skinS, '#8c1c2a');
    a(-3, -1, 6, 3, K.white); a(-3, 0, 1, 2, '#c8d0dc'); a(-3, 2, 6, 1, K.skin);                  // crop top, midriff
    a(-3, 3, 6, 3, bk); a(-1, -1, 1, 3, bk); a(-3, 5, 6, 1, rd);                                  // skirt + red hem
    if (pose === 0) { a(2, 0, 2, 3, K.skin); a(2, 3, 3, 3, rd); a(2, 3, 3, 1, '#e8d27a'); }
    else { a(2, 0, 3, 2, K.skin); a(5, -2, 3, 3, rd); a(5, -2, 3, 1, '#e8d27a'); }
    stdHead(a, K.skin, K.skinS);
    if (dead) deadEyes(a); else a(3, -6, 1, 2, '#7a3a2a');
    a(-3, -11, 8, 3, h); a(-3, -8, 2, 5, hS); a(1, -9, 4, 1, h); a(4, -8, 1, 2, h); a(-5, -9, 1, 2, rd);
  } },
  { id: 'aerith', name: 'Aerith', tag: 'Flower girl', parts(a, pose, e, dead) {
    const h = '#7a4a2a', hS = '#5a341c', pk = '#f08cb4', pkD = '#c86490', rb = '#b3283c';
    a(6, -9, 1, 18, '#9a6a3a'); a(5, -9, 3, 1, K.gold); a(5, -14, 3, 4, '#7cf5c0'); a(6, -13, 1, 1, K.white);   // staff + materia orb
    a(-5, -8, 2, 3, h); a(-5, -5, 2, 3, hS); a(-6, -2 - e, 2, 3, h); a(-6, 1 - e, 2, 3, hS);                   // long braid
    a(-7, 4 - e, 4, 2, pk); a(-6, 4 - e, 2, 1, K.white);                                                       // ribbon
    a(-3, -1, 6, 5, pk); a(-3, 0, 1, 4, pkD);
    a(-4, 4, 8, 3, pk); a(-4, 6, 8, 1, pkD); if (pose === 1) { a(-5, 5, 1, 2, pk); a(4, 5, 1, 2, pk); }       // flared dress
    a(-2, 7, 2, 1, '#6b4426'); a(1, 7, 3, 1, '#6b4426');
    a(-3, -1, 6, 2, rb); a(-4, -2, 3, 3, rb);                                                                   // bolero
    if (pose === 0) { a(2, 0, 2, 3, rb); a(3, 3, 2, 2, K.skin); } else { a(2, 0, 3, 2, rb); a(5, -2, 2, 2, K.skin); }
    stdHead(a, K.skin, K.skinS);
    if (dead) deadEyes(a); else a(3, -6, 1, 2, '#3fd08a');
    a(-3, -11, 8, 3, h); a(-3, -8, 2, 4, hS); a(1, -9, 4, 1, h); a(-4, -10, 3, 2, pk);
  } },
  { id: 'barret', name: 'Barret', tag: 'Avalanche', parts(a, pose, e, dead) {
    const sk = '#8a5634', skS = '#64381f', vest = '#3b5b3a', hr = '#15110f';
    a(-5, 0, 2, 4, sk); a(-5, 3, 2, 1, '#d0382c');                                                // back arm + wristband
    stdLegs(a, pose, '#3a3a44', '#15110f');
    a(-4, -1, 8, 6, vest); a(-4, 0, 1, 5, '#27402a'); a(-1, -1, 2, 4, sk); a(-4, 4, 8, 1, '#15110f'); a(0, 4, 1, 1, K.gold);
    const gy = pose === 0 ? 0 : -1;                                                               // gun-arm
    a(1, gy - 1, 4, 5, K.steelD); a(1, gy - 1, 4, 1, K.steel); a(5, gy, 5, 3, K.steel); a(6, gy - 1, 1, 5, K.gold);
    a(10, gy, 2, 3, K.dark); a(11, gy + 1, 1, 1, '#000'); a(5, gy + 2, 5, 1, K.steelD);
    if (pose === 1) { a(12, gy - 1, 2, 5, '#ffd35a'); a(12, gy, 3, 3, K.white); }
    a(-3, -4, 1, 1, skS); stdHead(a, sk, skS);
    a(-2, -11, 7, 3, hr); a(-2, -9, 8, 1, '#d0382c');                                              // hair + headband
    a(0, -7, 6, 2, '#0a0a0a'); if (!dead) a(1, -7, 1, 1, '#7aa0ff'); else deadEyes(a);             // shades
    a(0, -4, 5, 2, hr); a(-2, -5, 1, 2, hr);                                                       // beard
  } },
  { id: 'red13', name: 'Red XIII', tag: 'Guardian beast', parts(a, pose, e, dead) {
    const f = '#d8452a', fD = '#a8321c', bl = '#f2a66a', mane = '#7a2418';
    a(-9, -3, 2, 2, f); a(-11, -5, 2, 2, f); a(-12, -7, 2, 2, fD);                                 // tail
    a(-14, -11 - e, 4, 4, '#ff8a1e'); a(-13, -13 - e, 2, 3, '#ff5a14'); a(-13, -10 - e, 2, 2, '#ffe27a');   // flame tip
    if (pose === 0) { a(-6, 3, 2, 5, fD); a(-3, 3, 2, 5, f); a(1, 3, 2, 5, fD); a(4, 3, 2, 5, f); a(-6, 7, 3, 1, bl); a(-3, 7, 3, 1, bl); a(1, 7, 3, 1, bl); a(4, 7, 3, 1, bl); }
    else { a(-6, 3, 4, 2, fD); a(-8, 4, 2, 2, bl); a(-2, 3, 2, 3, f); a(1, 3, 4, 2, fD); a(5, 4, 3, 2, bl); a(3, 3, 2, 3, f); }
    a(-7, -3, 12, 6, f); a(-7, -3, 12, 1, fD); a(-6, 2, 10, 1, bl); a(-4, -1, 1, 2, K.gold); a(-1, -1, 1, 2, K.gold);   // body + tribal bands
    a(2, -9, 3, 8, mane); a(1, -8, 1, 5, '#3a7bd8'); a(0, -4, 1, 2, '#e8d27a');                    // mane + feather/bead ornaments
    a(4, -8, 6, 6, f); a(9, -5, 3, 3, f); a(11, -5, 1, 1, K.dark); a(9, -3, 3, 1, bl);              // head + snout
    a(4, -11, 2, 3, f); a(7, -11, 2, 3, f); a(5, -10, 1, 2, '#f08cb4'); a(7, -8, 3, 1, K.gold); a(9, -7, 1, 2, '#2ad4d4');   // ears, markings
    if (dead) { a(7, -6, 1, 1, K.red); a(9, -6, 1, 1, K.red); a(8, -5, 1, 1, K.red); } else a(8, -6, 1, 1, '#ffe27a');
    a(11, -4, 4, 1, '#f6e7c8'); a(11, -2, 3, 1, '#f6e7c8');                                        // whiskers
  } },
  { id: 'yuffie', name: 'Yuffie', tag: 'Ninja', parts(a, pose, e, dead) {
    const cx = -9, cy = 0, st = K.steel, sd = K.steelD;
    if (pose === 0) { a(cx, cy - 6, 1, 13, st); a(cx - 1, cy - 4, 3, 9, st); a(cx - 2, cy - 2, 5, 5, sd); a(cx - 6, cy, 13, 1, st); a(cx - 4, cy - 1, 9, 3, st); }
    else for (let i = 1; i <= 5; i++) { a(cx + i - 1, cy + i - 1, 2, 2, st); a(cx - i, cy + i - 1, 2, 2, st); a(cx + i - 1, cy - i, 2, 2, st); a(cx - i, cy - i, 2, 2, st); }
    a(cx - 1, cy - 1, 3, 3, sd); a(cx, cy, 1, 1, K.steelH);                                        // big shuriken (spins with the flap)
    const h = '#2a1c2c', gr = '#2ea87a', grD = '#1d7a58';
    stdLegs(a, pose, K.skinS, '#4a5a3a');
    a(-3, -1, 6, 3, gr); a(-3, 0, 1, 2, grD); a(-3, 2, 6, 1, K.skin); a(-3, 3, 6, 2, '#c9b58a'); a(-3, 4, 6, 1, '#a08a5a');
    if (pose === 0) { a(2, 0, 2, 3, K.skin); a(2, 3, 3, 2, '#9aa6b8'); } else { a(2, 0, 3, 2, K.skin); a(5, -2, 3, 3, '#9aa6b8'); }
    stdHead(a, K.skin, K.skinS);
    if (dead) deadEyes(a); else a(3, -6, 1, 2, '#3a2a20');
    a(-3, -11, 8, 3, h); a(-4, -9, 2, 5, h); a(1, -9, 4, 1, h);
    a(-3, -9, 9, 1, '#c9d2e0'); a(2, -10, 4, 2, K.steelH); a(3, -10, 1, 1, sd);                      // forehead protector
  } },
  { id: 'vincent', name: 'Vincent', tag: 'Ex-Turk', parts(a, pose, e, dead) {
    const cp = '#7a1520', cpL = '#a82030', hr = '#17121c';
    a(-10, -4, 7, 12, cp); a(-10, 7, 2, 3, cp); a(-7, 7, 2, 2, cp); a(-4, 7, 2, 3, cp); a(-10, -4, 1, 12, K.gold);   // tattered cape
    a(-6, -9, 3, 16, hr); a(-8, -6 - e, 2, 12, '#2a2236');                                           // long black hair
    stdLegs(a, pose, K.dark, '#4a2a1a'); a(-3, 8, 1, 1, K.gold); a(1, 8, 1, 1, K.gold);
    a(-3, -1, 6, 6, '#26202e'); a(-3, 0, 1, 5, K.dark); a(-4, -3, 8, 3, cpL); a(-4, -3, 8, 1, K.gold);   // high collar
    a(-2, 1, 1, 1, K.gold); a(-2, 3, 1, 1, K.gold);
    const gy = pose === 0 ? 1 : -1;
    a(2, gy, 3, 2, K.dark); a(5, gy, 1, 2, K.pale); a(5, gy - 1, 5, 2, K.steel); a(5, gy + 1, 1, 2, '#5a3a22'); a(9, gy - 1, 1, 1, K.steelH);   // pistol
    if (pose === 1) a(10, gy - 1, 2, 2, '#ffd35a');
    stdHead(a, K.pale, K.paleS);
    if (dead) deadEyes(a); else a(3, -6, 1, 1, '#ff3030');
    a(-3, -11, 8, 3, hr); a(-3, -8, 2, 5, hr); a(1, -9, 3, 3, hr); a(-3, -9, 9, 1, '#c4202e'); a(5, -9, 2, 1, '#c4202e');   // hair + red band
  } },
  { id: 'caitsith', name: 'Cait Sith', tag: 'Fortune teller', parts(a, pose, e, dead) {
    const pl = '#c8b7ff', plD = '#9a86e0';
    a(-8, pose ? -1 : 1, 2, 3, '#6a5ab8'); a(-9, pose ? -2 : 2, 1, 2, '#6a5ab8');                  // tiny bat wing
    a(-6, 0, 13, 6, pl); a(-5, -1, 11, 1, pl); a(-5, 6, 11, 1, plD); a(-6, 0, 1, 6, plD); a(-4, 7, 3, 1, plD); a(2, 7, 3, 1, plD);   // chubby plush
    a(-3, 2, 6, 3, '#efe8ff'); a(2, 1, 1, 1, K.dark); a(4, 1, 1, 1, K.dark); a(7, 2, 2, 2, '#ff7aa8');
    a(-2, -4, 5, 3, '#14121a'); a(0, -3, 2, 2, K.white); a(0, -4, 3, 1, '#e03a4a');                 // Cait sitting on top
    a(-3, -10, 7, 6, '#14121a'); a(-1, -8, 5, 3, K.white);
    a(-3, -12, 2, 3, '#14121a'); a(3, -12, 2, 3, '#14121a'); a(-5, -7, 2, 1, K.white); a(5, -7, 2, 1, K.white);   // ears, whiskers
    if (dead) { a(1, -8, 1, 1, K.red); a(3, -8, 1, 1, K.red); a(2, -7, 1, 1, K.red); } else { a(1, -8, 1, 1, K.dark); a(3, -8, 1, 1, K.dark); a(2, -7, 1, 1, '#ff7aa8'); }
    a(-1, -12, 5, 1, K.gold); a(-1, -14, 1, 2, K.gold); a(1, -14, 1, 2, K.gold); a(3, -14, 1, 2, K.gold);   // crown
  } },
  { id: 'cid', name: 'Cid', tag: 'Pilot', parts(a, pose, e, dead) {
    for (let i = 0; i < 16; i++) a(-8 + Math.round(i * 0.9), 8 - i, 2, 1, '#8b5a2b');            // spear shaft (diagonal)
    a(7, -9, 2, 2, K.steelH); a(8, -11, 2, 2, K.steel); a(9, -13, 1, 2, K.steelH); a(5, -7, 1, 3, K.red);
    const kh = '#9a8650', khL = '#b8a468', hr = '#f7d548';
    stdLegs(a, pose, '#5a4630', '#1b1822');
    a(-3, -1, 6, 6, kh); a(-3, 0, 1, 5, '#6e5e36'); a(0, -1, 2, 2, khL); a(-3, -1, 6, 1, K.white); a(-3, 4, 6, 1, '#3a2a18');
    if (pose === 0) { a(2, 0, 2, 4, khL); a(2, 4, 3, 2, '#6b4426'); } else { a(2, 0, 3, 2, khL); a(5, -2, 2, 3, '#6b4426'); }
    stdHead(a, K.skin, K.skinS);
    if (dead) deadEyes(a); else a(3, -6, 1, 2, '#3a3a44');
    a(5, -4, 3, 1, K.white); a(8, -4, 1, 1, '#ff6a2a');                                             // cigarette
    a(-3, -11, 8, 2, hr); a(-3, -9, 2, 3, '#d9a526'); a(1, -9, 4, 1, hr);
    a(-3, -9, 8, 1, '#5a3a22'); a(-2, -12, 4, 3, '#a88a3a'); a(2, -12, 4, 3, '#a88a3a'); a(-1, -11, 2, 1, '#7fe8ff'); a(3, -11, 2, 1, '#7fe8ff');   // goggles
  } },
  { id: 'sephiroth', name: 'Sephiroth', tag: 'One-winged angel', parts(a, pose, e, dead) {
    const hs = '#e8edf5', hD = '#aeb8cc', hDD = '#7b88a6', coat = '#14121a';
    for (let i = 0; i < 30; i++) a(3 - i, 4 - Math.round(i * 0.28), 2, 1, i < 3 ? '#8a8fa0' : '#f4f8ff');   // very long thin masamune
    a(-12, -3 - e, 2, 10, hDD); a(-9, -6 - e, 3, 14, hD); a(-6, -9, 3, 17, hs);                   // very long silver hair
    a(-4, 4, 8, 4, coat); a(-6, 6, 3, 3, coat); a(4, 6, 2, 2, coat); if (pose === 1) a(-7, 7, 2, 2, coat);   // coat tails
    a(-2, 7, 2, 2, K.dark); a(1, 7, 3, 2, K.dark);
    a(-3, -1, 6, 6, coat); a(-3, 0, 1, 5, '#000'); a(-1, 0, 4, 1, K.steel); a(0, 1, 2, 1, K.steelD); a(-4, -2, 4, 3, K.steel); a(-4, -2, 4, 1, K.steelH);
    if (pose === 0) { a(2, 0, 2, 4, coat); a(2, 4, 2, 2, K.dark); } else { a(2, 0, 3, 2, coat); a(5, -2, 2, 3, K.dark); }
    stdHead(a, K.pale, K.paleS);
    if (dead) deadEyes(a); else { a(3, -6, 1, 2, '#3dff7a'); }
    a(-3, -11, 8, 3, hs); a(-3, -8, 2, 4, hD); a(1, -9, 1, 5, hs); a(4, -9, 1, 7, hs); a(2, -9, 2, 1, hD);   // fringe + long front locks
  } },
];
const CHAR_IDS = CHAR_DEFS.map((c) => c.id);
const charIndex = (id) => Math.max(0, CHAR_IDS.indexOf(id));
const charCache = {};
function charParts(id, pose, e, dead) {
  const key = id + ':' + (pose * 3 + e + 1 + (dead ? 6 : 0));
  if (charCache[key]) return charCache[key];
  const P = [];
  const a = (x, y, w, h, c) => P.push([x, y, w, h, c]);
  CHAR_DEFS[charIndex(id)].parts(a, pose, e, dead);
  return (charCache[key] = P);
}
function loadChar() { const v = store(CHAR_KEY); return CHAR_IDS.indexOf(v) >= 0 ? v : 'cloud'; }
selChar = playChar = loadChar();
selIdx = charIndex(selChar);

function drawChar(id, x, y, rot, pose, e, dead, unit, glow) {
  const parts = charParts(id, pose, e, dead);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (glow) glowAt(ctx, 0, -4, 38, '107,255,200', 0.16);
  ctx.fillStyle = C.out;
  for (const p of parts) ctx.fillRect((p[0] - 1) * unit, (p[1] - 1) * unit, (p[2] + 2) * unit, (p[3] + 2) * unit);
  for (const p of parts) { ctx.fillStyle = p[4]; ctx.fillRect(p[0] * unit, p[1] * unit, p[2] * unit + EPS, p[3] * unit + EPS); }
  ctx.restore();
}

// ------------------------------------------------------------------ character select (state ST_SELECT)
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const padRect = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p });
// Title-screen CHARACTERS button (top-left, clear of the mute button). The hit area is bigger than the drawn box.
const charBtn = () => ({ x: 10, y: 10, w: 144, h: 34 });
const charBtnHit = () => padRect(charBtn(), 10);
function selLayout() {
  const gw = Math.min(W - 24, 340), gx = (W - gw) / 2, gap = 5, cw = (gw - gap) / 2, ch = 70, gy = 52;
  const cells = CHAR_DEFS.map((c, i) => ({ x: gx + (i % 2) * (cw + gap), y: gy + (i >> 1) * (ch + gap), w: cw, h: ch }));
  const by = gy + 5 * (ch + gap) + 62, bw = cw;
  return { cells, gx, gw, back: { x: gx, y: by, w: bw, h: 40 }, ok: { x: gx + bw + gap, y: by, w: bw, h: 40 }, nameY: gy + 5 * (ch + gap) + 8 };
}
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function openSelect() { if (state !== ST_TITLE) return; selIdx = charIndex(selChar); selDown = null; setState(ST_SELECT); }
function closeSelect() { selDown = null; if (state === ST_SELECT) setState(ST_TITLE); }          // never starts a run
function confirmSelect() {
  selChar = CHAR_IDS[selIdx]; store(CHAR_KEY, selChar);
  closeSelect();
}
function selMove(d) { selIdx = (selIdx + d + CHAR_DEFS.length) % CHAR_DEFS.length; }
function selTap(x, y) {
  const L = selLayout();
  for (let i = 0; i < L.cells.length; i++) {
    if (inRect(x, y, padRect(L.cells[i], 2))) { if (i === selIdx) confirmSelect(); else selIdx = i; return; }
  }
  if (inRect(x, y, padRect(L.back, 4))) closeSelect();
  else if (inRect(x, y, padRect(L.ok, 4))) confirmSelect();
}
function selKey(e) {
  const c = e.code;
  if (c === 'KeyM') { if (!e.repeat) toggleMute(); return; }
  if (c === 'ArrowLeft' || c === 'KeyA') selMove(-1);
  else if (c === 'ArrowRight' || c === 'KeyD') selMove(1);
  else if (c === 'ArrowUp' || c === 'KeyW') selMove(selIdx < 2 ? 8 : -2);
  else if (c === 'ArrowDown' || c === 'KeyS') selMove(selIdx >= 8 ? -8 : 2);
  else if (c === 'Enter' || c === 'Space' || e.key === ' ') { if (!e.repeat) confirmSelect(); }
  else if (c === 'Escape' || c === 'Backspace') { if (!e.repeat) closeSelect(); }
  else return;
  e.preventDefault();
}

function drawMenuBtn(r, label, hot) {
  drawWindow(r.x, r.y, r.w, r.h, 1);
  if (hot) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
  const sc = fitScale(label, 2, r.w - 12);
  drawText(label, r.x + r.w / 2, r.y + (r.h - 7 * sc) / 2 + 1, sc, '#ffffff', 'center', { outline: OL });
}
function drawCharButton() {
  const r = charBtn();
  drawMenuBtn(r, 'CHARACTERS', false);
  ctx.fillStyle = '#ffd35a'; ctx.fillRect(r.x + r.w + 6, r.y + 12, 6, 2); ctx.fillRect(r.x + r.w + 8, r.y + 10, 2, 6);   // small "+" cue
}
function drawSelectUI() {
  ctx.fillStyle = 'rgba(4,10,20,0.74)'; ctx.fillRect(0, 0, W, H);
  drawText('CHOOSE HERO', W / 2, 14, fitScale('CHOOSE HERO', 4, W - 90), TITLE_GRAD, 'center', { outline: OL });
  const L = selLayout();
  L.cells.forEach((r, i) => {
    const sel = i === selIdx;
    drawWindow(r.x, r.y, r.w, r.h, sel ? 1 : 0.82);
    if (sel) {
      ctx.fillStyle = 'rgba(120,255,200,0.16)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#ffd35a'; ctx.lineWidth = 3; ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
    }
    const bob = Math.sin(time * 3 + i) * 1.5;
    drawChar(CHAR_IDS[i], r.x + r.w / 2 + 6, r.y + 30 + bob, 0, sel && Math.floor(time * 4) % 2 === 0 ? 1 : 0, 0, false, 1.6, false);
    const nm = CHAR_DEFS[i].name;
    drawText(nm, r.x + r.w / 2, r.y + r.h - 18, fitScale(nm.toUpperCase(), 2, r.w - 10), sel ? '#ffffff' : '#bfe8dc', 'center', { outline: OL });
    if (CHAR_IDS[i] === selChar) { ctx.fillStyle = '#47ffb4'; ctx.fillRect(r.x + r.w - 12, r.y + 6, 6, 6); }   // saved pick marker
  });
  const d = CHAR_DEFS[selIdx];
  drawText(d.name, W / 2, L.nameY, fitScale(d.name.toUpperCase(), 3, W - 24), '#ffffff', 'center', { outline: OL, shadow: 'rgba(0,255,170,0.35)' });
  drawText(d.tag, W / 2, L.nameY + 28, fitScale(d.tag.toUpperCase(), 2, W - 24), '#8dffd2', 'center', { outline: OL });
  drawMenuBtn(L.back, 'BACK', false);
  drawMenuBtn(L.ok, 'OK', true);
  const hint = 'TAP AGAIN TO CONFIRM';
  drawText(hint, W / 2, L.back.y + 50, fitScale(hint, 2, W - 16), '#9fd8c4', 'center', { outline: OL });
  drawFanNote();
}

// Legacy name: the in-run hero is simply the locked-in character.
function drawHero(x, y, rot, pose, e, dead) { drawChar(playChar, x, y, rot, pose, e, dead, U, true); }
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
  const gap = curGap();
  const lo = 64 + gap / 2, hi = GROUND_Y - 64 - gap / 2;   // legal range for the gap centre
  const moving = canMove() && pipeSeq++ % moveEvery() === 0;
  // a moving pipe keeps its whole swing inside [lo, hi] by centring the swing further from the edges
  const amp = moving ? Math.min(curAmp(), (hi - lo) / 2) : 0;
  const cLo = lo + amp, cHi = hi - amp;
  let c = cLo + Math.random() * (cHi - cLo);
  const step = curCenterStep();
  c = clamp(c, lastCenter - step, lastCenter + step);
  c = clamp(c, cLo, cHi);
  const pipe = { x, top: c - gap / 2, bot: c + gap / 2, gap, scored: false, moving, base: c, amp, freq: moving ? curFreq() : 0,
    phase: moving ? Math.random() * Math.PI * 2 : 0, lo, hi };
  if (moving) setPipeCenter(pipe);
  lastCenter = c;
  pipes.push(pipe);
}
// Moving pipes: gap centre follows a sine around p.base; top/bot (caps included) are derived from it every update.
function setPipeCenter(p) {
  const c = clamp(p.base + p.amp * Math.sin(p.phase), p.lo, p.hi);
  p.top = c - p.gap / 2; p.bot = c + p.gap / 2;
}

function resetRun() {
  closePrompt();
  over.phase = 'none';
  run = { id: ++runSeq, played: false, over: false, final: 0, submitted: false, saved: false, failed: false, entry: null };
  pipes.length = 0;
  playChar = selChar;
  score = 0; newBest = false; scoreBump = 0;
  lvPulse = 0; lvFlash = 0; shownLevel = 1; pipeSeq = 0;
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

function setState(s) {
  state = s; stateT = 0;
  if (s === ST_PLAY && run) run.played = true;
  if (s === ST_OVER) onGameOver();
}

// Game over reached: decide whether this run may ask for a name, and fetch a fresh board.
function onGameOver() {
  over.t0 = nowMs();
  over.phase = canSubmit(run) ? 'wait' : 'board';
  refreshBoard();
}

function die(hitGround) {
  if (run && run.played && !run.over) { run.over = true; run.final = score; }   // score frozen at death
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
  if (lvPulse > 0) lvPulse = Math.max(0, lvPulse - dt * 2.5);   // ~0.4s
  if (lvFlash > 0) lvFlash = Math.max(0, lvFlash - dt * 4);
  bird.flapT = Math.max(0, bird.flapT - dt);

  let speed = 0;
  if (state === ST_TITLE || state === ST_SELECT) {
    speed = 55;
    const base = H * 0.46;
    bird.y = base + Math.sin(time * 3.2) * 9;
    bird.vy = Math.cos(time * 3.2) * 9 * 3.2;
    bird.rot = lerp(bird.rot, clamp(bird.vy * 0.004, -0.2, 0.2), Math.min(1, dt * 10));
    if (Math.floor(time * 4) % 2 === 0) bird.flapT = Math.max(bird.flapT, 0.05);
    if (board.failed && !board.loading && nowMs() - board.lastTry > 15000) refreshBoard();   // quietly retry while idle on the title
  } else if (state === ST_PLAY) {
    speed = curSpeed();
    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
    bird.y += bird.vy * dt;
    if (bird.y - HEAD < 0) { bird.y = HEAD; if (bird.vy < 0) bird.vy = 0; }
    bird.rot = lerp(bird.rot, clamp(bird.vy * 0.0019, -0.45, 1.15), Math.min(1, dt * 12));

    for (const p of pipes) {
      p.x -= speed * dt;
      if (p.moving) { p.phase += p.freq * dt; setPipeCenter(p); }
    }
    while (pipes.length && pipes[0].x + CAP_W < -30) pipes.shift();
    const spacing = curSpacing();   // score-based: pipes get closer together as you progress
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
          p.scored = true; score++; scoreBump = 1;
          if (curLevel() > shownLevel) { shownLevel = curLevel(); lvPulse = 1; lvFlash = 1; Sfx.level(); }
          else Sfx.score();
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
  } else if (state === ST_OVER && over.phase === 'wait' && stateT > 0.6) {
    if (canSubmit(run)) openPrompt(); else enterBoard();
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

// ---- leaderboard drawing (shared by the title screen and the game-over window)
const BOARD_ROW_H = 16, BOARD_ROWS_H = BOARD_ROW_H * 10;
// Header (+ optional tags) and up to 10 rows, or a short status line while loading / offline. (x, y) = top-left of the
// header; w = width. hi = row index to highlight (-1: none). hideRows: show the status instead of (stale) rows.
function drawBoardList(x, y, w, hi, hideRows, rightText) {
  const pad = 10, y0 = y + 20;
  const rows = board.rows;
  drawText('TOP 10', x + pad, y, 2, '#9fc4ff', 'left');
  // Cached rows stay on screen when a later fetch fails: flag that in the header (it replaces the BEST tag).
  // With no rows at all the status line in the middle already says OFFLINE.
  if (board.failed && rows && rows.length) drawText('OFFLINE', x + w - pad, y, 2, '#ff9a8a', 'right');
  else if (rightText) drawText(rightText, x + w - pad, y, 2, '#ffe27a', 'right');
  if (!rows || hideRows || rows.length === 0) {
    let msg, col = '#bfe8dc';
    if (hideRows || (!rows && !board.failed)) { msg = 'RANKING...'; if (!blinkOn(2.5)) col = '#6f93a8'; }
    else if (!rows) { msg = 'OFFLINE'; col = '#ff9a8a'; }
    else msg = 'NO SCORES YET';
    drawText(msg, x + w / 2, y0 + BOARD_ROWS_H / 2 - 14, 2, col, 'center');
    if (!rows && board.failed && !hideRows) drawText('PLAY ANYWAY!', x + w / 2, y0 + BOARD_ROWS_H / 2 + 8, 2, '#9fc4ff', 'center');
    return;
  }
  for (let i = 0; i < rows.length; i++) {
    const ry = y0 + i * BOARD_ROW_H, r = rows[i], on = i === hi;
    const col = on ? '#ffe27a' : i < 3 ? '#ffffff' : '#bcd4f0';
    if (on) {
      ctx.fillStyle = 'rgba(255,226,122,0.16)'; ctx.fillRect(x + 2, ry - 2, w - 4, BOARD_ROW_H);
      ctx.fillStyle = '#ffe27a';   // little pointing-hand stand-in
      ctx.fillRect(x + 2, ry + 1, 2, 12); ctx.fillRect(x + 4, ry + 3, 2, 8); ctx.fillRect(x + 6, ry + 5, 2, 4);
    }
    drawText(i + 1, x + pad + 22, ry, 2, col, 'right');
    drawText(r.name, x + pad + 34, ry, 2, col, 'left');
    drawText(r.score, x + w - pad, ry, 2, col, 'right');
  }
}

function drawTitleBoard() {
  const pw = Math.min(W - 24, 300), px = (W - pw) / 2, py = 334, ph = 196;
  drawWindow(px, py, pw, ph, 1);
  drawBoardList(px, py + 8, pw, -1, false, best > 0 ? 'BEST ' + best : '');
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
  drawTitleBoard();
  if (blinkOn(1.6)) {
    const t = textW('TAP / CLICK / SPACE TO FLAP', 2) <= W - 24 ? 'TAP / CLICK / SPACE TO FLAP' : 'TAP OR SPACE TO FLAP';
    drawText(t, W / 2, 544, 2, '#ffffff', 'center', { outline: OL });
  }
  drawCharButton();
  drawFanNote();
}

function drawHUD() {
  const sc = 8;
  drawText(score, W / 2, 40 - scoreBump * 6, sc, '#ffffff', 'center', { outline: OL, shadow: 'rgba(0,255,170,0.35)' });
  drawText('BEST ' + best, 12, 14, 2, '#bfe8dc', 'left', { outline: OL });
  // LV label: top-right, directly below the HTML mute button (48 CSS px incl. margin), opposite BEST. The hero lives on
  // the left, so a wide label can never sit on it; it pulses/scales on level-up.
  const lsc = lvPulse > 0.45 ? 4 : 3;
  const right = W - 12, ly = Math.round(48 * uiK) + 6;
  drawText('LV ' + curLevel(), right, ly, lsc, lvPulse > 0 ? '#ffffff' : '#8dffd2', 'right', { outline: OL, shadow: lvPulse > 0 ? 'rgba(0,255,170,0.6)' : undefined });
  // speed cue: thin meter from base speed to soft cap
  const bw = 54, frac = clamp((curSpeed() - BASE_SPEED) / (SPEED_SOFT_CAP - BASE_SPEED), 0, 1);
  const by = ly + 7 * 4 + 6, bx = right - bw;
  ctx.fillStyle = OL; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
  ctx.fillStyle = '#10303a'; ctx.fillRect(bx, by, bw, 5);
  ctx.fillStyle = frac > 0.66 ? '#ff7a5a' : frac > 0.33 ? '#ffd35a' : '#47ffb4'; ctx.fillRect(bx, by, Math.max(2, bw * frac), 5);
}

// Short line under BEST on the game-over window: what happened to this run's score on the board.
function resultLine() {
  const r = run;
  if (!r || r.final <= 0) return null;
  if (r.saved) {
    const i = board.rows && !board.awaitFresh ? board.rows.findIndex((x) => x.name === r.entry.name && x.score === r.entry.score) : -1;
    if (i >= 0) return { text: 'YOUR RANK: ' + (i + 1), color: '#7dffc4', hi: i };
    if (board.rows && !board.awaitFresh && !board.failed) return { text: 'NOT IN TOP 10', color: '#bfe8dc', hi: -1 };
    return { text: 'SCORE SAVED!', color: '#7dffc4', hi: -1 };
  }
  if (r.failed) return { text: 'SUBMIT FAILED', color: '#ff9a8a', hi: -1 };
  return null;
}

function drawOverUI() {
  const a = clamp(stateT / 0.35, 0, 1);
  ctx.fillStyle = `rgba(0,4,12,${0.55 * a})`; ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 24, 340), px = (W - pw) / 2;
  const py = 56 + (1 - a) * 30;
  const cx = W / 2, inner = pw - 36;
  const prompting = over.phase === 'wait' || over.phase === 'prompt';
  const fl = prompting ? wrapText(flavor, 2, inner) : [];
  const ph = prompting ? 350 + fl.length * 16 + 14 : 430;
  drawWindow(px, py, pw, ph, a);
  ctx.save();
  ctx.globalAlpha = a;
  const gsc = fitScale('GAME OVER', 5, inner);
  drawText('GAME OVER', cx, py + 16, gsc, '#ff6a5a', 'center', { outline: '#2a0a0e', shadow: 'rgba(0,0,0,0.4)' });
  drawText('SCORE', cx, py + 62, 2, '#9fc4ff', 'center');
  drawText(score, cx, py + 86, 6, '#ffffff', 'center', { outline: '#0a1430' });
  if (score >= 5) {
    const rgb = score >= 40 ? '255,90,90' : score >= 25 ? '255,220,90' : score >= 15 ? '90,160,255' : '71,255,180';
    drawMateria(px + 44, py + 107, 15, rgb);
  }
  const bt = 'BEST ' + best, bw = textW(bt, 2), nb = 'NEW BEST!';
  const bx0 = newBest ? cx - (bw + 16 + textW(nb, 2)) / 2 : cx;
  drawText(bt, bx0, py + 138, 2, '#ffe27a', newBest ? 'left' : 'center', { outline: '#0a1430' });
  if (newBest && blinkOn(3)) drawText(nb, bx0 + bw + 16, py + 138, 2, '#7dffc4', 'left', { outline: '#0a1430' });

  if (prompting) {
    const bx = px + 14, by = py + 166, bwid = pw - 28, bh = 172;
    if (over.phase === 'prompt') {
      const ba = clamp((nowMs() - over.t0) / 250, 0, 1);
      drawWindow(bx, by, bwid, bh, ba);
      ctx.globalAlpha = ba;
      drawText('ENTER YOUR NAME', bx + bwid / 2, by + 12, fitScale('ENTER YOUR NAME', 2, bwid - 20), '#9fc4ff', 'center');
      const okName = !!LB.cleanName(nameInput.value);
      const hint = !okName ? 'ENTER A NAME (1-12)' : coarsePointer ? 'TAP SUBMIT' : 'ENTER=SUBMIT';
      const msg = np.msg || hint;
      const col = np.failed ? '#ff9a8a' : (!np.msg && !okName) ? '#ffd35a' : np.msg ? '#ffffff' : '#7f9cc4';
      drawText(msg, bx + bwid / 2, by + 144, fitScale(msg, 2, bwid - 16), col, 'center');
      layoutPrompt({ x: bx, y: by, w: bwid, h: bh });
      nameForm.style.opacity = ba;
    }
    ctx.globalAlpha = a;
    lines(fl, cx, py + 350, 2, '#bfe8dc', 16);
  } else {
    const rl = resultLine();
    if (rl) drawText(rl.text, cx, py + 158, 2, rl.color, 'center', { outline: '#0a1430' });
    ctx.fillStyle = '#4a6fa0'; ctx.fillRect(px + 14, py + 180, pw - 28, 2);
    const hideRows = board.awaitFresh && !!(run && run.saved);
    drawBoardList(px + 14, py + 190, pw - 28, rl ? rl.hi : -1, hideRows);
    if (stateT > 0.5 && blinkOn(1.8)) {
      const t = 'TAP TO TRY AGAIN';
      drawText(t, cx, py + ph - 42, fitScale(t, 3, inner), '#ffffff', 'center', { outline: '#0a1430' });
    }
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
  if (state !== ST_SELECT) drawChar(state === ST_TITLE ? selChar : playChar, bird.x, bird.y, bird.rot, bird.flapT > 0 ? 1 : 0, e, dead, U, true);
  drawMotes();
  ctx.restore();

  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);

  if (state === ST_TITLE) drawTitleUI();
  else if (state === ST_SELECT) drawSelectUI();
  else if (state === ST_PLAY || state === ST_DYING) drawHUD();
  else if (state === ST_OVER) { drawHUD(); drawOverUI(); }
  if (paused) drawPaused();
  if (lvFlash > 0 && state === ST_PLAY) { ctx.fillStyle = `rgba(110,255,200,${lvFlash * 0.16})`; ctx.fillRect(0, 0, W, H); }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.7})`; ctx.fillRect(0, 0, W, H); }
}

// ------------------------------------------------------------------ input
function onAction() {
  Sfx.unlock();
  if (state === ST_SELECT) return;   // select screen has its own key/pointer handling
  if (paused) { paused = false; return; }
  if (state === ST_TITLE) { resetRun(); setState(ST_PLAY); flap(); }
  else if (state === ST_PLAY) flap();
  // Game over: never restart while the name prompt is (about to be) up; after it, wait a beat so a double-tap on
  // SUBMIT/CONTINUE can't instantly launch the next run.
  else if (state === ST_OVER && stateT > 0.5 && over.phase === 'board' && nowMs() - over.t0 > 400) { resetRun(); setState(ST_PLAY); flap(); }
}

// ---- name prompt (HTML <input> + buttons overlaid on the canvas; real input => mobile keyboards just work)
const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
function openPrompt() {
  over.phase = 'prompt'; over.t0 = nowMs();
  np.open = true; np.busy = false; np.failed = false; np.msg = ''; np.openedAt = nowMs(); np.layoutKey = '';
  nameInput.value = LB.filterName(store(NAME_KEY) || '').trim();
  nameInput.disabled = false; nameSubmit.hidden = false; nameContinue.hidden = true;
  syncSubmit();
  nameForm.hidden = false;
  if (!coarsePointer) {   // on touch devices focusing programmatically would not raise the keyboard anyway
    try { nameInput.focus({ preventScroll: true }); const n = nameInput.value.length; nameInput.setSelectionRange(n, n); } catch (e) { /* ignore */ }
  }
}
function closePrompt() {
  np.open = false; np.busy = false;
  nameForm.hidden = true;
  const ae = document.activeElement;
  if (ae && nameForm.contains(ae)) ae.blur();
}
function enterBoard() { over.phase = 'board'; over.t0 = nowMs(); closePrompt(); }

// Submit is only enabled while the typed name is valid (1-12 chars of A-Z a-z 0-9 space _ . -).
function syncSubmit() { nameSubmit.disabled = np.busy || np.failed || !LB.cleanName(nameInput.value); }
// Leave the name prompt for the board. Only reachable after a real submit attempt (success or failed save).
function continueFromPrompt() {
  if (!np.open || !np.failed) return;
  enterBoard();
}
function submitName() {
  if (!np.open || np.busy || nowMs() - np.openedAt < 350) return;
  if (np.failed) { continueFromPrompt(); return; }
  const r = run;
  if (!canSubmit(r)) { enterBoard(); return; }          // run already submitted/stale: nothing left to ask
  const name = LB.cleanName(nameInput.value);
  if (!name) { syncSubmit(); try { nameInput.focus(); } catch (e) { /* ignore */ } return; }   // invalid: never POST
  const sc = r.final;                       // the frozen score of THIS run, never user input
  r.submitted = true; r.entry = { name, score: sc };
  store(NAME_KEY, name);
  np.busy = true; np.msg = 'SAVING...';
  nameInput.disabled = true; syncSubmit();
  LB.submit(name, sc).then((res) => {
    const here = over.phase === 'prompt' && r === run;
    if (res.ok) {
      r.saved = true;
      if (r === run) board.awaitFresh = true;
      refreshBoard();                       // pull the new standings
      if (here) enterBoard();
    } else {
      r.failed = true;
      if (here) {
        np.busy = false; np.failed = true; np.msg = "COULDN'T SAVE SCORE";
        nameSubmit.hidden = true; nameContinue.hidden = false; syncSubmit(); np.layoutKey = '';
        try { nameContinue.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }
    }
  });
}

// Position the DOM controls over the canvas box g (logical units).
function layoutPrompt(g) {
  const k = stage.clientWidth / W;          // CSS px per logical unit
  const key = [g.x, g.y, g.w, g.h, k.toFixed(3), nameSubmit.hidden ? 1 : 0].join('|');
  if (key === np.layoutKey) return;
  np.layoutKey = key;
  const put = (el, x, y, w, h, fs) => {
    const st = el.style;
    st.left = (x * k) + 'px'; st.top = (y * k) + 'px'; st.width = (w * k) + 'px'; st.height = (h * k) + 'px'; st.fontSize = fs + 'px';
  };
  put(nameInput, g.x + 12, g.y + 34, g.w - 24, 40, Math.max(16, 17 * k));
  const by = g.y + 86, bfs = Math.max(13, 14 * k);
  if (nameSubmit.hidden) put(nameContinue, g.x + 12, by, g.w - 24, 44, bfs);
  else put(nameSubmit, g.x + 12, by, g.w - 24, 44, bfs);
}

nameForm.addEventListener('submit', (e) => { e.preventDefault(); submitName(); });
nameContinue.addEventListener('click', () => continueFromPrompt());
nameInput.addEventListener('input', () => {
  if (nameInput.composing) return;
  const v = nameInput.value, f = LB.filterName(v);
  if (f !== v) {                            // drop disallowed characters, keep the caret where it was
    const pos = nameInput.selectionStart == null ? v.length : nameInput.selectionStart;
    nameInput.value = f;
    const p = LB.filterName(v.slice(0, pos)).length;
    try { nameInput.setSelectionRange(p, p); } catch (e) { /* ignore */ }
  }
  syncSubmit();
});
nameInput.addEventListener('compositionstart', () => { nameInput.composing = true; });
nameInput.addEventListener('compositionend', () => { nameInput.composing = false; nameInput.dispatchEvent(new Event('input')); });
// Keys typed in the prompt belong to the prompt: keep them away from the game's global shortcuts (Space/W/M/P ...).
nameForm.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (nowMs() - np.openedAt < 500) { e.preventDefault(); return; }   // swallow flap-mashing from the run that just ended
  if (e.key === 'Escape') e.preventDefault();   // Esc does nothing here: a name must be submitted
  else if (e.key === 'Enter' && e.target === nameInput) { e.preventDefault(); if (!e.repeat) submitName(); }   // (buttons keep native Enter/Space)
});
nameForm.addEventListener('keyup', (e) => e.stopPropagation());
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
  if (np.open) {   // keys outside the form while the prompt is up: Enter = submit (or continue after a failed save); nothing else may flap or restart
    if (e.code === 'Escape' || e.code === 'Space') e.preventDefault();
    if (!e.repeat && nowMs() - np.openedAt > 500 && e.code === 'Enter') { e.preventDefault(); submitName(); }
    return;
  }
  if (state === ST_SELECT) { selKey(e); return; }
  if (e.code === 'KeyC' && state === ST_TITLE) { e.preventDefault(); if (!e.repeat) openSelect(); return; }
  if (e.code === 'Space' || e.key === ' ' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) onAction();
  } else if (e.code === 'KeyM') { if (!e.repeat) toggleMute(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) togglePause(); }
}, { passive: false });
window.addEventListener('keyup', (e) => { if (e.code === 'Space') e.preventDefault(); }, { passive: false });

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('#mute, #namebox')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const pt = toLogical(e);
  if (state === ST_SELECT) { selDown = { x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
  if (state === ST_TITLE && pt && inRect(pt.x, pt.y, charBtnHit())) { Sfx.unlock(); openSelect(); return; }
  onAction();
}, { passive: false });
document.addEventListener('pointerup', (e) => {
  if (state !== ST_SELECT || !selDown || selDown.id !== e.pointerId) return;
  const d = selDown; selDown = null;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { selMove(dx < 0 ? 1 : -1); return; }   // swipe
  if (Math.hypot(dx, dy) > 14) return;
  const pt = toLogical(e);
  if (pt) selTap(pt.x, pt.y);
});
document.addEventListener('pointercancel', () => { selDown = null; });
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
refreshBoard();   // title-screen standings
bird.x = birdX();
requestAnimationFrame(frame);
})();
