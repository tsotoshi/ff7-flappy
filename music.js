/* music.js — original, runtime-synthesized fan character themes + shared Web Audio for Midgar Flap.
 * Not official FF7 music: these are original vibe-only sketches (no Square Enix melodies, samples or audio files).
 * Contains: note data for four themes (cloud/sephiroth/yuffie/barret), a look-ahead Web Audio sequencer that loops
 * seamlessly, and the shared AudioContext with separate music / SFX gains (window.GameAudio).
 */
(function (root) {
'use strict';
  const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const N = (s) => {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    return 12 * (+m[3] + 1) + BASE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  /** push a run of [name|null, beats] items starting at beat `t0`; gate<1 = staccato */
  function run(out, inst, t0, items, v, gate, extra) {
    let t = t0;
    for (const [nm, d] of items) {
      if (nm) out.push(Object.assign({ i: inst, p: N(nm), t, d: d * (gate || 1), v }, extra));
      t += d;
    }
    return t;
  }

  /* ───────────────────── SEPHIROTH: E phrygian / diminished, 100 BPM ───────────────────── */
  function sephiroth() {
    const notes = [];
    // Em | F | Em | C#dim7 | F | B7   (6 bars)
    const roots = [40, 41, 40, 37, 41, 35];
    const chords = [
      ['E3', 'G3', 'B3'], ['F3', 'A3', 'C4'], ['E3', 'G3', 'B3'],
      ['C#3', 'E3', 'G3', 'Bb3'], ['F3', 'A3', 'C4'], ['B2', 'D#3', 'F#3', 'A3'],
    ];
    const mel = [
      [['G4', 1.5], ['B4', .5], ['C5', 2]],
      [['A4', 1.5], ['C5', .5], ['E5', 2]],
      [['G4', 1.5], ['B4', .5], ['D5', 1], ['C5', 1]],
      [['Bb4', 1.5], ['G4', .5], ['E4', 2]],
      [['A4', 1.5], ['C5', .5], ['F5', 2]],
      [['F#5', 1], ['D#5', 1], ['B4', 2]],
    ];
    const accent = [1, .45, .6, .45, .85, .45, .6, .45];
    for (let b = 0; b < 6; b++) {
      const t0 = b * 4, r = roots[b];
      chords[b].forEach((nm) => {
        notes.push({ i: 'pad', p: N(nm), t: t0, d: 4.1, v: .85 });
        notes.push({ i: 'ooh', p: N(nm) + 12, t: t0, d: 4.1, v: .7, l: [2] });
      });
      run(notes, 'lead', t0, mel[b], .85, 1.0);
      run(notes, 'lead', t0, mel[b].map(([n, d]) => [n && (n.slice(0, -1) + (+n.slice(-1) + 1)), d]), .45, 1.0, { l: [2] });
      // low pulse bass (eighths loop 1; gallop sixteenths in last two bars of loop 2)
      for (let loop = 1; loop <= 2; loop++) {
        if (loop === 2 && b >= 4) {
          for (let k = 0; k < 16; k++) notes.push({ i: 'bass', p: r, t: t0 + k * .25, d: .2, v: k % 4 === 0 ? 1 : (k % 2 ? .4 : .6), l: [2] });
        } else {
          accent.forEach((a, k) => notes.push({ i: 'bass', p: r, t: t0 + k * .5, d: .4, v: a, l: [loop] }));
        }
      }
      notes.push({ i: 'sub', p: r, t: t0, d: 1.9, v: .9 }, { i: 'sub', p: r, t: t0 + 2, d: 1.9, v: .7 });
      // sparse heavy percussion
      notes.push({ i: 'kick', t: t0, d: .3, v: 1 });
      if (b % 2 === 0) notes.push({ i: 'taiko', t: t0 + 2.5, d: .4, v: .8 });
      else notes.push({ i: 'slam', t: t0 + 3, d: .4, v: .9 });
      notes.push({ i: 'click', t: t0 + 1.5, d: .05, v: .6 }, { i: 'click', t: t0 + 3.5, d: .05, v: .4 });
    }
    // end-of-loop-1 riser into loop 2; triplet taiko fill closing loop 2
    notes.push({ i: 'swell', t: 20, d: 4, v: .8, l: [1] });
    [3, 3.333, 3.667].forEach((x, k) => notes.push({ i: 'taiko', t: 20 + x, d: .3, v: .7 + k * .1, l: [2] }));
    // loop-2 dark bell tritone on the diminished bar & dominant bar
    [[12, 'Bb4', 'E5'], [20, 'F5', 'B4']].forEach(([t, a, b]) => {
      notes.push({ i: 'bell', p: N(a), t, d: 2, v: .8, l: [2] }, { i: 'bell', p: N(b), t, d: 2, v: .7, l: [2] });
    });

    return {
      id: 'sephiroth', title: 'Sephiroth — dark tension', bpm: 100, beatsPerBar: 4, bars: 6, loops: 2, fadeOut: 1.5,
      echo: { beats: 1.5, fb: 0.4, mix: 1 },
      instruments: {
        bass: { type: 'osc', wave: 'pulse', duty: 0.3, lp: 520, gain: 0.5, adsr: [0.004, 0.1, 0.5, 0.06], pan: 0 },
        sub: { type: 'osc', wave: 'sine', gain: 0.45, adsr: [0.01, 0.2, 0.8, 0.2], pan: 0 },
        pad: { type: 'osc', wave: 'saw', lp: 1100, gain: 0.07, adsr: [0.7, 0.3, 0.85, 1.0],
          voices: [{ cents: -14, pan: -0.6 }, { cents: -4, pan: -0.2 }, { cents: 5, pan: 0.2 }, { cents: 14, pan: 0.6 }],
          vib: { rate: 4.8, depth: 9, delay: 0.5 }, echo: 0.2 },
        ooh: { type: 'osc', wave: 'triangle', lp: 1800, gain: 0.07, adsr: [0.9, 0.3, 0.8, 1.0],
          voices: [{ cents: -10, pan: -0.5 }, { cents: 0, pan: 0 }, { cents: 10, pan: 0.5 }],
          vib: { rate: 5.2, depth: 14, delay: 0.4 }, echo: 0.3 },
        lead: { type: 'osc', wave: 'pulse', duty: 0.2, lp: 2600, gain: 0.15, adsr: [0.03, 0.2, 0.6, 0.35], pan: 0.1, echo: 0.45,
          vib: { rate: 5, depth: 16, delay: 0.25 } },
        bell: { type: 'osc', wave: 'sine', gain: 0.12, adsr: [0.002, 1.4, 0.0, 0.8], pan: 0.2, echo: 0.5 },
        kick: { type: 'thud', f0: 120, f1: 36, sweep: 0.05, decay: 0.38, gain: 1.0 },
        taiko: { type: 'thud', f0: 130, f1: 58, sweep: 0.08, decay: 0.5, gain: 0.8, pan: -0.15 },
        slam: { type: 'noise', hp: 250, lp: 5500, decay: 0.4, gain: 0.45, tone: { f: 120, amt: 0.7, decay: 0.2 }, echo: 0.15 },
        swell: { type: 'noise', hp: 500, lp: 7000, rise: true, decay: 0.12, gain: 0.25 },
        click: { type: 'noise', hp: 4500, lp: 14000, decay: 0.02, gain: 0.1, pan: -0.3 },
      },
      notes,
    };
  }


  /* ───────────── CLOUD V3: G minor -> G major, 116 BPM, march (16 bars) ─────────────
   * bars 0-3 brooding minor intro | 4-11 lifted major hook (5th-below doubling) | 12-15 recap + tail */
  function cloudV3() {
    const n = [];
    const roots = [43, 39, 48, 50, 43, 47, 48, 50, 40, 48, 45, 50, 43, 48, 50, 43];
    const ch = [
      ['G3', 'Bb3', 'D4'], ['Eb3', 'G3', 'Bb3'], ['C4', 'Eb4', 'G4'], ['D4', 'F#4', 'A4'],
      ['G3', 'B3', 'D4'], ['B3', 'D4', 'F#4'], ['C4', 'E4', 'G4'], ['D4', 'F#4', 'A4'],
      ['E4', 'G4', 'B4'], ['C4', 'E4', 'G4'], ['A3', 'C4', 'E4'], ['D4', 'F#4', 'A4'],
      ['G3', 'B3', 'D4'], ['C4', 'Eb4', 'G4'], ['D4', 'F#4', 'A4'], ['G3', 'B3', 'D4'],
    ];
    const hookA = [['D5', 1], ['G5', 1.5], ['B5', .5], ['A5', 1]];
    const mel = [
      [['G4', 1.5], ['Bb4', .5], ['D5', 2]],
      [['Eb5', 1.5], ['D5', .5], ['Bb4', 2]],
      [['C5', 1], ['Eb5', 1], ['G5', 1.5], ['F5', .5]],
      [['D5', 2], ['C5', 1], ['A4', 1]],
      hookA,
      [['F#5', 1], ['D5', .5], ['F#5', 1.5], ['A5', 1]],
      [['G5', 1], ['E5', 1], ['C6', 1.5], ['B5', .5]],
      [['A5', 2], ['F#5', 1], ['D5', 1]],
      [['E5', 1], ['G5', .5], ['B5', 1.5], ['A5', .5], ['G5', .5]],
      [['C6', 1], ['E6', 2], ['D6', 1]],
      [['C6', 1.5], ['B5', .5], ['A5', 1], ['E5', 1]],
      [['F#5', 1], ['A5', 1], ['D6', 2]],
      hookA,
      [['Eb5', 1], ['G5', 1.5], ['C6', 1.5]],
      [['A5', 1], ['F#5', 1], ['D5', 2]],
      [['G5', 3.5]],
    ];
    mel.forEach((items, b) => {
      const t0 = b * 4, fin = b === 15;
      run(n, 'lead', t0, items, b < 4 ? .7 : fin ? .95 : .95, b < 4 ? .9 : .93);
    });
    // fifth-below doubling in the lifted section (bars 4-12)
    for (let b = 4; b <= 12; b++) {
      let t = b * 4;
      for (const [nm, d] of mel[b]) { if (nm) n.push({ i: 'harm', p: N(nm) - 7, t, d: d * .93, v: .75 }); t += d; }
    }
    for (let b = 0; b < 16; b++) {
      const t0 = b * 4, r = roots[b], lifted = b >= 4, fin = b === 15;
      // pad
      ch[b].forEach((nm) => n.push({ i: 'pad', p: N(nm), t: t0, d: fin ? 4.2 : 4.05, v: lifted ? .9 : .6 }));
      // marching bass: root, root, fifth, root
      if (fin) { n.push({ i: 'bass', p: r, t: t0, d: 3.5, v: 1 }); continue; }
      [[0, 0], [1, 0], [2, 7], [3, 0]].forEach(([k, o]) => n.push({ i: 'bass', p: r + o, t: t0 + k, d: .8, v: k === 0 ? 1 : .8 }));
      // drums: kick 1&3, snare 2&4 (lifted); intro sparser
      n.push({ i: 'kick', t: t0, d: .2, v: 1 });
      if (lifted) n.push({ i: 'kick', t: t0 + 2, d: .2, v: .9 });
      n.push({ i: 'snare', t: t0 + 1, d: .2, v: lifted ? .85 : .5 }, { i: 'snare', t: t0 + 3, d: .2, v: lifted ? .95 : .6 });
      if (b % 2) n.push({ i: 'snare', t: t0 + 3.5, d: .1, v: .45 }, { i: 'snare', t: t0 + 3.75, d: .1, v: .55 });
      if (lifted) for (let k = 0; k < 4; k++) n.push({ i: 'hat', t: t0 + k + .5, d: .1, v: .5 });
    }
    // fills & accents
    [[3, 2.5], [11, 2.5]].forEach(([b, o]) => { for (let k = 0; k < 6; k++) n.push({ i: 'snare', t: b * 4 + o + k * .25, d: .1, v: .4 + k * .1 }); });
    n.push({ i: 'swell', t: 13, d: 3, v: .6 });
    n.push({ i: 'crash', t: 16, d: 1, v: .9 }, { i: 'crash', t: 48, d: 1, v: .7 }, { i: 'crash', t: 60, d: 1, v: .8 });

    return {
      id: 'cloudV3', title: 'Cloud v3 — G minor to major march', bpm: 116, beatsPerBar: 4, bars: 16, loops: 1, fadeOut: 1.2,
      echo: { beats: 0.75, fb: 0.3, mix: 1 },
      instruments: {
        lead: { type: 'osc', wave: 'square', lp: 3400, gain: 0.17, adsr: [0.012, 0.12, 0.75, 0.12], pan: 0.05, echo: 0.2,
          vib: { rate: 5.4, depth: 12, delay: 0.3 } },
        harm: { type: 'osc', wave: 'pulse', duty: 0.3, lp: 2200, gain: 0.1, adsr: [0.015, 0.12, 0.75, 0.12], pan: -0.3, echo: 0.15 },
        pad: { type: 'osc', wave: 'saw', lp: 800, gain: 0.04, adsr: [0.25, 0.3, 0.85, 0.5],
          voices: [{ cents: -9, pan: -0.5 }, { cents: 9, pan: 0.5 }] },
        bass: { type: 'osc', wave: 'triangle', gain: 0.55, adsr: [0.004, 0.1, 0.8, 0.06] },
        kick: { type: 'thud', f0: 130, f1: 42, sweep: 0.04, decay: 0.28, gain: 1.0 },
        snare: { type: 'noise', hp: 1200, lp: 8000, decay: 0.16, gain: 0.35, tone: { f: 190, amt: 0.4, decay: 0.08 }, pan: 0.05 },
        hat: { type: 'noise', hp: 7000, lp: 16000, decay: 0.04, gain: 0.08, pan: 0.25 },
        crash: { type: 'noise', hp: 3000, lp: 14000, decay: 1.2, gain: 0.15, pan: -0.2 },
        swell: { type: 'noise', hp: 500, lp: 7000, rise: true, decay: 0.12, gain: 0.18 },
      },
      notes: n,
    };
  }

  /* ───────────────────────── YUFFIE: B♭ major pentatonic-ish, 156 BPM, 20 bars ───────────────────────── */
  function yuffie() {
    const notes = [];
    // item = [name|null, beats, grace?]; grace=true inserts a quick whole-step-below pickup (1/8 beat)
    const lead = (b0, bars, v, oct, delay, inst, gate) => bars.forEach((items, b) => {
      let t = (b0 + b) * 4 + (delay || 0);
      for (const [nm, d, gr] of items) {
        if (nm) {
          const p = N(nm) + (oct || 0);
          if (gr) { notes.push({ i: inst, p: p - 2, t, d: 0.1, v: v * 0.7 }); notes.push({ i: inst, p, t: t + 0.125, d: (d - 0.125) * gate, v }); }
          else notes.push({ i: inst, p, t, d: d * gate, v });
        }
        t += d;
      }
    });
    const A1 = [
      [['F5', .5], ['G5', .5], ['F5', .5], ['D5', .5], [null, .5], ['D5', .5], ['G5', .5], ['F5', .5]],
      [['D5', .5], ['C5', .5], ['Bb4', 1], [null, .5], ['C5', .5], ['D5', 1]],
      [['G5', .5], ['A5', .5], ['G5', .5], ['F5', .5], [null, .5], ['F5', .5], ['D5', .5], ['C5', .5]],
      [['D5', .5], ['F5', .5], ['G5', 1], ['F5', .5], [null, 1.5]],
    ];
    const A2 = [ // same hook with pickup ornaments, higher answer at the end
      [['F5', .5], ['G5', .5, 1], ['F5', .5], ['D5', .5, 1], [null, .5], ['D5', .5], ['G5', .5, 1], ['F5', .5]],
      A1[1],
      [['G5', .5, 1], ['A5', .5], ['G5', .5], ['F5', .5], [null, .5], ['F5', .5], ['D5', .5], ['C5', .5]],
      [['D5', .5], ['F5', .5], ['G5', .5], ['A5', .5], ['D6', 1], [null, 1]],
    ];
    const B = [
      [['G5', .5], ['Bb5', .5], ['G5', .5], ['Eb5', .5], [null, .5], ['Eb5', .5], ['G5', 1]],
      [['A5', .5], ['C6', .5], ['A5', .5], ['F5', .5], [null, .5], ['F5', .5], ['A5', 1]],
      [['G5', .5], ['F5', .5], ['D5', .5], ['G5', .5], ['F5', .5], ['D5', .5], ['Bb4', 1]],
      [['C5', .5], ['E5', .5], ['F5', .5], ['A5', .5], ['C6', 1], [null, 1]],
    ];
    const T = [
      A1[0], A1[1],
      [['G5', .5], ['F5', .5], ['D5', .5], ['C5', .5], ['Bb4', .5], ['D5', .5], ['F5', .5], ['Bb5', .5]],
      [['Bb5', .5], [null, 3.5]],
    ];
    lead(0, A1, 0.85, 0, 0, 'lead', 0.5);
    lead(4, A2, 0.85, 0, 0, 'lead', 0.5);
    lead(8, B, 0.88, 0, 0, 'lead', 0.5);
    lead(12, A2, 0.85, 0, 0, 'lead', 0.5);
    lead(16, T, 0.88, 0, 0, 'lead', 0.5);
    // sparkle echo-canon an octave up, a sixteenth late (B section + last A)
    lead(8, B, 0.32, 12, 0.25, 'sparkle', 0.4);
    lead(12, A2, 0.3, 12, 0.25, 'sparkle', 0.4);
    // hopping bass: root, fifth, root, fifth
    const roots = [46, 46, 43, 41, 46, 46, 43, 41, 39, 41, 43, 41, 46, 46, 43, 41, 46, 46, [39, 41], 46];
    roots.forEach((r, b) => {
      const rs = Array.isArray(r) ? r : [r, r];
      const t0 = b * 4;
      const pat = [[0, rs[0], 0], [1.5, rs[0], 7], [2, rs[1], 0], [3.5, rs[1], 7]];
      pat.forEach(([t, rr, o]) => { if (b === 19 && t > 0) return; notes.push({ i: 'bass', p: rr + o, t: t0 + t, d: 0.3, v: 0.9 }); });
    });
    // percussion
    for (let b = 0; b < 20; b++) {
      const t0 = b * 4, last = b === 19;
      notes.push({ i: 'kick', t: t0, d: 0.2, v: 0.9 });
      if (last) { notes.push({ i: 'snare', t: t0 + 1, d: 0.1, v: 0.6 }); continue; }
      notes.push({ i: 'kick', t: t0 + 2, d: 0.2, v: 0.7 });
      if (b % 2) notes.push({ i: 'kick', t: t0 + 3.5, d: 0.2, v: 0.55 });
      notes.push({ i: 'clap', t: t0 + 1, d: 0.1, v: 0.7 });
      notes.push({ i: 'clap', t: t0 + 3, d: 0.1, v: 0.7 });
      for (const o of [0.5, 1.5, 2.5, 3.5]) notes.push({ i: 'wood', t: t0 + o, d: 0.1, v: o === 1.5 || o === 3.5 ? 0.8 : 0.6 });
      for (const o of [0, 2]) notes.push({ i: 'wood2', t: t0 + o + 0.75, d: 0.1, v: 0.5 });
      if (b === 7 || b === 15) for (let k = 0; k < 4; k++) notes.push({ i: 'clap', t: t0 + 3 + k * 0.25, d: 0.1, v: 0.4 + k * 0.1 });
    }
    return {
      id: 'yuffie', title: 'Yuffie — playful ninja hop', bpm: 156, beatsPerBar: 4, bars: 20, loops: 1, fadeOut: 1.2,
      echo: { beats: 0.5, fb: 0.25, mix: 0.7 },
      instruments: {
        lead: { type: 'osc', wave: 'square', lp: 4200, gain: 0.2, adsr: [0.003, 0.06, 0.55, 0.04], pan: -0.05, echo: 0.2 },
        sparkle: { type: 'osc', wave: 'pulse', duty: 0.2, lp: 4800, gain: 0.14, adsr: [0.003, 0.05, 0.4, 0.04], pan: 0.45, echo: 0.3 },
        bass: { type: 'osc', wave: 'pulse', duty: 0.25, lp: 900, gain: 0.5, adsr: [0.003, 0.06, 0.5, 0.04], pan: 0 },
        kick: { type: 'thud', f0: 150, f1: 48, sweep: 0.025, decay: 0.14, gain: 0.85 },
        clap: { type: 'noise', hp: 1500, lp: 7000, decay: 0.07, gain: 0.22, pan: 0.1 },
        snare: { type: 'noise', hp: 1400, lp: 8000, decay: 0.12, gain: 0.3, tone: { f: 200, amt: 0.4, decay: 0.07 }, pan: 0.05 },
        wood: { type: 'noise', hp: 1600, lp: 3400, decay: 0.035, gain: 0.3, tone: { f: 1150, amt: 0.45, decay: 0.035 }, pan: -0.3 },
        wood2: { type: 'noise', hp: 1800, lp: 4000, decay: 0.03, gain: 0.26, tone: { f: 1550, amt: 0.4, decay: 0.03 }, pan: 0.3 },
      },
      notes,
    };
  }

  /* ───────────────────────── BARRET: F minor pentatonic → A♭ major, 96 BPM, 12 bars ───────────────────────── */
  function barret() {
    const notes = [];
    const put = (b0, bars, inst, v, oct, gate) => bars.forEach((items, b) => {
      let t = (b0 + b) * 4;
      for (const [nm, d] of items) { if (nm) notes.push({ i: inst, p: N(nm) + oct, t, d: d * gate, v }); t += d; }
    });
    const A1 = [
      [['C5', .75], ['C5', .25], ['Eb5', 1], ['C5', .5], [null, .5], ['Ab4', 1]],
      [['Bb4', .75], ['Bb4', .25], ['C5', 1.5], [null, .5], ['F4', 1]],
      [['Ab4', .75], ['Ab4', .25], ['Db5', 1], ['C5', .5], [null, .5], ['Ab4', 1]],
      [['Bb4', 1], ['C5', .5], ['Eb5', .5], ['F5', 1.5], [null, .5]],
    ];
    const A2 = [A1[0], A1[1], A1[2],
      [['Bb4', .5], ['C5', .5], ['Eb5', .5], ['F5', .5], ['Ab5', 1], ['F5', .5], ['Eb5', .5]]];
    const B = [
      [['Ab4', 1], ['Db5', 1], ['F5', 2]],
      [['Eb5', 1.5], ['Db5', .5], ['C5', 1], ['Bb4', 1]],
      [['C5', 1], ['Eb5', 1], ['Ab5', 2]],
      [['Ab5', 3]],
    ];
    put(0, A1, 'brass', 0.9, 0, 0.9);
    put(4, A2, 'brass', 0.9, 0, 0.9);
    put(4, A2, 'brass', 0.5, -12, 0.9);
    put(8, B, 'brass', 0.95, 0, 0.95);
    put(8, B, 'brass', 0.55, -12, 0.95);
    // warm pad on the B section
    const tri = [['Db4', 'F4', 'Ab4'], ['Eb4', 'G4', 'Bb4'], ['Ab3', 'C4', 'Eb4'], ['Ab3', 'C4', 'Eb4']];
    tri.forEach((ch, b) => ch.forEach((nm) => notes.push({ i: 'pad', p: N(nm), t: (8 + b) * 4, d: b === 3 ? 4 : 3.9, v: 0.9 })));
    // syncopated bass
    const roots = [41, 41, 37, 39, 41, 41, 37, 39, 37, 39, 44, 44];
    roots.forEach((r, b) => {
      const t0 = b * 4;
      const pat = b === 11 ? [[0, 1.5, 0]] : [[0, .5, 0], [.75, .25, 0], [1.5, .5, 12], [2, .5, 0], [2.75, .25, 0], [3.5, .5, 7]];
      pat.forEach(([t, d, o]) => notes.push({ i: 'bass', p: r + o, t: t0 + t, d: d * 0.9, v: b === 11 ? 1 : 0.95 }));
    });
    // drums
    for (let b = 0; b < 12; b++) {
      const t0 = b * 4, big = b >= 8;
      if (b === 11) { notes.push({ i: 'kick', t: t0, d: .3, v: 1 }); notes.push({ i: 'crash', t: t0, d: .5, v: 0.7 }); continue; }
      const ks = big ? [0, 1, 2, 3] : [0, 1.75, 2.5];
      ks.forEach((k) => notes.push({ i: 'kick', t: t0 + k, d: .3, v: big ? 0.9 : 1 }));
      notes.push({ i: 'snare', t: t0 + 1, d: .2, v: 1 });
      notes.push({ i: 'snare', t: t0 + 3, d: .2, v: 1 });
      if (!big) notes.push({ i: 'snare', t: t0 + 3.75, d: .1, v: 0.35 });
      for (let k = 0; k < 8; k++) notes.push({ i: 'hat', t: t0 + k * .5, d: .1, v: k % 2 ? 0.45 : 0.8 });
      if (b === 3 || b === 7) { notes.push({ i: 'snare', t: t0 + 3.5, d: .1, v: 0.7 }); notes.push({ i: 'snare', t: t0 + 3.75, d: .1, v: 0.85 }); }
      if (b === 8) notes.push({ i: 'crash', t: t0, d: .5, v: 0.6 });
    }
    return {
      id: 'barret', title: 'Barret — big-hearted stomp', bpm: 96, beatsPerBar: 4, bars: 12, loops: 1, fadeOut: 1.4,
      echo: { beats: 0.75, fb: 0.25, mix: 0.5 },
      instruments: {
        brass: { type: 'osc', wave: 'pulse', duty: 0.4, lp: 2200, gain: 0.2, adsr: [0.025, 0.12, 0.7, 0.1], pan: 0, echo: 0.15,
          voices: [{ cents: -6, pan: -0.15 }, { cents: 6, pan: 0.15 }], vib: { rate: 5, depth: 10, delay: 0.35 } },
        pad: { type: 'osc', wave: 'saw', lp: 900, gain: 0.05, adsr: [0.3, 0.3, 0.85, 0.5],
          voices: [{ cents: -10, pan: -0.5 }, { cents: 10, pan: 0.5 }] },
        bass: { type: 'osc', wave: 'pulse', duty: 0.3, lp: 800, gain: 0.5, adsr: [0.004, 0.08, 0.7, 0.05],
          voices: [{ cents: -9, pan: 0 }, { cents: 9, pan: 0 }] },
        kick: { type: 'thud', f0: 125, f1: 44, sweep: 0.04, decay: 0.26, gain: 1.0 },
        snare: { type: 'noise', hp: 900, lp: 7500, decay: 0.2, gain: 0.42, tone: { f: 185, amt: 0.5, decay: 0.1 }, pan: 0.05 },
        hat: { type: 'noise', hp: 7000, lp: 16000, decay: 0.045, gain: 0.1, pan: 0.25 },
        crash: { type: 'noise', hp: 3000, lp: 16000, decay: 1.1, gain: 0.18, pan: -0.2 },
      },
      notes,
    };
  }

  const THEMES = { cloudV3: cloudV3(), sephiroth: sephiroth(), yuffie: yuffie(), barret: barret() };
  // character id -> theme. Every other character has no music (and no fallback bed).
  const THEME_OF = { cloud: 'cloudV3', sephiroth: 'sephiroth', yuffie: 'yuffie', barret: 'barret' };

  /* ───────────── sequencer: theme data -> Web Audio, looping seamlessly ───────────── */
  const mtof = (p) => 440 * Math.pow(2, (p - 69) / 12);

  /** Expand one full cycle (theme.loops passes, so sephiroth includes its loop-2 variations) into timed events. */
  function expand(theme) {
    const spb = 60 / theme.bpm, loopBeats = theme.bars * theme.beatsPerBar, ev = [];
    for (let loop = 1; loop <= theme.loops; loop++) {
      for (const n of theme.notes) {
        if (n.l && n.l.indexOf(loop) < 0) continue;
        ev.push({ inst: n.i, freq: n.p == null ? null : mtof(n.p),
          time: ((loop - 1) * loopBeats + n.t) * spb, dur: n.d * spb, vel: n.v });
      }
    }
    ev.sort((a, b) => a.time - b.time);
    return { id: theme.id, duration: loopBeats * theme.loops * spb,
      echo: { time: theme.echo.beats * spb, fb: theme.echo.fb, mix: theme.echo.mix },
      instruments: theme.instruments, events: ev };
  }

  const LOOKAHEAD = 0.4, TICK_MS = 25;
  let noiseBuf = null;
  const pulseCache = {};

  class Sequencer {
    constructor(ctx, theme, dest) {
      this.ctx = ctx; this.song = expand(theme); this.dest = dest;
      this.timer = null; this.idx = 0; this.cyc = 0; this.t0 = 0; this.master = null; this.stopped = false;
    }
    _noise() {
      if (noiseBuf) return noiseBuf;
      const c = this.ctx, b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return (noiseBuf = b);
    }
    _pulse(duty) {
      if (pulseCache[duty]) return pulseCache[duty];
      const K = 48, re = new Float32Array(K), im = new Float32Array(K);
      for (let k = 1; k < K; k++) im[k] = (4 / (Math.PI * k)) * Math.sin(Math.PI * k * duty);
      return (pulseCache[duty] = this.ctx.createPeriodicWave(re, im));
    }
    start(fadeIn) {
      const c = this.ctx, now = c.currentTime;
      this.master = c.createGain();
      this.master.gain.setValueAtTime(0.0001, now);
      this.master.gain.linearRampToValueAtTime(0.9, now + (fadeIn || 0.25));
      this.master.connect(this.dest);
      const e = this.song.echo; this.echoIn = c.createGain();
      const dl = c.createDelay(4), fb = c.createGain(), wet = c.createGain();
      dl.delayTime.value = e.time; fb.gain.value = e.fb; wet.gain.value = 0.8 * e.mix;
      this.echoIn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(this.master);
      this.t0 = now + 0.06; this.idx = 0; this.cyc = 0;
      this.timer = setInterval(() => this._tick(), TICK_MS); this._tick();
    }
    // Endless loop: event times are absolute (cycle * duration + time), so the wrap has no gap and no fade.
    _tick() {
      if (this.stopped) return;
      const c = this.ctx, ev = this.song.events, dur = this.song.duration;
      const now = c.currentTime - this.t0, horizon = now + LOOKAHEAD;
      for (;;) {
        const e = ev[this.idx], at = this.cyc * dur + e.time;
        if (at >= horizon) break;
        if (at >= now - 0.08) this._play(e, this.t0 + at);   // skip notes we are too late for (throttled timers)
        if (++this.idx >= ev.length) { this.idx = 0; this.cyc++; }
      }
    }
    stop(fade) {
      if (this.stopped) return;
      this.stopped = true;
      if (this.timer) clearInterval(this.timer); this.timer = null;
      const c = this.ctx, m = this.master, f = fade || 0.35;
      if (!m) return;
      try {
        m.gain.cancelScheduledValues(c.currentTime);
        m.gain.setValueAtTime(m.gain.value, c.currentTime);
        m.gain.setTargetAtTime(0, c.currentTime, f / 4);
      } catch (e) { /* ignore */ }
      setTimeout(() => { try { m.disconnect(); } catch (e) { /* ignore */ } }, (f + 0.3) * 1000);   // drops notes already queued
    }
    _out(def, node) {
      const c = this.ctx, pan = c.createStereoPanner ? c.createStereoPanner() : null;
      let last = node;
      if (pan) { pan.pan.value = def.pan || 0; node.connect(pan); last = pan; }
      last.connect(this.master);
      if (def.echo) { const s = c.createGain(); s.gain.value = def.echo; last.connect(s); s.connect(this.echoIn); }
    }
    _play(ev, when) {
      const c = this.ctx, def = this.song.instruments[ev.inst]; if (!def) return;
      if (def.type === 'osc') return this._osc(def, ev, when);
      if (def.type === 'thud') {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(def.f0, when); o.frequency.exponentialRampToValueAtTime(def.f1, when + def.sweep * 3);
        g.gain.setValueAtTime(def.gain * ev.vel, when); g.gain.setTargetAtTime(0, when + 0.005, def.decay / 3);
        o.connect(g); this._out(def, g); o.start(when); o.stop(when + def.decay * 2.5); return;
      }
      if (def.type === 'noise') return this._noiseHit(def, ev, when);
    }
    _osc(def, ev, when) {
      const c = this.ctx, [a, d, s, r] = def.adsr, voices = def.voices || [{ cents: 0, pan: 0 }];
      const g = c.createGain(), lvl = def.gain * ev.vel, end = when + Math.max(ev.dur, a + 0.01);
      g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(lvl, when + a);
      g.gain.setTargetAtTime(lvl * s, when + a, d / 3);
      g.gain.setTargetAtTime(0, end, r / 4);
      let node = g;
      if (def.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = def.lp; g.connect(f); node = f; }
      const stopAt = end + r * 1.5;
      for (const v of voices) {
        const o = c.createOscillator();
        if (def.wave === 'pulse') o.setPeriodicWave(this._pulse(def.duty)); else o.type = def.wave === 'saw' ? 'sawtooth' : def.wave;
        o.frequency.value = ev.freq; o.detune.value = v.cents;
        if (def.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = def.vib.rate;
          lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(def.vib.depth, when + def.vib.delay + 0.3);
          l.connect(lg); lg.connect(o.detune); l.start(when); l.stop(stopAt); }
        o.connect(g); o.start(when); o.stop(stopAt);
      }
      this._out(def, node);
    }
    _noiseHit(def, ev, when) {
      const c = this.ctx, src = c.createBufferSource(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this._noise(); src.loop = true; hp.type = 'highpass'; hp.frequency.value = def.hp; lp.type = 'lowpass'; lp.frequency.value = def.lp;
      const lvl = def.gain * ev.vel;
      if (def.rise) { g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(lvl, when + ev.dur); g.gain.setTargetAtTime(0, when + ev.dur, def.decay / 3); }
      else { g.gain.setValueAtTime(lvl, when); g.gain.setTargetAtTime(0, when, def.decay / 3); }
      src.connect(hp); hp.connect(lp); lp.connect(g); this._out(def, g);
      const len = (def.rise ? ev.dur : 0) + def.decay * 2.5; src.start(when, Math.random()); src.stop(when + len);
      if (def.tone) { const o = c.createOscillator(), tg = c.createGain(); o.frequency.value = def.tone.f;
        tg.gain.setValueAtTime(lvl * def.tone.amt, when); tg.gain.setTargetAtTime(0, when, def.tone.decay / 3);
        o.connect(tg); this._out(def, tg); o.start(when); o.stop(when + def.tone.decay * 3); }
    }
  }

  /* ───────────── shared audio: ONE AudioContext, separate music / SFX gains ───────────── */
  const MUSIC_KEY = 'ff7-flappy-music', SFX_KEY = 'ff7-flappy-sfx', OLD_MUTE_KEY = 'ff7-flappy-muted';
  const MUSIC_BASE = 0.8, SFX_BASE = 0.55;
  function store(key, val) {
    try { if (val === undefined) return root.localStorage.getItem(key); root.localStorage.setItem(key, String(val)); } catch (e) { /* storage unavailable */ }
    return null;
  }
  let musicOn = store(MUSIC_KEY) !== '0';
  let sfxOn = store(SFX_KEY) !== '0';
  if (store(MUSIC_KEY) === null && store(SFX_KEY) === null && store(OLD_MUTE_KEY) === '1') { sfxOn = false; store(SFX_KEY, '0'); }   // old single mute -> SFX only

  let ac = null, musicGain = null, levelGain = null, sfxGain = null, unlocked = false;
  let seq = null, seqChar = null, themeLevel = 0;

  function publish() {
    root.__FLAP_AUDIO = { unlocked, musicOn, sfxOn, themeId: seq ? seqChar : null, playing: !!seq, ctxState: ac ? ac.state : 'none' };
  }
  function setGain(g, v, tc) { if (g && ac) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.setTargetAtTime(v, ac.currentTime, tc); } }

  /** Call from any user gesture (pointer / key). Creates the context once and resumes it if suspended. */
  function unlock() {
    if (!ac) {
      try {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        ac = new AC();
        musicGain = ac.createGain(); musicGain.gain.value = musicOn ? MUSIC_BASE : 0;
        levelGain = ac.createGain(); levelGain.gain.value = themeLevel;
        levelGain.connect(musicGain); musicGain.connect(ac.destination);
        sfxGain = ac.createGain(); sfxGain.gain.value = sfxOn ? SFX_BASE : 0; sfxGain.connect(ac.destination);
        ac.onstatechange = publish;
        // iOS: a silent buffer inside the gesture fully unlocks output
        const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
      } catch (e) { ac = null; return; }
      unlocked = true;
    }
    if (ac.state !== 'running' && ac.resume) { try { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    publish();
  }

  function stopTheme(fade) {
    if (seq) { seq.stop(fade || 0.35); seq = null; seqChar = null; }
    publish();
  }
  /** Ask for a character's theme at `level` (0..1). Null / no-theme / music off / not unlocked => fade out and stop. */
  function playTheme(charId, level) {
    const tid = charId ? THEME_OF[charId] : null;
    if (!tid || !musicOn || !ac || ac.state !== 'running') { if (seq) stopTheme(); else publish(); return; }
    themeLevel = level;
    setGain(levelGain, level, 0.12);
    if (seq && seqChar === charId) { publish(); return; }
    if (seq) seq.stop(0.3);   // crossfade: old fades while the new one fades in
    seq = new Sequencer(ac, THEMES[tid], levelGain);
    seqChar = charId;
    seq.start(0.3);
    publish();
  }
  function setMusicOn(on) {
    musicOn = !!on; store(MUSIC_KEY, on ? '1' : '0');
    if (!musicOn) { setGain(musicGain, 0, 0.06); stopTheme(0.3); }
    else setGain(musicGain, MUSIC_BASE, 0.05);
    publish();
  }
  function setSfxOn(on) {
    sfxOn = !!on; store(SFX_KEY, on ? '1' : '0');
    setGain(sfxGain, sfxOn ? SFX_BASE : 0, 0.02);
    publish();
  }

  root.GameAudio = {
    unlock, playTheme, stopTheme, setMusicOn, setSfxOn, publish,
    hasTheme: (charId) => !!THEME_OF[charId],
    isMusicOn: () => musicOn, isSfxOn: () => sfxOn,
    ctx: () => ac, sfxOut: () => sfxGain,
    running: () => !!ac && ac.state === 'running',
  };
  publish();
})(typeof window !== 'undefined' ? window : this);
