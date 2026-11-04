// Five Crowns procedural audio: orchestral-style music beds + layered SFX, all WebAudio (no audio files).
(function (root) {
  let ac = null, master, musicBus, duckGain, sfxBus, reverb, revSend;
  let musicOn = localStorage.getItem('fcMusic') !== '0', sfxOn = localStorage.getItem('fcSfx') !== '0';
  const themes = {}; let currentTheme = null;
  const MUSIC_VOL = 0.42, SFX_VOL = 0.9;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    ac = new AC({ latencyHint: 'interactive' });
    master = ac.createDynamicsCompressor(); master.threshold.value = -10; master.ratio.value = 4; master.connect(ac.destination);
    duckGain = ac.createGain(); duckGain.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = musicOn ? MUSIC_VOL : 0; musicBus.connect(duckGain);
    sfxBus = ac.createGain(); sfxBus.gain.value = sfxOn ? SFX_VOL : 0; sfxBus.connect(master);
    // generated hall reverb impulse (2.4 s)
    reverb = ac.createConvolver(); const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    reverb.buffer = ir; revSend = ac.createGain(); revSend.gain.value = 0.35; revSend.connect(reverb); reverb.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  let noiseBuf;
  const now = () => ac.currentTime;
  function env(g, t, a, peak, d, sus = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); }
  function out(node, bus, rev = 0) { node.connect(bus); if (rev) { const s = ac.createGain(); s.gain.value = rev; node.connect(s); s.connect(revSend); } }
  function osc(type, f, t, dur, bus, { vol = 0.2, a = 0.01, slide = 0, filt = 0, q = 1, rev = 0, detune = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    let n = o; if (filt) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filt; fl.Q.value = q; o.connect(fl); n = fl; }
    n.connect(g); env(g, t, a, vol, dur); out(g, bus, rev); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  function noise(t, dur, bus, { vol = 0.3, type = 'highpass', f = 1000, f2 = 0, q = 0.7, a = 0.005, rev = 0 } = {}) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(fl).connect(g); env(g, t, a, vol, dur); out(g, bus, rev); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
  }
  // ---------- instruments ----------
  const I = {
    taiko(t, bus, v = 1) { osc('sine', 95, t, 0.55, bus, { vol: 0.9 * v, slide: 0.45, rev: 0.4 }); noise(t, 0.12, bus, { vol: 0.35 * v, type: 'lowpass', f: 700, rev: 0.3 }); },
    tom(t, bus, v = 1) { osc('sine', 160, t, 0.25, bus, { vol: 0.45 * v, slide: 0.6, rev: 0.3 }); noise(t, 0.06, bus, { vol: 0.15 * v, type: 'bandpass', f: 900 }); },
    snare(t, bus, v = 1) { noise(t, 0.16, bus, { vol: 0.32 * v, type: 'bandpass', f: 1800, q: 0.8, rev: 0.3 }); osc('triangle', 200, t, 0.08, bus, { vol: 0.2 * v }); },
    hat(t, bus, v = 1) { noise(t, 0.035, bus, { vol: 0.08 * v, type: 'highpass', f: 7000 }); },
    strings(t, m, dur, bus, v = 0.1) { for (const dt of [-9, 0, 8]) osc('sawtooth', mtof(m), t, dur, bus, { vol: v, a: Math.min(0.35, dur / 3), filt: 900, detune: dt, rev: 0.5 }); },
    spicc(t, m, bus, v = 0.09) { osc('sawtooth', mtof(m), t, 0.11, bus, { vol: v, filt: 1600, rev: 0.25 }); },
    brass(t, m, dur, bus, v = 0.12) {
      for (const dt of [-6, 6]) { const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
        fl.type = 'lowpass'; fl.Q.value = 2; fl.frequency.setValueAtTime(250, t); fl.frequency.linearRampToValueAtTime(1800, t + 0.12); fl.frequency.exponentialRampToValueAtTime(600, t + dur);
        o.connect(fl).connect(g); env(g, t, 0.06, v, dur); out(g, bus, 0.5); o.start(t); o.stop(t + dur + 0.2); }
    },
    choir(t, ms, dur, bus, v = 0.05) {
      // "aah" pad: detuned saws through vowel formant band-passes
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(1.2, dur / 2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter(); f1.type = f2.type = 'bandpass'; f1.frequency.value = 750; f2.frequency.value = 1150; f1.Q.value = f2.Q.value = 5;
      const mix = ac.createGain(); mix.connect(f1); mix.connect(f2); f1.connect(g); f2.connect(g); out(g, bus, 0.8);
      for (const m of ms) for (const dt of [-12, 0, 11]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 5 + Math.random(); lg.gain.value = 6; lfo.connect(lg).connect(o.detune); o.connect(mix); o.start(t); o.stop(t + dur + 0.1); lfo.start(t); lfo.stop(t + dur + 0.1); }
    },
  };
  // ---------- music themes (step sequencer with lookahead) ----------
  const CH = { Dm: [38, [62, 65, 69]], Bb: [34, [58, 62, 65]], F: [41, [60, 65, 69]], C: [36, [60, 64, 67]], A: [33, [61, 64, 69]], Gm: [43, [62, 67, 70]] };
  const THEMES = {
    base: { bpm: 76, prog: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], step(s, bar, t, sp, bus, ch, i16) {
      const [root, tri] = CH[ch];
      if (s === 0) { I.strings(t, root, sp * 16, bus, 0.07); I.strings(t, root + 12, sp * 16, bus, 0.04); I.choir(t, tri, sp * 16 + 0.4, bus, 0.035); I.taiko(t, bus, 0.9); }
      if (s === 8 || s === 10) I.taiko(t, bus, s === 8 ? 0.7 : 0.45);
      if (s === 6 || s === 14) I.tom(t, bus, 0.5);
      if (bar % 2 === 1 && s === 0) I.brass(t, root + 12, sp * 7, bus, 0.07);
      if (bar % 8 === 7 && s >= 12) I.tom(t, bus, 0.35 + (s - 12) * 0.15);
      if (s % 2 === 0) I.spicc(t, (s / 2) % 2 ? tri[0] - 12 : root + 12, bus, 0.035);
    } },
    bonus: { bpm: 132, prog: ['Dm', 'C', 'Bb', 'A'], step(s, bar, t, sp, bus, ch) {
      const [root, tri] = CH[ch];
      if (s % 4 === 0) I.taiko(t, bus, s === 0 ? 1 : 0.75);
      if (s === 4 || s === 12) I.snare(t, bus, 0.9);
      if (s === 14 || s === 15) I.tom(t, bus, 0.6);
      I.hat(t, bus, s % 2 ? 0.6 : 1);
      I.spicc(t, (s % 4 === 2 ? root + 19 : root + 12), bus, 0.05);
      if (s === 0 || s === 3 || s === 6) I.brass(t, tri[0], sp * 2.2, bus, 0.08), I.brass(t, tri[2] - 12, sp * 2.2, bus, 0.06);
      if (s === 0) { I.strings(t, root, sp * 16, bus, 0.08); if (bar % 2 === 0) I.choir(t, tri, sp * 32, bus, 0.04); }
      if (bar % 4 === 3 && s >= 8) I.snare(t, bus, 0.3 + (s - 8) * 0.08);
    } },
  };
  function startTheme(name) {
    if (!ac) return; const T = THEMES[name];
    let th = themes[name];
    if (!th) { th = themes[name] = { gain: ac.createGain(), timer: 0, next: 0, s: 0, bar: 0, running: false }; th.gain.connect(musicBus); th.gain.gain.value = 0.0001; }
    th.gain.gain.cancelScheduledValues(now()); th.gain.gain.setTargetAtTime(1, now(), 0.6);
    if (th.running) return; th.running = true; th.next = now() + 0.1; th.s = 0; th.bar = 0; clearTimeout(th.stopT);
    const sp = 60 / T.bpm / 4;
    const tick = () => {
      if (!th.running) return;
      while (th.next < now() + 0.25) { T.step(th.s, th.bar, th.next, sp, th.gain, T.prog[th.bar % T.prog.length]); th.next += sp; if (++th.s === 16) { th.s = 0; th.bar++; } }
      th.timer = setTimeout(tick, 60);
    };
    tick();
  }
  function stopTheme(name, fade = 1.2) {
    const th = themes[name]; if (!th || !th.running) return;
    th.gain.gain.cancelScheduledValues(now()); th.gain.gain.setTargetAtTime(0.0001, now(), fade / 3);
    th.stopT = setTimeout(() => { th.running = false; clearTimeout(th.timer); }, fade * 1000 + 300);
  }
  function theme(name) { // crossfade
    if (currentTheme === name) return; const prev = currentTheme; currentTheme = name;
    if (!ac || !musicOn) return; if (prev) stopTheme(prev, 1.5); if (name) startTheme(name);
  }
  function setMusic(on) {
    musicOn = on; localStorage.setItem('fcMusic', on ? '1' : '0'); if (!ac) return;
    musicBus.gain.setTargetAtTime(on ? MUSIC_VOL : 0, now(), 0.2);
    if (on && currentTheme) startTheme(currentTheme); if (!on) Object.keys(themes).forEach(n => stopTheme(n, 0.6));
  }
  function setSfx(on) { sfxOn = on; localStorage.setItem('fcSfx', on ? '1' : '0'); if (ac) sfxBus.gain.setTargetAtTime(on ? SFX_VOL : 0, now(), 0.05); }
  function duck(amount = 0.3, secs = 1.5) { if (!ac) return; const t = now(); duckGain.gain.cancelScheduledValues(t); duckGain.gain.setTargetAtTime(amount, t, 0.08); duckGain.gain.setTargetAtTime(1, t + secs, 0.5); }
  // ---------- SFX ----------
  const S = f => (...a) => { if (ac && sfxOn) f(now(), ...a); };
  const sfx = {
    click: S(t => osc('triangle', 880, t, 0.06, sfxBus, { vol: 0.15 })),
    gem: S(t => { osc('sine', 1320, t, 0.3, sfxBus, { vol: 0.12, rev: 0.6 }); osc('sine', 1980, t + 0.04, 0.25, sfxBus, { vol: 0.07, rev: 0.6 }); }),
    whoosh: S((t, d = 0.7) => { noise(t, d, sfxBus, { vol: 0.28, type: 'bandpass', f: 300, f2: 2400, q: 1.2, a: d * 0.4 }); }),
    thud: S((t, i = 0) => { osc('sine', 85 - i * 4, t, 0.28, sfxBus, { vol: 0.8, slide: 0.5 }); noise(t, 0.09, sfxBus, { vol: 0.35, type: 'lowpass', f: 500 }); noise(t, 0.02, sfxBus, { vol: 0.12, type: 'highpass', f: 3000 }); }),
    land: S(t => osc('triangle', 1400, t, 0.08, sfxBus, { vol: 0.05 })),
    tension: S((t, d = 1.4) => { const o = osc('sawtooth', 110, t, d, sfxBus, { vol: 0.09, a: d * 0.8, slide: 2.5, filt: 1200, q: 6 }); noise(t, d, sfxBus, { vol: 0.12, type: 'bandpass', f: 400, f2: 4000, q: 3, a: d * 0.8 }); for (let k = 0; k < d / 0.35; k++) osc('sine', 60, t + k * 0.35, 0.18, sfxBus, { vol: 0.5, slide: 0.6 }); }),
    horn: S(t => { duck(0.25, 2); for (const [f, dt] of [[110, -5], [110, 6], [165, 0], [55, 0]]) { const o = ac.createOscillator(), fl = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.25); o.detune.value = dt;
        const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5; lg.gain.value = 9; l.connect(lg).connect(o.detune); fl.type = 'lowpass'; fl.Q.value = 3; fl.frequency.setValueAtTime(200, t); fl.frequency.linearRampToValueAtTime(1700, t + 0.35); fl.frequency.linearRampToValueAtTime(900, t + 1.8);
        o.connect(fl).connect(g); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.2); g.gain.setValueAtTime(0.22, t + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1); out(g, sfxBus, 0.9); o.start(t); o.stop(t + 2.2); l.start(t); l.stop(t + 2.2); } }),
    bannerFlash: S(t => [523, 659, 784, 1046].forEach((f, i) => osc('triangle', f, t + i * 0.06, 0.3, sfxBus, { vol: 0.12, rev: 0.6 }))),
    clash: S(t => { for (const f of [1230, 2710, 3950, 5300, 6900]) osc('sine', f * (0.97 + Math.random() * 0.06), t, 0.5 + Math.random() * 0.4, sfxBus, { vol: 0.07, a: 0.002, rev: 0.5 }); noise(t, 0.12, sfxBus, { vol: 0.4, type: 'highpass', f: 2500 }); }),
    impact: S(t => { osc('sine', 70, t, 0.4, sfxBus, { vol: 0.9, slide: 0.5 }); noise(t, 0.25, sfxBus, { vol: 0.5, type: 'lowpass', f: 900, f2: 200 }); }),
    block: S(t => { osc('square', 300, t, 0.15, sfxBus, { vol: 0.1, filt: 1200 }); for (const f of [880, 1660]) osc('sine', f, t, 0.6, sfxBus, { vol: 0.08, rev: 0.7 }); noise(t, 0.08, sfxBus, { vol: 0.3, type: 'bandpass', f: 1500 }); }),
    roar: S(t => { noise(t, 1.0, sfxBus, { vol: 0.5, type: 'lowpass', f: 300, f2: 1600, a: 0.15, rev: 0.4 }); osc('sawtooth', 70, t, 0.9, sfxBus, { vol: 0.18, a: 0.1, slide: 0.7, filt: 500, q: 4 }); }),
    crit: S(t => { duck(0.35, 1); sfx.clash(); sfx.impact(); osc('sine', 45, t, 0.9, sfxBus, { vol: 0.8, slide: 0.5 }); }),
    drumroll: S((t, d = 1) => { for (let k = 0; k < d; k += 0.05) noise(t + k, 0.04, sfxBus, { vol: 0.06 + 0.25 * k / d, type: 'bandpass', f: 1400 }); osc('sine', 80, t + d, 0.7, sfxBus, { vol: 0.9, slide: 0.5, rev: 0.6 }); }),
    coins: S((t, n = 12, spread = 1) => { for (let k = 0; k < n; k++) { const tt = t + Math.random() * spread, f = 2400 + Math.random() * 2400; osc('sine', f, tt, 0.18, sfxBus, { vol: 0.05, a: 0.002 }); osc('sine', f * 1.5, tt + 0.01, 0.12, sfxBus, { vol: 0.03, a: 0.002 }); } }),
    tick: S(t => osc('sine', 3000 + Math.random() * 600, t, 0.04, sfxBus, { vol: 0.04, a: 0.002 })),
    fanfare: S((t, tier = 0) => { // 0 small, 1 big, 2 mega, 3 epic
      if (tier === 0) { [0, 4, 7, 12].forEach((s, i) => osc('triangle', mtof(74 + s), t + i * 0.08, 0.25, sfxBus, { vol: 0.12, rev: 0.4 })); sfx.coins(5, 0.4); return; }
      duck(0.2, 1.5 + tier); const ch = tier === 3 ? [62, 66, 69, 74] : [62, 65, 69, 74];
      I.taiko(t, sfxBus, 1); I.brass(t, 50, 0.5, sfxBus, 0.14); [0, 5, 7].forEach((s, i) => ch.forEach(m => I.brass(t + 0.25 + i * 0.22, m + s - 12, 0.3 + (i === 2 ? 1.2 : 0), sfxBus, 0.06)));
      if (tier >= 2) { I.choir(t + 0.7, ch.slice(0, 3), 2.5, sfxBus, 0.08); for (let k = 0; k < 8; k++) I.taiko(t + 0.7 + k * 0.12, sfxBus, 0.5 + k * 0.06); }
      if (tier >= 3) { sfx.roar(); I.strings(t + 0.7, 38, 3, sfxBus, 0.06); }
      sfx.coins(10 + tier * 12, 1 + tier);
    }),
    swell: S(t => { I.choir(t, [62, 69, 74], 3, sfxBus, 0.08); I.strings(t, 38, 3, sfxBus, 0.08); noise(t, 1.5, sfxBus, { vol: 0.15, type: 'bandpass', f: 200, f2: 3000, a: 1.2 }); I.taiko(t + 1.4, sfxBus, 1); }),
    slam: S(t => { I.taiko(t, sfxBus, 1.2); noise(t, 0.3, sfxBus, { vol: 0.4, type: 'lowpass', f: 1500, f2: 200 }); for (const f of [520, 1180]) osc('sine', f, t, 0.8, sfxBus, { vol: 0.05, rev: 0.8 }); }),
    gates: S(t => { noise(t, 1.2, sfxBus, { vol: 0.4, type: 'lowpass', f: 200, f2: 900, a: 0.3 }); osc('sawtooth', 50, t, 1.2, sfxBus, { vol: 0.15, filt: 300 }); I.taiko(t + 1.1, sfxBus, 1); }),
  };
  root.FCAudio = { init, theme, setMusic, setSfx, duck, sfx, state: () => ({ ctx: ac ? ac.state : 'none', musicOn, sfxOn, theme: currentTheme, running: Object.fromEntries(Object.entries(themes).map(([k, v]) => [k, v.running])) }) };
})(window);
