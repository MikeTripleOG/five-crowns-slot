(() => {
'use strict';
const M = window.SlotMath, CONFIGS = window.SlotConfigs;
const qs = new URLSearchParams(location.search);
const cfg = CONFIGS[qs.get('rtp')] || CONFIGS[96];
let forceBonus = qs.get('forceBonus') === '1';
const BETS = [1, 2, 5, 10, 20, 50], START = 1000;
const HERO_COLORS = { eldenvale: '#3fd46a', northgard: '#4a8cff', solenthia: '#ffc531', vellorien: '#b45cff', drakonia: '#ff3b30' };
const LINE_COLORS = ['#ffd23a', '#3fd46a', '#4ab0ff', '#ff5ad1', '#ff7a1a'];
const SYM_SRC = k => 'assets/symbols/' + M.SYMBOLS[k].file;   // tiles are loaded by FILE NAME: swap a PNG, no code change
// ---- uncertified RNG: crypto.getRandomValues ----
const buf = new Uint32Array(1);
const rng = () => (crypto.getRandomValues(buf), buf[0] / 4294967296);

const $ = id => document.getElementById(id);
let state = { balance: START, betIdx: 2, spinning: false, inBonus: false, spins: 0, lastWin: 0 };
try { const s = JSON.parse(localStorage.getItem('fiveCrownsDemo') || 'null'); if (s && typeof s.balance === 'number') { state.balance = s.balance; state.betIdx = s.betIdx ?? 2; } } catch (e) {}
const save = () => { try { localStorage.setItem('fiveCrownsDemo', JSON.stringify({ balance: state.balance, betIdx: state.betIdx })); } catch (e) {} };
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const bet = () => BETS[state.betIdx];
function ui() {
  $('balance').textContent = fmt(state.balance); $('bet').textContent = bet();
  $('spin').disabled = state.spinning || state.inBonus;
  $('variant').textContent = `Math variant: ${cfg.id}% RTP · uncertified`;
}
window.__game = { state, cfg, get balance() { return state.balance; } };

// ---- audio (procedural WebAudio) ----
let ac = null, master = null, muted = localStorage.getItem('fiveCrownsMute') === '1';
function audio() {
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination); } catch (e) { ac = null; } }
  if (ac && ac.state === 'suspended') ac.resume();
  return ac;
}
function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slide = 0) {
  if (!audio()) return; const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, when = 0, hp = 800) {
  if (!audio()) return; const t = ac.currentTime + when, len = Math.ceil(ac.sampleRate * dur), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start(t);
}
const sfx = {
  spin() { for (let i = 0; i < 6; i++) tone(300 + i * 40, 0.05, 'square', 0.04, i * 0.06); },
  stop(i) { tone(120 - i * 6, 0.12, 'triangle', 0.35); noise(0.05, 0.12, 0, 2000); },
  antic() { tone(220, 1.1, 'sawtooth', 0.06, 0, 2.2); },
  banner() { [523, 659, 784].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, i * 0.08)); },
  win(x) { const n = Math.min(8, 3 + Math.floor(x)); for (let i = 0; i < n; i++) tone(660 * Math.pow(1.122, i % 5), 0.18, 'triangle', 0.18, i * 0.07); },
  drumroll(sec) { for (let t = 0; t < sec; t += 0.045) noise(0.04, 0.08 + 0.25 * t / sec, t, 200); tone(98, 0.6, 'sine', 0.6, sec); noise(0.5, 0.5, sec, 100); },
  fanfare() { [392, 523, 659, 784, 1046].forEach((f, i) => { tone(f, 0.35, 'sawtooth', 0.09, i * 0.12); tone(f / 2, 0.35, 'square', 0.05, i * 0.12); }); },
  clash() { noise(0.25, 0.45, 0, 1500); tone(1800, 0.3, 'square', 0.06, 0, 0.4); tone(90, 0.25, 'sine', 0.5); },
  miss() { tone(200, 0.3, 'sawtooth', 0.12, 0, 0.5); },
  kill() { noise(0.6, 0.6, 0, 300); tone(60, 0.8, 'sine', 0.7); sfx.fanfare(); },
};
function setMute(m) { muted = m; localStorage.setItem('fiveCrownsMute', m ? '1' : '0'); $('mute').textContent = m ? '🔇' : '🔊'; $('mute').setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound'); if (master) master.gain.value = m ? 0 : 0.5; }

// ---- reels ----
const reelEls = [], stripEls = [];
let current = [0, 1, 2, 3, 4].map(r => [0, 1, 2].map(y => cfg.strips[r][(y * 3 + r) % cfg.strips[r].length]));
function cellHTML(k) { return `<div class="cell" data-s="${k}"><img src="${SYM_SRC(k)}" alt="${M.SYMBOLS[k].name}" draggable="false"></div>`; }
function buildReels() {
  const root = $('reels'); root.innerHTML = '';
  for (let r = 0; r < 5; r++) {
    const reel = document.createElement('div'); reel.className = 'reel';
    const strip = document.createElement('div'); strip.className = 'strip'; strip.innerHTML = current[r].map(cellHTML).join('');
    reel.appendChild(strip); root.appendChild(reel); reelEls.push(reel); stripEls.push(strip);
  }
  sizeCells();
}
function sizeCells() { const h = reelEls[0].clientHeight / 3; reelEls.forEach(r => r.style.setProperty('--ch', h + 'px')); }
addEventListener('resize', sizeCells);

function spinReel(r, finalSyms, dur, antic) {
  return new Promise(res => {
    const strip = stripEls[r], reel = reelEls[r], ch = reel.clientHeight / 3, K = 14 + r * 3 + (antic ? 12 : 0);
    const filler = []; for (let i = 0; i < K; i++) filler.push(cfg.strips[r][Math.floor(rng() * cfg.strips[r].length)]);
    strip.innerHTML = [...finalSyms, ...filler, ...current[r]].map(cellHTML).join('');
    const from = -(K + 3) * ch;
    reel.classList.add('blur'); if (antic) setTimeout(() => { reel.classList.add('antic'); sfx.antic(); }, Math.max(0, dur - 1400));
    const anim = strip.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${ch * 0.12}px)`, offset: 0.92 }, { transform: 'translateY(0px)' }],
      { duration: dur, easing: antic ? 'cubic-bezier(.25,.6,.2,1)' : 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    setTimeout(() => reel.classList.remove('blur'), dur * 0.75);
    anim.onfinish = () => { strip.innerHTML = finalSyms.map(cellHTML).join(''); anim.cancel(); reel.classList.remove('antic'); sfx.stop(r);
      if (finalSyms.includes('B')) { strip.querySelectorAll('[data-s="B"]').forEach(c => c.classList.add('banner')); sfx.banner(); }
      res(); };
  });
}

function forcedResult() {
  // a real reachable stop combination with banners on reels 1,3,5 (row 2): still a PAID spin
  const stops = [0, 1, 2, 3, 4].map(r => { const L = cfg.strips[r].length; if (r % 2) return Math.floor(rng() * L); const i = cfg.strips[r].indexOf('B'); return (i - 1 + L) % L; });
  const grid = stops.map((st, r) => [0, 1, 2].map(d => cfg.strips[r][(st + d) % cfg.strips[r].length]));
  return M.evaluate(cfg, grid, stops);
}

function drawLines(wins) {
  const svg = $('lines'); svg.innerHTML = '';
  for (const w of wins) {
    const pts = M.PAYLINES[w.line].slice(0, w.count).map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ');
    svg.insertAdjacentHTML('beforeend', `<polyline points="${pts}" stroke="${LINE_COLORS[w.line]}"/>`);
    M.PAYLINES[w.line].slice(0, w.count).forEach((row, r) => stripEls[r].children[row]?.classList.add('win'));
  }
}
function clearWins() { $('lines').innerHTML = ''; document.querySelectorAll('.cell.win').forEach(c => c.classList.remove('win')); $('winMsg').classList.remove('show'); }
function showWin(text, ms = 1600) { const m = $('winMsg'); m.textContent = text; m.classList.add('show'); if (ms) setTimeout(() => m.classList.remove('show'), ms); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function doSpin() {
  if (state.spinning || state.inBonus) return;
  audio();
  if (state.balance < bet()) { $('status').textContent = 'Not enough demo credits - lower the bet or tap Reset.'; return; }
  state.spinning = true; state.balance -= bet(); state.spins++; save(); ui(); clearWins();
  $('status').textContent = 'Spinning...'; sfx.spin();
  const res = forceBonus ? forcedResult() : M.spin(cfg, rng); forceBonus = false;
  // schedule: anticipation on later reels once 2 banners have landed
  let landed = 0, t = 650; const jobs = [];
  for (let r = 0; r < 5; r++) {
    const antic = landed >= 2; t += antic ? 1500 : 260;
    jobs.push(spinReel(r, res.grid[r], t, antic));
    if (res.grid[r].includes('B')) landed++;
  }
  await Promise.all(jobs); current = res.grid;
  const lineWin = Math.round(res.lineWinX * bet() * 100) / 100;
  if (lineWin > 0) {
    drawLines(res.wins); const x = res.lineWinX;
    if (x >= 10) { $('status').textContent = 'BIG WIN!'; sfx.drumroll(1.2); await sleep(1250); coinBurst(160); showWin(`BIG WIN ${fmt(lineWin)}`, 2500); }
    else { sfx.win(x); showWin(`WIN ${fmt(lineWin)}`); }
    state.balance += lineWin; save(); ui();
    $('status').textContent = res.wins.map(w => `Line ${w.line + 1}: ${w.count}× ${M.SYMBOLS[w.sym].name}`).join(' · ') + ` - won ${fmt(lineWin)}`;
  } else if (!res.bonus) $('status').textContent = 'No win - spin again!';
  state.lastWin = lineWin;
  if (res.bonus) { await sleep(lineWin > 0 ? 1400 : 500); await bonusTrigger(res.bonus); }
  state.spinning = false; ui();
}

// ---- bonus: Clash of Crowns ----
async function bonusTrigger(count) {
  state.inBonus = true; ui();
  $('status').textContent = `${count} WAR BANNERS! Clash of Crowns!`;
  sfx.fanfare();
  for (let i = 0; i < 5; i++) { const b = document.createElement('img'); b.src = SYM_SRC('B'); b.className = 'unfurl-banner'; b.style.left = (4 + i * 19) + '%'; b.style.animationDelay = i * 0.1 + 's'; document.body.appendChild(b); setTimeout(() => b.remove(), 2200); }
  await sleep(2000);
  const hero = await chooseHero(count);
  const win = await duel(hero, count);
  state.balance += win; save(); state.inBonus = false; ui();
  $('status').textContent = `Clash of Crowns paid ${fmt(win)} demo credits.`;
}
function chooseHero(count) {
  const ov = $('overlay'); ov.classList.remove('hidden');
  const heroes = cfg.bonus.heroes, tier = cfg.bonus.tiers[count];
  const extra = count === 5 ? '+2 rounds and a Shield' : count === 4 ? '+1 round' : '';
  ov.innerHTML = `<div class="panel" style="background-image:linear-gradient(#0008,#000c),url(assets/hero_select_vibrant.jpg)" id="heroSelect">
    <h2>Choose Your Champion</h2><p class="lbl">${count} banners · ${tier.rounds} rounds ${extra ? '· ' + extra : ''}</p>
    <div class="heroes">${Object.entries(heroes).map(([k, h]) => `<button class="hero" data-hero="${k}" style="--c:${HERO_COLORS[k]}"><img src="assets/hero_${k}.jpg" alt="${h.name}"><small>${h.name.split(' ')[0]}<br>${h.vol} volatility</small></button>`).join('')}</div>
    <p style="font:11px system-ui;opacity:.8">Every champion has the same expected return; choice only changes the swing. Outcomes are random.</p></div>`;
  return new Promise(res => ov.querySelectorAll('.hero').forEach(b => b.onclick = () => { audio(); tone(440, 0.2, 'triangle', 0.2); res(b.dataset.hero); }));
}
async function duel(hero, count) {
  const ov = $('overlay'), h = cfg.bonus.heroes[hero], outcome = M.playBonus(cfg, hero, count, rng);
  ov.innerHTML = `<div class="panel duel" id="duel"><h2>Clash of Crowns</h2>
    <div class="duel-top"><div><div class="lbl">MORALE</div><div class="bar morale"><i id="morale"></i></div><div class="lbl" style="margin-top:4px">${h.name.split(' ')[0].toUpperCase()} HEALTH</div><div class="bar health"><i id="heroHP" style="width:100%"></i></div></div>
    <div class="multbanner" id="mult">x0</div>
    <div><div class="lbl">HORDE HEALTH</div><div class="bar health"><i id="hordeHP" style="width:100%"></i></div>${outcome.shield ? '<div class="lbl" id="shieldTag" style="margin-top:4px">🛡 SHIELD READY</div>' : ''}</div></div>
    <div class="arena"><div class="fighter" id="fHero" style="background-image:url(assets/hero_${hero}.jpg);background-size:cover;background-position:top;border:2px solid ${HERO_COLORS[hero]}"></div><div class="fighter horde" id="fHorde"></div></div>
    <div class="rounds" id="rounds">${outcome.rounds} ROUNDS LEFT</div><div class="log" id="log">The Horde champion approaches...</div></div>`;
  const set = (id, v) => { $(id).style.width = v + '%'; };
  set('morale', 40); await sleep(1100);
  for (const s of outcome.seq) {
    const left = outcome.rounds - s.round;
    const fHero = $('fHero'), fHorde = $('fHorde'); fHero.classList.remove('lunge', 'hit'); fHorde.classList.remove('lunge', 'hit'); void fHero.offsetWidth;
    if (s.result === 'win' || s.result === 'kill') {
      fHero.classList.add('lunge'); setTimeout(() => { fHorde.classList.add('hit'); spark(fHorde, s.result === 'kill' ? '💥' : '⚔️'); }, 160);
      if (s.result === 'kill') { $('log').textContent = 'Final round...'; sfx.drumroll(1.0); await sleep(1050); sfx.kill(); coinBurst(200); spark(fHorde, '🔥'); }
      else sfx.clash();
      $('log').textContent = s.result === 'kill' ? `KILLING BLOW! +x${s.add.toFixed(1)}` : `Round ${s.round}: hit lands! +x${s.add.toFixed(1)}`;
    } else if (s.result === 'blocked') { fHorde.classList.add('lunge'); spark(fHero, '🛡'); sfx.clash(); $('log').textContent = `Round ${s.round}: the Shield blocks the Horde!`; const st = $('shieldTag'); if (st) st.textContent = '🛡 SHIELD USED'; }
    else { fHorde.classList.add('lunge'); setTimeout(() => fHero.classList.add('hit'), 160); sfx.miss(); $('log').textContent = `Round ${s.round}: the Horde strikes back!`; }
    const m = $('mult'); m.textContent = 'x' + (+s.mult).toFixed(1).replace(/\.0$/, ''); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
    set('morale', s.morale); set('heroHP', s.heroHP); set('hordeHP', s.hordeHP);
    $('rounds').textContent = left > 0 ? `${left} ROUND${left > 1 ? 'S' : ''} LEFT` : 'VICTORY!';
    await sleep(s.result === 'kill' ? 700 : 1150);
  }
  const win = Math.round(bet() * outcome.total * 100) / 100;
  $('log').innerHTML = `Victory! Bet ${bet()} × x${outcome.total} = <b>${fmt(win)}</b> demo credits`;
  $('duel').insertAdjacentHTML('beforeend', '<button class="big" id="collect">COLLECT</button>');
  await new Promise(res => { $('collect').onclick = res; });
  ov.classList.add('hidden'); ov.innerHTML = '';
  return win;
}
function spark(el, ch) { const s = document.createElement('div'); s.className = 'spark'; s.textContent = ch; el.appendChild(s); setTimeout(() => s.remove(), 650); }

// ---- coin burst (canvas) ----
const fx = $('fx'), ctx = fx.getContext('2d'); let parts = [], raf = 0;
function coinBurst(n) {
  fx.width = innerWidth * devicePixelRatio; fx.height = innerHeight * devicePixelRatio;
  const cx = fx.width / 2, cy = fx.height * 0.4, s = devicePixelRatio;
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 10) * s; parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * s, r: (5 + Math.random() * 6) * s, life: 90 + Math.random() * 40, sp: Math.random() * 0.3 }); }
  if (!raf) raf = requestAnimationFrame(tick);
}
function tick() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  parts = parts.filter(p => p.life-- > 0);
  for (const p of parts) { p.vy += 0.35 * devicePixelRatio; p.x += p.vx; p.y += p.vy; const w = Math.abs(Math.cos(p.life * p.sp)) * p.r;
    ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#a8661a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y, w + 1, p.r, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  raf = parts.length ? requestAnimationFrame(tick) : (ctx.clearRect(0, 0, fx.width, fx.height), 0);
}

function showPaytable() {
  const ov = $('overlay'); ov.classList.remove('hidden');
  const rows = Object.entries(cfg.paytable).map(([k, p]) => `<div><img src="${SYM_SRC(k)}" alt=""><span>${M.SYMBOLS[k].name}<br>3:${p[0]} 4:${p[1]} 5:${p[2]}</span></div>`).join('');
  ov.innerHTML = `<div class="panel" style="background:#1a0608"><h2>Paytable</h2><p style="font:12px system-ui">Pays are × line bet (line bet = bet ÷ 5), left to right on 5 lines: 3 rows + 2 V-shapes. Dragon WILD substitutes for all except the War Banner. 3+ War Banners anywhere trigger Clash of Crowns: pays bet × total multiplier (4 banners: +1 round, 5: +2 rounds and a Shield).</p>
  <div class="paytable">${rows}<div><img src="${SYM_SRC('B')}" alt=""><span>War Banner<br>scatter / bonus</span></div></div>
  <p style="font:11px system-ui">Free play demo - no real money. Theoretical RTP of this variant: ${(cfg.targetRTP * 100).toFixed(0)}% (uncertified prototype).</p><button class="big" id="closePay">CLOSE</button></div>`;
  $('closePay').onclick = () => { ov.classList.add('hidden'); ov.innerHTML = ''; };
}

// ---- wiring ----
buildReels(); setMute(muted); ui();
$('spin').addEventListener('click', doSpin);
$('reels').addEventListener('click', doSpin);
$('betUp').onclick = () => { if (!state.spinning) { state.betIdx = Math.min(BETS.length - 1, state.betIdx + 1); save(); ui(); } };
$('betDown').onclick = () => { if (!state.spinning) { state.betIdx = Math.max(0, state.betIdx - 1); save(); ui(); } };
$('reset').onclick = () => { if (state.spinning || state.inBonus) return; state.balance = START; save(); ui(); $('status').textContent = 'Demo credits reset to 1,000.'; };
$('mute').onclick = () => setMute(!muted);
$('payBtn').onclick = () => { if (!state.spinning && !state.inBonus) showPaytable(); };
addEventListener('keydown', e => { if (e.code === 'Space' && $('overlay').classList.contains('hidden')) { e.preventDefault(); doSpin(); } });
})();
