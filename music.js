/* music.js — original, runtime-synthesized fan character themes + shared Web Audio for Midgar Flap.
 * Not official FF7 music: these are original vibe-only sketches (no Square Enix melodies, samples or audio files).
 * Contains: note data for ten themes (one per hero), a look-ahead Web Audio sequencer that loops
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

  /* ───────── shared helpers for the six newer themes ─────────
   * P: write per-bar [name|null, beats] lists starting at bar `bar0`, transposed by `tr` semitones.
   * Chord names are written in a home key and shifted by `tr` too. */
  function P(out, inst, bar0, bars, tr, v, gate, extra) {
    bars.forEach((items, b) => {
      let t = (bar0 + b) * 4;
      for (const [nm, d] of items) {
        if (nm) out.push(Object.assign({ i: inst, p: N(nm) + tr, t, d: d * gate, v }, extra));
        t += d;
      }
    });
  }
  function hold(out, inst, bar, names, tr, d, v, extra) {
    names.forEach((nm) => out.push(Object.assign({ i: inst, p: N(nm) + tr, t: bar * 4, d, v }, extra)));
  }

  /* ───────────────── TIFA: D major, 112 BPM, 16 bars (A A' B A'') ───────────────── */
  function tifa() {
    const n = [];
    const TONES = { D: ['D4', 'F#4', 'A4'], Bm: ['D4', 'F#4', 'B4'], G: ['D4', 'G4', 'B4'], A: ['E4', 'A4', 'C#5'] };
    const ROOT = { D: 'D2', Bm: 'B2', G: 'G2', A: 'A2' };
    const prog = ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G', 'A', 'G', 'A', 'Bm', 'A', 'D', 'Bm', 'G', 'D'];
    const A1 = [
      [['F#5', 1], ['A5', 1.5], ['F#5', .5], ['E5', 1]],
      [['D5', 1.5], ['F#5', .5], ['B5', 2]],
      [['B5', 1.5], ['A5', .5], ['G5', 1], ['E5', 1]],
      [['E5', 2], ['A4', 1], ['C#5', 1]],
    ];
    const A2 = [A1[0],
      [['D5', 1.5], ['F#5', .5], ['B5', 1], ['D6', 1]],
      [['C#6', 1.5], ['B5', .5], ['G5', 1], ['B5', 1]],
      [['A5', 3], [null, 1]]];
    const B = [
      [['B5', 1], ['D6', 1.5], ['B5', .5], ['G5', 1]],
      [['A5', 1], ['C#6', 1.5], ['A5', .5], ['E5', 1]],
      [['D6', 1.5], ['C#6', .5], ['B5', 1], ['A5', 1]],
      [['G#5', 1], ['E5', 1], ['A5', 2]],
    ];
    const A3 = [A1[0], A1[1], [['G5', 1], ['B5', 1], ['A5', 1], ['F#5', 1]], [['D5', 4]]];
    P(n, 'lead', 0, A1, 0, .85, .92); P(n, 'lead', 4, A2, 0, .88, .92);
    P(n, 'lead', 8, B, 0, .92, .92); P(n, 'lead', 12, A3, 0, .88, .95);
    P(n, 'harm', 8, B, -4, .7, .92); P(n, 'harm', 12, A3, -4, .7, .95);
    prog.forEach((c, b) => {
      const t0 = b * 4, last = b === 15, r = N(ROOT[c]);
      hold(n, 'pad', b, TONES[c], 0, last ? 4 : 4.05, b >= 4 ? .9 : .6);
      if (last) { n.push({ i: 'bass', p: r, t: t0, d: 3.5, v: 1 }, { i: 'kick', t: t0, d: .2, v: .9 }); return; }
      [[0, 0, .9, 1], [1.5, 7, .4, .7], [2, 0, .9, .9], [3.5, 12, .4, .6]].forEach(([t, o, d, v]) => n.push({ i: 'bass', p: r + o, t: t0 + t, d, v }));
      n.push({ i: 'kick', t: t0, d: .2, v: 1 }, { i: 'kick', t: t0 + 2, d: .2, v: .8 });
      n.push({ i: 'rim', t: t0 + 1, d: .1, v: .8 }, { i: 'rim', t: t0 + 3, d: .1, v: .9 });
      if (b >= 8 && b < 12) for (let k = 0; k < 4; k++) n.push({ i: 'hat', t: t0 + k + .5, d: .1, v: .6 });
      if (b === 7) n.push({ i: 'rim', t: t0 + 3.5, d: .1, v: .5 }, { i: 'rim', t: t0 + 3.75, d: .1, v: .65 });
    });
    return {
      id: 'tifa', title: 'Tifa — warm and steady (D major)', bpm: 112, beatsPerBar: 4, bars: 16, loops: 1, fadeOut: 1.4,
      echo: { beats: 0.75, fb: 0.3, mix: 0.7 },
      instruments: {
        lead: { type: 'osc', wave: 'pulse', duty: 0.35, lp: 2500, gain: 0.17, adsr: [0.02, 0.15, 0.7, 0.15], pan: 0.05, echo: 0.25,
          vib: { rate: 5, depth: 11, delay: 0.35 } },
        harm: { type: 'osc', wave: 'triangle', lp: 2000, gain: 0.16, adsr: [0.03, 0.15, 0.75, 0.15], pan: -0.3, echo: 0.2 },
        pad: { type: 'osc', wave: 'saw', lp: 750, gain: 0.04, adsr: [0.3, 0.3, 0.85, 0.5],
          voices: [{ cents: -9, pan: -0.5 }, { cents: 9, pan: 0.5 }] },
        bass: { type: 'osc', wave: 'triangle', gain: 0.5, adsr: [0.006, 0.12, 0.75, 0.08] },
        kick: { type: 'thud', f0: 120, f1: 42, sweep: 0.04, decay: 0.26, gain: 0.95 },
        rim: { type: 'noise', hp: 1400, lp: 5000, decay: 0.05, gain: 0.26, tone: { f: 900, amt: 0.4, decay: 0.04 }, pan: -0.1 },
        hat: { type: 'noise', hp: 7000, lp: 16000, decay: 0.04, gain: 0.07, pan: 0.25 },
      },
      notes: n,
    };
  }

  /* ───────────────── AERITH: F lydian, 88 BPM, 12 bars (A A' B) ───────────────── */
  function aerith() {
    const n = [], tr = -4;   // written in A lydian, sounds in F lydian
    const TONES = { A: ['A3', 'C#4', 'E4'], B: ['B3', 'D#4', 'F#4'], F: ['F#3', 'A3', 'C#4'], E: ['E3', 'G#3', 'B3'], C: ['C#4', 'E4', 'G#4'] };
    const ROOT = { A: 'A2', B: 'B2', F: 'F#2', E: 'E2', C: 'C#3' };
    const prog = ['A', 'B', 'F', 'E', 'A', 'B', 'F', 'E', 'C', 'B', 'A', 'E'];
    const A1 = [
      [['A4', 1], ['C#5', 1], ['E5', 1.5], ['D#5', .5]],
      [['F#5', 2], ['D#5', 1], ['B4', 1]],
      [['C#5', 1], ['E5', 1], ['A5', 1.5], ['G#5', .5]],
      [['E5', 2], ['B4', 1], [null, 1]],
    ];
    const A2 = [A1[0],
      [['F#5', 1], ['B5', 1], ['D#6', 2]],
      [['C#6', 1.5], ['A5', .5], ['F#5', 1], ['E5', 1]],
      [['G#5', 2], ['E5', 2]]];
    const B = [
      [['E5', 1.5], ['G#5', .5], ['C#6', 2]],
      [['B5', 1], ['A5', 1], ['F#5', 2]],
      [['A5', 1], ['C#6', 1], ['E6', 2]],
      [['D#6', 1], ['B5', 1], ['A5', 1], ['E5', 1]],
    ];
    P(n, 'lead', 0, A1, tr, .85, .95); P(n, 'lead', 4, A2, tr, .88, .95); P(n, 'lead', 8, B, tr, .9, .95);
    P(n, 'bell', 4, A2, tr + 12, .45, 1, { }); P(n, 'bell', 8, B, tr + 12, .45, 1);
    prog.forEach((c, b) => {
      const t0 = b * 4, r = N(ROOT[c]) + tr;
      hold(n, 'pad', b, TONES[c], tr, 4.1, .85);
      n.push({ i: 'bass', p: r, t: t0, d: 1.9, v: 1 }, { i: 'bass', p: r + 7, t: t0 + 2, d: 1.8, v: .65 });
      if (b >= 8) { const tn = TONES[c]; [0, 1, 2, 1, 2, 1, 2, 1].forEach((k, j) => n.push({ i: 'harp', p: N(tn[k]) + tr + 12, t: t0 + j * .5, d: .45, v: j % 2 ? .4 : .65 })); }
      if (b >= 4) { n.push({ i: 'tick', t: t0 + 1, d: .05, v: .6 }, { i: 'tick', t: t0 + 3, d: .05, v: .7 }); n.push({ i: 'kick', t: t0, d: .2, v: .7 }); }
      if (b >= 8) n.push({ i: 'kick', t: t0 + 2.5, d: .2, v: .5 });
    });
    return {
      id: 'aerith', title: 'Aerith — airy and bright (F lydian)', bpm: 88, beatsPerBar: 4, bars: 12, loops: 1, fadeOut: 1.6,
      echo: { beats: 0.75, fb: 0.38, mix: 0.9 },
      instruments: {
        lead: { type: 'osc', wave: 'triangle', lp: 3000, gain: 0.19, adsr: [0.02, 0.2, 0.7, 0.3], pan: 0.05, echo: 0.4,
          vib: { rate: 5, depth: 12, delay: 0.4 } },
        bell: { type: 'osc', wave: 'sine', gain: 0.12, adsr: [0.003, 1.0, 0.0, 0.6], pan: 0.3, echo: 0.5 },
        harp: { type: 'osc', wave: 'triangle', lp: 3200, gain: 0.08, adsr: [0.004, 0.25, 0.0, 0.2], pan: -0.35, echo: 0.4 },
        pad: { type: 'osc', wave: 'triangle', lp: 1800, gain: 0.07, adsr: [0.7, 0.3, 0.85, 0.9],
          voices: [{ cents: -10, pan: -0.5 }, { cents: 0, pan: 0 }, { cents: 10, pan: 0.5 }], vib: { rate: 4.6, depth: 8, delay: 0.5 } },
        bass: { type: 'osc', wave: 'triangle', gain: 0.46, adsr: [0.015, 0.2, 0.7, 0.25] },
        kick: { type: 'thud', f0: 105, f1: 44, sweep: 0.05, decay: 0.22, gain: 0.6 },
        tick: { type: 'noise', hp: 6000, lp: 15000, decay: 0.03, gain: 0.08, pan: 0.2 },
      },
      notes: n,
    };
  }

  /* ───────────────── RED XIII: C dorian pentatonic-ish, 114 BPM, 16 bars ───────────────── */
  function red13() {
    const n = [];
    const ROOT = ['C2', 'F2', 'C2', 'G2', 'C2', 'F2', 'C2', 'G2', 'Eb2', 'Bb2', 'F2', 'G2', 'C2', 'F2', 'C2', 'C2'];
    const DRONE = { 8: ['Eb4', 'G4', 'Bb4'], 9: ['Bb3', 'D4', 'F4'], 10: ['F4', 'A4', 'C5'], 11: ['G3', 'Bb3', 'D4'] };
    const A1 = [
      [['C5', .75], ['C5', .25], ['G5', 1], ['F5', .5], ['Eb5', .5], ['D5', 1]],
      [['F5', .75], ['F5', .25], ['A5', 1], ['G5', 1], ['F5', 1]],
      [['Eb5', .75], ['Eb5', .25], ['G5', 1], ['Bb5', 1], ['A5', 1]],
      [['G5', 1.5], ['F5', .5], ['D5', 1], [null, 1]],
    ];
    const alt = [A1[0], A1[1],
      [['Eb5', .75], ['Eb5', .25], ['G5', 1], ['C6', 1], ['Bb5', 1]],
      [['A5', 1], ['G5', 1], ['D5', 2]]];
    const B = [
      [['G5', 1], ['Bb5', 1], ['Eb6', 2]],
      [['D6', 1], ['Bb5', 1], ['F5', 2]],
      [['A5', 1], ['C6', 1], ['F6', 1], ['Eb6', 1]],
      [['D6', 3], [null, 1]],
    ];
    const fin = [A1[0], A1[1], alt[2], [['C5', 2], [null, 2]]];
    P(n, 'lead', 0, A1, 0, .85, .9); P(n, 'lead', 4, alt, 0, .88, .9);
    P(n, 'lead', 8, B, 0, .92, .92); P(n, 'lead', 12, fin, 0, .9, .9);
    P(n, 'low', 4, alt, -12, .8, .9); P(n, 'low', 12, fin, -12, .8, .9);
    for (let b = 0; b < 16; b++) {
      const t0 = b * 4, r = N(ROOT[b]), last = b === 15;
      if (DRONE[b]) hold(n, 'pad', b, DRONE[b], 0, 4.05, .9);
      if (last) { n.push({ i: 'bass', p: r, t: t0, d: 2, v: 1 }, { i: 'taiko', t: t0, d: .3, v: 1 }); continue; }
      [[0, 0, .8, 1], [1.5, 0, .3, .7], [2.5, 7, .3, .7], [3, 0, .4, .85]].forEach(([t, o, d, v]) => n.push({ i: 'bass', p: r + o, t: t0 + t, d, v }));
      n.push({ i: 'taiko', t: t0, d: .3, v: 1 }, { i: 'taiko', t: t0 + 1.5, d: .3, v: .65 }, { i: 'taiko', t: t0 + 2.5, d: .3, v: .8 });
      n.push({ i: 'tom', t: t0 + 3.5, d: .2, v: .7 });
      n.push({ i: 'clack', t: t0 + 2, d: .1, v: .6 });
      if (b >= 8 && b < 12) for (let k = 0; k < 8; k++) n.push({ i: 'rattle', t: t0 + k * .5, d: .05, v: k % 2 ? .7 : .4 });
      if (b % 4 === 3) for (let k = 0; k < 4; k++) n.push({ i: 'tom', t: t0 + 3 + k * .25, d: .2, v: .55 + k * .1 });
    }
    return {
      id: 'red13', title: 'Red XIII — proud drums (C dorian)', bpm: 114, beatsPerBar: 4, bars: 16, loops: 1, fadeOut: 1.4,
      echo: { beats: 0.75, fb: 0.3, mix: 0.5 },
      instruments: {
        lead: { type: 'osc', wave: 'pulse', duty: 0.28, lp: 2600, gain: 0.18, adsr: [0.02, 0.12, 0.7, 0.12], pan: 0.05, echo: 0.2,
          vib: { rate: 5.2, depth: 14, delay: 0.3 } },
        low: { type: 'osc', wave: 'triangle', lp: 1800, gain: 0.16, adsr: [0.03, 0.12, 0.75, 0.12], pan: -0.3 },
        pad: { type: 'osc', wave: 'saw', lp: 700, gain: 0.04, adsr: [0.3, 0.3, 0.85, 0.5],
          voices: [{ cents: -9, pan: -0.5 }, { cents: 9, pan: 0.5 }] },
        bass: { type: 'osc', wave: 'triangle', gain: 0.52, adsr: [0.005, 0.1, 0.7, 0.06] },
        taiko: { type: 'thud', f0: 105, f1: 46, sweep: 0.07, decay: 0.45, gain: 0.9, pan: -0.1 },
        tom: { type: 'thud', f0: 170, f1: 85, sweep: 0.05, decay: 0.25, gain: 0.6, pan: 0.2 },
        clack: { type: 'noise', hp: 1500, lp: 3800, decay: 0.04, gain: 0.26, tone: { f: 1200, amt: 0.45, decay: 0.035 }, pan: 0.3 },
        rattle: { type: 'noise', hp: 4000, lp: 11000, decay: 0.05, gain: 0.1, pan: -0.3 },
      },
      notes: n,
    };
  }

  /* ───────────────── VINCENT: C# harmonic minor, 92 BPM, 12 bars (A B C) ───────────────── */
  function vincent() {
    const n = [];
    const TONES = { Cm: ['C#4', 'E4', 'G#4'], A: ['A3', 'C#4', 'E4'], Fm: ['F#3', 'A3', 'C#4'], G7: ['G#3', 'C4', 'D#4', 'F#4'], D: ['D4', 'F#4', 'A4'] };
    const ROOT = { Cm: 'C#2', A: 'A1', Fm: 'F#2', G7: 'G#2', D: 'D2' };
    const prog = ['Cm', 'A', 'Fm', 'G7', 'Cm', 'D', 'Fm', 'G7', 'Cm', 'A', 'D', 'G7'];
    const A1 = [
      [['C#5', 1.5], ['E5', .5], ['G#5', 1], ['F#5', 1]],
      [['E5', 1], ['C#5', 1], ['A4', 2]],
      [['A4', 1], ['C#5', 1], ['F#5', 1.5], ['E5', .5]],
      [['D#5', 1], ['C5', 1], ['G#4', 2]],
    ];
    const B = [
      [['C#6', 1], ['B5', 1], ['G#5', 2]],
      [['A5', 1.5], ['G#5', .5], ['E5', 2]],
      [['F#5', 1], ['A5', 1], ['C#6', 2]],
      [['D#6', 1], ['C6', 1], ['G#5', 2]],
    ];
    const C = [A1[0], A1[1],
      [['D5', 1], ['F#5', 1], ['A5', 1.5], ['G#5', .5]],
      [['D#5', 1], ['C5', 1], ['D#5', .5], ['G#4', 1.5]]];
    P(n, 'lead', 0, A1, 0, .85, 1); P(n, 'lead', 4, B, 0, .85, 1); P(n, 'lead', 8, C, 0, .88, 1);
    P(n, 'ooh', 8, C, -12, .8, 1);
    [0, 4, 8].forEach((b) => n.push({ i: 'toll', p: N('C#4'), t: b * 4, d: 3, v: .9 }, { i: 'toll', p: N('G#4'), t: b * 4, d: 3, v: .6 }));
    prog.forEach((c, b) => {
      const t0 = b * 4, r = N(ROOT[c]);
      if (b >= 4) hold(n, 'pad', b, TONES[c], 0, 4.1, .85);
      [[0, .6, 1], [.75, .2, .5], [1.5, .4, .7], [2, .6, .9], [3, .4, .6], [3.5, .3, .5]].forEach(([t, d, v]) => n.push({ i: 'bass', p: r, t: t0 + t, d, v }));
      n.push({ i: 'sub', p: r, t: t0, d: 3.8, v: .8 });
      n.push({ i: 'kick', t: t0, d: .3, v: 1 });
      if (b % 2 === 0) n.push({ i: 'taiko', t: t0 + 2.5, d: .4, v: .7 });
      if (b % 4 === 3) n.push({ i: 'slam', t: t0 + 3, d: .4, v: .8 });
      n.push({ i: 'click', t: t0 + 1.5, d: .05, v: .5 }, { i: 'click', t: t0 + 3.5, d: .05, v: .35 });
    });
    return {
      id: 'vincent', title: 'Vincent — gothic shadow (C# harmonic minor)', bpm: 92, beatsPerBar: 4, bars: 12, loops: 1, fadeOut: 1.6,
      echo: { beats: 1.5, fb: 0.38, mix: 0.9 },
      instruments: {
        lead: { type: 'osc', wave: 'pulse', duty: 0.15, lp: 2300, gain: 0.16, adsr: [0.04, 0.2, 0.65, 0.35], pan: 0.1, echo: 0.45,
          vib: { rate: 4.6, depth: 18, delay: 0.3 } },
        ooh: { type: 'osc', wave: 'triangle', lp: 1500, gain: 0.1, adsr: [0.5, 0.3, 0.8, 0.8],
          voices: [{ cents: -9, pan: -0.4 }, { cents: 9, pan: 0.4 }], vib: { rate: 5, depth: 12, delay: 0.4 }, echo: 0.3 },
        pad: { type: 'osc', wave: 'saw', lp: 800, gain: 0.05, adsr: [0.6, 0.3, 0.85, 0.9],
          voices: [{ cents: -12, pan: -0.6 }, { cents: 12, pan: 0.6 }] },
        bass: { type: 'osc', wave: 'pulse', duty: 0.25, lp: 480, gain: 0.5, adsr: [0.004, 0.1, 0.55, 0.06] },
        sub: { type: 'osc', wave: 'sine', gain: 0.35, adsr: [0.02, 0.3, 0.8, 0.3] },
        toll: { type: 'osc', wave: 'sine', gain: 0.12, adsr: [0.002, 1.8, 0.0, 1.0], pan: -0.2, echo: 0.5 },
        kick: { type: 'thud', f0: 115, f1: 36, sweep: 0.05, decay: 0.34, gain: 0.95 },
        taiko: { type: 'thud', f0: 125, f1: 55, sweep: 0.08, decay: 0.45, gain: 0.7, pan: -0.15 },
        slam: { type: 'noise', hp: 250, lp: 5000, decay: 0.38, gain: 0.4, tone: { f: 110, amt: 0.7, decay: 0.2 }, echo: 0.15 },
        click: { type: 'noise', hp: 4500, lp: 14000, decay: 0.02, gain: 0.09, pan: -0.3 },
      },
      notes: n,
    };
  }

  /* ───────────────── CAIT SITH: B major, 140 BPM, 16 bars (A A' B A'') ───────────────── */
  function caitsith() {
    const n = [], tr = -1;   // written in C major, sounds in B major
    const ROOT = ['C3', 'A2', 'D3', 'G2', 'C3', 'A2', 'D3', 'G2', 'F2', 'F2', 'C3', 'G2', 'C3', 'A2', 'D3', 'C3'];
    const STAB = [['E4', 'G4', 'C5'], ['E4', 'A4', 'C#5'], ['F4', 'A4', 'D5'], ['F4', 'B4', 'D5'],
      ['E4', 'G4', 'C5'], ['E4', 'A4', 'C#5'], ['F4', 'A4', 'D5'], ['F4', 'B4', 'D5'],
      ['F4', 'A4', 'C5'], ['F4', 'Ab4', 'C5'], ['E4', 'G4', 'C5'], ['F4', 'B4', 'D5'],
      ['E4', 'G4', 'C5'], ['E4', 'A4', 'C#5'], ['F4', 'A4', 'D5'], ['E4', 'G4', 'C5']];
    const A1 = [
      [['E5', .5], ['G5', .5], ['E5', .5], ['C5', .5], ['D5', .5], [null, .5], ['G4', 1]],
      [['E5', .5], ['A5', .5], ['E5', .5], ['C#5', .5], ['E5', .5], [null, .5], ['A4', 1]],
      [['F5', .5], ['A5', .5], ['F5', .5], ['D5', .5], ['E5', .5], ['F5', .5], ['A5', 1]],
      [['G5', .5], ['B5', .5], ['D6', .5], ['B5', .5], ['G5', 1], [null, 1]],
    ];
    const A2 = [A1[0], A1[1],
      [['F5', .5], ['A5', .5], ['C6', .5], ['A5', .5], ['F5', .5], ['D5', .5], ['F5', 1]],
      [['G5', .5], ['F5', .5], ['E5', .5], ['D5', .5], ['C5', 1], [null, 1]]];
    const B = [
      [['A5', .5], ['C6', .5], ['A5', .5], ['F5', .5], ['A5', 1], ['C6', 1]],
      [['Ab5', .5], ['C6', .5], ['Ab5', .5], ['F5', .5], ['Ab5', 1], ['C6', 1]],
      [['G5', .5], ['E6', .5], ['C6', .5], ['G5', .5], ['E5', 1], ['G5', 1]],
      [['F5', .5], ['G5', .5], ['B5', .5], ['D6', .5], ['F6', 1], [null, 1]],
    ];
    const fin = [A1[0], A1[1], A2[2], [['G5', .5], ['B5', .5], ['D6', .5], ['G6', .5], ['C6', 2]]];
    P(n, 'lead', 0, A1, tr, .88, .45); P(n, 'lead', 4, A2, tr, .9, .45);
    P(n, 'lead', 8, B, tr, .92, .45); P(n, 'lead', 12, fin, tr, .9, .45);
    for (let b = 0; b < 16; b++) {
      const t0 = b * 4, r = N(ROOT[b]) + tr, last = b === 15;
      if (last) { n.push({ i: 'bass', p: r, t: t0, d: .5, v: 1 }, { i: 'kick', t: t0, d: .2, v: .9 }); continue; }
      [[0, 0], [1, 12], [2, 7], [3, 12]].forEach(([t, o]) => n.push({ i: 'bass', p: r + o, t: t0 + t, d: .3, v: t === 0 ? 1 : .8 }));
      if (b >= 4) [1.5, 3.5].forEach((t) => STAB[b].forEach((nm) => n.push({ i: 'stab', p: N(nm) + tr, t: t0 + t, d: .2, v: .8 })));
      n.push({ i: 'kick', t: t0, d: .2, v: .9 }, { i: 'kick', t: t0 + 2, d: .2, v: .7 });
      n.push({ i: 'snap', t: t0 + 1, d: .1, v: .7 }, { i: 'snap', t: t0 + 3, d: .1, v: .8 });
      for (let k = 0; k < 4; k++) n.push({ i: 'tick', t: t0 + k + .5, d: .05, v: k % 2 ? .8 : .55 });
      if (b % 4 === 3) n.push({ i: 'snap', t: t0 + 3.5, d: .1, v: .5 }, { i: 'snap', t: t0 + 3.75, d: .1, v: .65 });
    }
    return {
      id: 'caitsith', title: 'Cait Sith — bouncy fortune (B major)', bpm: 140, beatsPerBar: 4, bars: 16, loops: 1, fadeOut: 1.2,
      echo: { beats: 0.5, fb: 0.25, mix: 0.6 },
      instruments: {
        lead: { type: 'osc', wave: 'square', lp: 3800, gain: 0.18, adsr: [0.003, 0.06, 0.55, 0.04], pan: 0, echo: 0.2 },
        stab: { type: 'osc', wave: 'pulse', duty: 0.125, lp: 3000, gain: 0.05, adsr: [0.003, 0.05, 0.3, 0.04], pan: 0.4, echo: 0.2 },
        bass: { type: 'osc', wave: 'triangle', gain: 0.52, adsr: [0.003, 0.06, 0.5, 0.04] },
        kick: { type: 'thud', f0: 140, f1: 46, sweep: 0.03, decay: 0.16, gain: 0.8 },
        snap: { type: 'noise', hp: 1800, lp: 8000, decay: 0.06, gain: 0.2, pan: 0.1 },
        tick: { type: 'noise', hp: 5500, lp: 14000, decay: 0.025, gain: 0.1, pan: -0.25 },
      },
      notes: n,
    };
  }

  /* ───────────────── CID: A mixolydian, 126 BPM, 16 bars (A A' B A'') ───────────────── */
  function cid() {
    const n = [];
    const ROOT = ['A2', 'G2', 'D2', 'A2', 'A2', 'G2', 'D2', 'E2', 'D2', 'E2', 'G2', 'A2', 'A2', 'G2', 'D2', 'A2'];
    const DRONE = { 8: ['D4', 'F#4', 'A4'], 9: ['E4', 'G4', 'B4'], 10: ['D4', 'G4', 'B4'], 11: ['E4', 'A4', 'C#5'] };
    const A1 = [
      [['A4', .75], ['A4', .25], ['C#5', .5], ['E5', .5], ['A5', 1.5], [null, .5]],
      [['G5', .75], ['G5', .25], ['F#5', .5], ['E5', .5], ['D5', 1.5], [null, .5]],
      [['F#5', .75], ['F#5', .25], ['A5', .5], ['F#5', .5], ['D5', 1], ['E5', 1]],
      [['C#5', 1], ['E5', 1], ['A5', 2]],
    ];
    const A2 = [A1[0], A1[1],
      [['F#5', .75], ['F#5', .25], ['A5', .5], ['D6', .5], ['C#6', 1.5], [null, .5]],
      [['B5', 1], ['A5', 1], ['E5', 2]]];
    const B = [
      [['D6', 1], ['A5', .5], ['F#5', .5], ['A5', 1], ['D6', 1]],
      [['E6', 1], ['B5', .5], ['G5', .5], ['B5', 1], ['E6', 1]],
      [['D6', .75], ['D6', .25], ['B5', .5], ['G5', .5], ['D6', 1], ['B5', 1]],
      [['C#6', 1], ['E6', 1.5], [null, .5], ['A5', 1]],
    ];
    const fin = [A1[0], A1[1], A2[2], [['A5', .75], ['A5', .25], ['E5', .5], ['A4', .5], ['A4', 2]]];
    P(n, 'brass', 0, A1, 0, .9, .88); P(n, 'brass', 4, A2, 0, .9, .88);
    P(n, 'brass', 8, B, 0, .95, .9); P(n, 'brass', 12, fin, 0, .92, .88);
    P(n, 'brass2', 4, A2, -5, .75, .88); P(n, 'brass2', 12, fin, -5, .75, .88);
    for (let b = 0; b < 16; b++) {
      const t0 = b * 4, r = N(ROOT[b]), last = b === 15;
      if (DRONE[b]) hold(n, 'pad', b, DRONE[b], 0, 4.05, .9);
      if (b === 0 || b === 8 || b === 12) n.push({ i: 'crash', t: t0, d: 1, v: .7 });
      if (last) { n.push({ i: 'bass', p: r, t: t0, d: 2, v: 1 }, { i: 'kick', t: t0, d: .2, v: 1 }, { i: 'snare', t: t0 + 2, d: .2, v: .7 }); continue; }
      [[0, 0], [1, 7], [2, 0], [3, 7]].forEach(([t, o]) => n.push({ i: 'bass', p: r + o, t: t0 + t, d: .45, v: t === 0 ? 1 : .8 }));
      n.push({ i: 'kick', t: t0, d: .2, v: 1 }, { i: 'kick', t: t0 + 2, d: .2, v: .9 });
      n.push({ i: 'snare', t: t0 + 1, d: .2, v: .85 }, { i: 'snare', t: t0 + 3, d: .2, v: .95 });
      n.push({ i: 'snare', t: t0 + .75, d: .1, v: .35 }, { i: 'snare', t: t0 + 2.75, d: .1, v: .35 });
      for (let k = 0; k < 4; k++) n.push({ i: 'hat', t: t0 + k + .5, d: .1, v: .6 });
      if (b % 4 === 3) for (let k = 0; k < 4; k++) n.push({ i: 'snare', t: t0 + 3 + k * .25, d: .1, v: .45 + k * .12 });
    }
    return {
      id: 'cid', title: 'Cid — brash flight march (A mixolydian)', bpm: 126, beatsPerBar: 4, bars: 16, loops: 1, fadeOut: 1.2,
      echo: { beats: 0.75, fb: 0.25, mix: 0.5 },
      instruments: {
        brass: { type: 'osc', wave: 'square', lp: 2800, gain: 0.17, adsr: [0.018, 0.1, 0.7, 0.08], pan: 0, echo: 0.15,
          voices: [{ cents: -5, pan: -0.15 }, { cents: 5, pan: 0.15 }], vib: { rate: 5.3, depth: 9, delay: 0.35 } },
        brass2: { type: 'osc', wave: 'pulse', duty: 0.3, lp: 2000, gain: 0.1, adsr: [0.02, 0.1, 0.7, 0.08], pan: -0.3 },
        pad: { type: 'osc', wave: 'saw', lp: 800, gain: 0.045, adsr: [0.25, 0.3, 0.85, 0.5],
          voices: [{ cents: -9, pan: -0.5 }, { cents: 9, pan: 0.5 }] },
        bass: { type: 'osc', wave: 'triangle', gain: 0.52, adsr: [0.004, 0.08, 0.75, 0.05] },
        kick: { type: 'thud', f0: 125, f1: 44, sweep: 0.04, decay: 0.25, gain: 0.95 },
        snare: { type: 'noise', hp: 1000, lp: 7500, decay: 0.15, gain: 0.34, tone: { f: 190, amt: 0.45, decay: 0.09 }, pan: 0.05 },
        hat: { type: 'noise', hp: 7000, lp: 16000, decay: 0.04, gain: 0.08, pan: 0.25 },
        crash: { type: 'noise', hp: 3000, lp: 15000, decay: 1.1, gain: 0.15, pan: -0.2 },
      },
      notes: n,
    };
  }

  const THEMES = { cloudV3: cloudV3(), sephiroth: sephiroth(), yuffie: yuffie(), barret: barret(),
    tifa: tifa(), aerith: aerith(), red13: red13(), vincent: vincent(), caitsith: caitsith(), cid: cid() };
  // character id -> theme id (every hero has an original theme).
  const THEME_OF = { cloud: 'cloudV3', sephiroth: 'sephiroth', yuffie: 'yuffie', barret: 'barret',
    tifa: 'tifa', aerith: 'aerith', red13: 'red13', vincent: 'vincent', caitsith: 'caitsith', cid: 'cid' };

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
