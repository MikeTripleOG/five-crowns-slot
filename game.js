(() => {
'use strict';
const M = window.SlotMath, CONFIGS = window.SlotConfigs, F = window.FC_FEATURES, A = window.FCAudio, FX = window.FCFX;
const qs = new URLSearchParams(location.search);
const cfg = CONFIGS[qs.get('rtp')] || CONFIGS[96];
const fb = (qs.get('forceBonus') || '').toLowerCase();
let forceBonus = fb ? (fb === 'win' || fb === 'laststand' ? 3 : Math.min(5, Math.max(3, +fb === 1 ? 3 : +fb || 3))) : 0;
// test hooks: ?forceBonus=win|laststand forces the duel result; ?freeSpins=5..10 forces the Spoils of War count
let forceDuel = fb === 'win' ? { won: true } : fb === 'laststand' ? { won: false } : {};
if (qs.get('freeSpins')) forceDuel.fs = +qs.get('freeSpins');
const MOVES = { strike: { label: 'STRIKE', icon: '⚔' }, guard: { label: 'GUARD', icon: '🛡' }, fury: { label: 'FURY', icon: '🔥' } };
const MOVE_AUTO_MS = 8000;   // visible countdown; turbo/demo use a shorter auto-pick
const BETS = [1, 2, 5, 10, 20, 50], START = 1000;
const TIERS = [[50, 'epic', 3], [25, 'mega', 2], [10, 'big', 1]];            // win x bet thresholds -> title art / fanfare tier
const HERO_COLORS = { eldenvale: '#3fd46a', northgard: '#4a8cff', solenthia: '#ffc531', vellorien: '#b45cff', drakonia: '#ff3b30' };
const LINE_COLORS = ['#ffd23a', '#3fd46a', '#4ab0ff', '#ff5ad1', '#ff7a1a'];
const CHAMPION = 'Vorrhak, Warlord of the Crimson Horde';
const INTRO_VIDEO_CUT = 2.6;
const DEMO = qs.get('demo') === '1';   // ?demo=1: trailer capture - intro skipped, autoplay never stops on big wins   // s: crossfade out of load_intro before its baked mock-UI (with a $ balance) appears
const BONUS_VIDEO_START = 0.5; // s: skip the clip's baked mock reel frames
const RM = FX.RM;
const JP_COLORS = { mini: '#3fd46a', minor: '#4a8cff', major: '#b45cff', grand: '#ff3b30' };
const JP_LEVEL = { mini: 0, minor: 1, major: 2, grand: 3 };
const fj = (qs.get('forceJackpot') || '').toLowerCase(); let forceJackpot = M.JP_TIERS.includes(fj) ? fj : null;
const SYM_SRC = k => 'assets/symbols/' + M.SYMBOLS[k].file;   // tiles load BY FILE NAME: swap a PNG, no code change

// ---- outcome RNG: crypto.getRandomValues (uncertified). ?seed=N = deterministic xorshift for tests only. Cosmetics use Math.random. ----
let rng;
if (qs.get('seed')) { let a = +qs.get('seed') >>> 0 || 1, b = 0x9E3779B9, c = 0x85EBCA6B, d = 0xC2B2AE35; rng = () => { const t = a ^ (a << 11); a = b; b = c; c = d; d = (d ^ (d >>> 19) ^ (t ^ (t >>> 8))) >>> 0; return d / 4294967296; }; }
else { const buf = new Uint32Array(1); rng = () => (crypto.getRandomValues(buf), buf[0] / 4294967296); }

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const state = { balance: START, betIdx: 2, spinning: false, inBonus: false, spins: 0, hits: 0, turbo: false, auto: null, history: [], log: [], phases: [] };
try { const s = JSON.parse(localStorage.getItem('fiveCrownsDemo') || 'null'); if (s && typeof s.balance === 'number') Object.assign(state, { balance: s.balance, betIdx: s.betIdx ?? 2 }); } catch (e) {}
const save = () => { try { localStorage.setItem('fiveCrownsDemo', JSON.stringify({ balance: state.balance, betIdx: state.betIdx })); } catch (e) {} };
const bet = () => BETS[state.betIdx];
// ---- Crown Collector meters: persisted per BET LEVEL (a near-full meter cannot be carried to a bigger bet) ----
const METER_KEY = 'fcCrowns';
let meters = {}; try { meters = JSON.parse(localStorage.getItem(METER_KEY) || '{}') || {}; } catch (e) {}
const meterOf = i => (Array.isArray(meters[i]) && meters[i].length === 5 ? meters[i] : [false, false, false, false, false]).map(Boolean);
const saveMeters = () => { try { localStorage.setItem(METER_KEY, JSON.stringify(meters)); } catch (e) {} };
if (qs.get('crowns')) { const n = Math.max(0, Math.min(4, +qs.get('crowns') | 0)); meters[state.betIdx] = [0, 1, 2, 3, 4].map(r => r < n); saveMeters(); }
window.__game = { meters: () => meterOf(state.betIdx), state, cfg, get balance() { return state.balance; }, audio: () => A.state(), loaded: {}, introDone: false, F };

// ---------- balance count-up ----------
let shownBal = state.balance, balCtl = {};
function ui() {
  $('bet').textContent = bet();
  const sp = $('spin');
  sp.disabled = state.inBonus || ((busy || state.spinning) && !F.quickStop && !state.auto);
  sp.textContent = state.auto ? `STOP ${state.auto.left}` : (busy || state.spinning) && F.quickStop ? 'STOP' : 'SPIN';
  sp.classList.toggle('stop', !!state.auto || ((busy || state.spinning) && F.quickStop)); sp.classList.toggle('auto', !!state.auto);
  sp.setAttribute('aria-label', sp.textContent);
  $('counter').textContent = `Spins ${state.spins} · Hits ${state.hits}${state.spins ? ` (${(100 * state.hits / state.spins).toFixed(1)}%)` : ''}`;
  $('variant').textContent = `Math ${cfg.id}% RTP · uncertified`;
  renderMeters(); renderLadder();
  $('turboBtn').setAttribute('aria-pressed', state.turbo); $('autoBtn').classList.toggle('on', !!state.auto);
}
function renderMeters(m = meterOf(state.betIdx)) {
  document.querySelectorAll('#crowns i').forEach((el, r) => { el.classList.toggle('on', !!m[r]); });
}
function renderLadder() {
  const L = $('ladder'); if (!L) return;
  L.innerHTML = [...M.JP_TIERS].reverse().map(t => `<div class="plq" data-t="${t}"><img src="assets/jackpot/plaque_${t}.webp" alt="${t.toUpperCase()}"><b>${fmt(cfg.jackpot.tiers[t].x * bet())}</b></div>`).join('');
}
function setBalance(v, animate = true) {
  const from = shownBal; state.balance = Math.round(v * 100) / 100; save(); shownBal = state.balance;
  balCtl.skip = true; balCtl = {};
  if (!animate || state.balance <= from || RM) { $('balance').textContent = fmt(state.balance); return; }
  FX.countUp($('balance'), from, state.balance, Math.min(1500, 300 + (state.balance - from) * 8), fmt, null, balCtl);
}

// ---------- background alignment + orientation crossfade ----------
const BG = { L: { w: 1280, h: 720, band: 0.63 }, P: { w: 900, h: 1600, band: 0.57 } };
let lastOrient = null;
function layout() {
  const vw = innerWidth, vh = innerHeight, portrait = vh >= vw, o = portrait ? 'portrait' : 'landscape';
  if (lastOrient && lastOrient !== o) { $('app').classList.add('orient'); setTimeout(() => $('app').classList.remove('orient'), 450); }
  lastOrient = o; document.body.classList.toggle('portrait', portrait); document.body.classList.toggle('landscape', !portrait);
  const r = $('machine').getBoundingClientRect(), cy = r.top + r.height * 0.53 + scrollY * 0;
  for (const [k, b] of Object.entries(BG)) {
    const el = $('bg' + k); let s = Math.max(vw / b.w, vh / b.h);
    let y = cy - b.band * b.h * s; y = Math.min(0, Math.max(vh - b.h * s, y));
    el.style.backgroundSize = `${b.w * s}px ${b.h * s}px`; el.style.backgroundPosition = `${(vw - b.w * s) / 2}px ${y}px`;
  }
  sizeCells();
}
addEventListener('resize', () => requestAnimationFrame(layout)); addEventListener('orientationchange', () => setTimeout(layout, 200));

// ---------- reels ----------
const reelEls = [], stripEls = [];
let current = [0, 1, 2, 3, 4].map(r => [0, 1, 2].map(y => cfg.strips[r][(y * 5 + r * 3) % cfg.strips[r].length]));
const isCrest = k => M.SYMBOLS[k].kind === 'high';
function cellHTML(k) { return `<div class="cell${isCrest(k) ? ' crest' : ''}" data-s="${k}"><img src="${SYM_SRC(k)}" alt="${M.SYMBOLS[k].name}" draggable="false" decoding="async"></div>`; }
function buildReels() {
  const root = $('reels'); root.innerHTML = '';
  for (let r = 0; r < 5; r++) {
    const reel = document.createElement('div'); reel.className = 'reel';
    const strip = document.createElement('div'); strip.className = 'strip'; strip.innerHTML = current[r].map(cellHTML).join('');
    reel.appendChild(strip); root.appendChild(reel); reelEls.push(reel); stripEls.push(strip);
  }
}
function sizeCells() { if (!reelEls[0]) return; const h = reelEls[0].clientHeight / 3; reelEls.forEach(r => r.style.setProperty('--ch', h + 'px')); }

let spinCtl = null;
function spinReel(r, finalSyms, dur, antic, ctl) {
  return new Promise(res => {
    const strip = stripEls[r], reel = reelEls[r], ch = reel.clientHeight / 3, K = Math.round(10 + dur / 90);
    const filler = []; for (let i = 0; i < K; i++) filler.push(cfg.strips[r][Math.floor(Math.random() * cfg.strips[r].length)]); // cosmetic only
    strip.innerHTML = [...finalSyms, ...filler, ...current[r]].map(cellHTML).join('');
    reel.classList.add('spinning');
    if (antic) ctl.timers.push(setTimeout(() => { if (!ctl.quick) { reel.classList.add('antic'); A.sfx.tension(Math.min(1.6, (dur - (dur - 1500)) / 1000)); } }, Math.max(0, dur - 1500)));
    const anim = strip.animate([{ transform: `translate3d(0,${-(K + 3) * ch}px,0)` }, { transform: `translate3d(0,${ch * 0.14}px,0)`, offset: 0.93 }, { transform: 'translate3d(0,0,0)' }],
      { duration: dur, easing: antic ? 'cubic-bezier(.3,.55,.25,1)' : 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    ctl.anims.push(anim);
    ctl.timers.push(setTimeout(() => reel.classList.remove('spinning'), dur * 0.8));
    let settled = false;
    const finish = () => { if (settled) return; settled = true; clearTimeout(guard);
      strip.innerHTML = finalSyms.map(cellHTML).join(''); anim.cancel(); reel.classList.remove('antic', 'spinning');
      if (!ctl.quick || !ctl.thudded) { A.sfx.thud(r); if (ctl.quick) ctl.thudded = true; }
      strip.querySelectorAll('.cell').forEach(c => c.classList.add('land'));
      if (finalSyms.includes('B')) { strip.querySelectorAll('[data-s="B"]').forEach(c => c.classList.add('banner')); A.sfx.bannerFlash(); }
      res();
    };
    anim.onfinish = finish; anim.oncancel = finish;
    const guard = setTimeout(finish, dur + 1500);   // watchdog: a reel can never leave the spin unresolved (not in ctl.timers, so quick-stop can't clear it)
  });
}
function quickStop() {
  if (!spinCtl || spinCtl.quick || !F.quickStop) return;
  spinCtl.quick = true; spinCtl.timers.forEach(clearTimeout);
  reelEls.forEach(r => r.classList.remove('antic'));
  spinCtl.anims.forEach(a => { try { a.finish(); } catch (e) {} });
}
function forcedResult(n) {
  // a real, reachable stop combination with n banners (one per chosen reel, middle row). Still a PAID spin.
  const reels = n >= 5 ? [0, 1, 2, 3, 4] : n === 4 ? [0, 1, 2, 4] : [0, 2, 4];
  const stops = [0, 1, 2, 3, 4].map(r => { const L = cfg.strips[r].length; if (!reels.includes(r)) { let s; do { s = Math.floor(rng() * L); } while ([0, 1, 2].some(d => cfg.strips[r][(s + d) % L] === 'B')); return s; } return (cfg.strips[r].indexOf('B') - 1 + L) % L; });
  const grid = stops.map((st, r) => [0, 1, 2].map(d => cfg.strips[r][(st + d) % cfg.strips[r].length]));
  return M.evaluate(cfg, grid, stops);
}

function forcedCrownResult() {
  // a real, reachable stop combination: CROWN visible on every reel whose crown is still unlit (no banners). Still a PAID spin.
  const m = meterOf(state.betIdx);
  const stops = [0, 1, 2, 3, 4].map(r => { const S = cfg.strips[r], L = S.length; if (!m[r]) return (S.indexOf('C') - 1 + L) % L;
    let s; do { s = Math.floor(rng() * L); } while ([0, 1, 2].some(d => S[(s + d) % L] === 'B' || S[(s + d) % L] === 'C')); return s; });
  const grid = stops.map((st, r) => [0, 1, 2].map(d => cfg.strips[r][(st + d) % cfg.strips[r].length]));
  return M.evaluate(cfg, grid, stops);
}
// ---------- win presentation ----------
function drawLines(wins) {
  const svg = $('lines'); svg.innerHTML = '';
  wins.forEach((w, i) => {
    const pts = M.PAYLINES[w.line].slice(0, w.count).map((row, r) => `${r * 100 + 50},${row * 100 + 50}`).join(' ');
    svg.insertAdjacentHTML('beforeend', `<polyline class="glow draw" style="animation-delay:${i * .15}s" points="${pts}" stroke="${LINE_COLORS[w.line]}" pathLength="1000"/><polyline class="core draw" style="animation-delay:${i * .15}s" points="${pts}" pathLength="1000"/>`);
  });
  const winCells = new Set();
  wins.forEach(w => M.PAYLINES[w.line].slice(0, w.count).forEach((row, r) => winCells.add(r + ':' + row)));
  stripEls.forEach((s, r) => [...s.children].forEach((c, y) => c.classList.toggle(winCells.has(r + ':' + y) ? 'win' : 'dim', true)));
  // dragon wild breathes fire up its reel when part of a win
  const wildReels = new Set(); wins.forEach(w => M.PAYLINES[w.line].slice(0, w.count).forEach((row, r) => { if (current[r][row] === 'W') wildReels.add(r); }));
  wildReels.forEach(r => { if (RM) return; const f = document.createElement('div'); f.className = 'firecol'; reelEls[r].appendChild(f); setTimeout(() => f.remove(), 1400); A.sfx.roar(); });
}
function clearWins() { $('lines').innerHTML = ''; document.querySelectorAll('.cell.win,.cell.dim').forEach(c => c.classList.remove('win', 'dim')); $('winBanner').classList.remove('show'); }
function banner(text) { const b = $('winBanner'); b.textContent = text; b.classList.add('show'); }
const tierOf = x => TIERS.find(t => x >= t[0]);
async function celebrate(tier, amount) {
  const [, name, level] = tier, c = $('celebrate'), ctl = {};
  c.innerHTML = `<img src="assets/${name}_win.webp" alt="${name.toUpperCase()} WIN"><div class="amt">0</div><div class="note">Tap to skip</div>`;
  c.classList.remove('hidden'); c.onclick = () => { ctl.skip = true; };
  A.sfx.drumroll(0.5); A.duck(0.25, 2.5); FX.flash(level >= 3 ? '#ffb040' : '#fff', 450);
  await sleep(450); A.sfx.fanfare(level); FX.coins(60 + level * 60, 'shower'); FX.coins(40 + level * 20, 'burst'); if (level >= 2) FX.shake($('app'), 8 + level * 3);
  await FX.countUp(c.querySelector('.amt'), 0, amount, 1200 + level * 900, fmt, () => A.sfx.tick(), ctl);
  FX.flash('#fff', 300, 0.5);
  await Promise.race([sleep(ctl.skip ? 300 : 1500), new Promise(r => c.onclick = r)]);
  c.classList.add('hidden'); c.innerHTML = '';
}

// ---------- spin ----------
// single entry point: one busy flag covering the WHOLE spin (reels + win + bonus + jackpot). Always released in finally.
let busy = false;
async function doSpin() {
  if (busy || state.spinning || state.inBonus) return;
  busy = true; state.spinning = true; ui();
  try { return await spinOnce(); }
  catch (e) { console.error('spin failed', e); $('status').textContent = 'Spin interrupted - ready again.'; stopAuto(); }
  finally { busy = false; state.spinning = false; state.inBonus = false; spinCtl = null; ui(); }
}
async function spinOnce() {
  if (state.balance < bet()) { $('status').textContent = 'Not enough demo credits - lower the bet or tap Reset.'; stopAuto('balance'); return; }
  A.init();
  setBalance(state.balance - bet(), false); state.spins++; clearWins(); ui();
  $('status').textContent = 'Spinning...'; A.sfx.whoosh(state.turbo ? 0.4 : 0.8);
  const res = forceBonus ? forcedResult(forceBonus) : forceJackpot ? forcedCrownResult() : M.spin(cfg, rng); forceBonus = 0;   // OUTCOME DECIDED HERE, before any animation
  // crowns + jackpot are part of the same decision: meter update and (if it fills) the jackpot award are fixed now
  const spinBet = state.betIdx, before = meterOf(spinBet), cr = M.applyCrowns(before, res.crownReels);
  const jp = cr.full ? M.playJackpot(cfg, rng, forceJackpot) : null; if (cr.full) forceJackpot = null;
  meters[spinBet] = cr.full ? [false, false, false, false, false] : cr.meter; saveMeters();
  res.crowns = cr.newly; res.jackpot = jp;
  const ctl = spinCtl = { anims: [], timers: [], quick: false };
  const k = state.turbo ? 0.45 : 1; let landed = 0, t = 620 * k; const jobs = [];
  for (let r = 0; r < 5; r++) {
    const antic = landed >= 2 && !state.turbo; t += antic ? 1500 : 240 * k;
    jobs.push(spinReel(r, res.grid[r], RM ? 250 + r * 60 : t, antic && !RM, ctl));
    if (res.grid[r].includes('B')) landed++;
  }
  await Promise.all(jobs); spinCtl = null; current = res.grid;
  if (cr.newly.length) {   // crowns fly up into their reel's meter
    cr.newly.forEach(r => { const c = stripEls[r] && [...stripEls[r].children].find(x => x.dataset.s === 'C'); c && c.classList.add('bflash'); });
    renderMeters(cr.meter); cr.newly.forEach((r, i) => { const el = document.querySelectorAll('#crowns i')[r]; el.classList.remove('lit'); void el.offsetWidth; el.classList.add('lit'); setTimeout(() => A.sfx.gem(), i * 90); });
    $('status').textContent = cr.full ? 'ALL 5 CROWNS LIT! PICK JACKPOT!' : `Crown collected! ${cr.meter.filter(Boolean).length} of 5`;
    await sleep(state.turbo ? 200 : 450);
  }
  const lineWin = Math.round(res.lineWinX * bet() * 100) / 100;
  if (lineWin > 0 || res.bonus || jp) state.hits++;   // same definition as MATH.md hit frequency (any award: line win, bonus trigger or jackpot)
  state.log.push({ spin: state.spins, stops: res.stops, lineWin, bonus: res.bonus, crowns: cr.newly, meter: cr.meter, jackpot: jp && jp.tier, quick: ctl.quick });
  ui();
  if (lineWin > 0) {
    drawLines(res.wins);
    const tier = tierOf(res.lineWinX);
    $('status').textContent = res.wins.map(w => `Line ${w.line + 1}: ${w.count}× ${M.SYMBOLS[w.sym].name}`).join(' · ');
    if (tier) await celebrate(tier, lineWin);
    else A.sfx.fanfare(0);
    banner(`WIN ${fmt(lineWin)}`); setBalance(state.balance + lineWin);
    addHistory(lineWin, res.wins.map(w => `${w.count}× ${M.SYMBOLS[w.sym].name}`).join(', '));
    if (tier && state.auto?.stopBig && !DEMO) stopAuto('big win');
  } else if (!res.bonus && !jp && !cr.newly.length) $('status').textContent = 'No win - spin again!';
  if (res.bonus) { stopAuto('bonus'); state.inBonus = true; ui(); await sleep(lineWin > 0 ? 900 : 300); await runBonus(res.bonus); }
  if (jp) { stopAuto('jackpot'); state.inBonus = true; ui(); await sleep(300); await runJackpot(jp, BETS[spinBet]); }
  return res;
}
function addHistory(win, desc) { state.history.unshift({ spin: state.spins, win, desc, bet: bet() }); state.history.length = Math.min(state.history.length, 30); }

// ---------- autoplay / turbo ----------
let autoRunning = false;
async function autoLoop() {
  if (autoRunning) return; autoRunning = true;
  try { while (state.auto && state.auto.left > 0) {
    if (state.auto.floor && state.balance - bet() < state.auto.floor) { stopAuto('balance limit'); break; }
    state.auto.left--; ui(); await doSpin(); if (!state.auto) break;
    await sleep(state.turbo ? 150 : 450);
  }
  if (state.auto) stopAuto('done'); } finally { autoRunning = false; ui(); }
}
function stopAuto(why) { if (!state.auto) return; state.auto = null; ui(); if (why && why !== 'user') $('status').textContent = `Autoplay stopped (${why}).`; }
function autoMenu() {
  openPanel(`<h2>Autoplay</h2><p class="note">Stops automatically on the Clash of Crowns bonus.</p>
   <div class="opts">${[10, 25, 50, 100].map(n => `<button data-n="${n}">${n}</button>`).join('')}</div>
   <div class="opts"><label><input type="checkbox" id="aBig" checked> Stop on a Big Win or more</label></div>
   <div class="opts"><label>Stop if balance falls below <select id="aFloor"><option value="0">no limit</option><option>250</option><option selected>500</option><option>750</option><option>900</option></select></label></div>
   <button class="big" data-close>CANCEL</button>`, p => p.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    state.auto = { left: +b.dataset.n, stopBig: p.querySelector('#aBig').checked, floor: +p.querySelector('#aFloor').value }; closePanel(); ui(); autoLoop(); }));
}

// ---------- panels ----------
function openPanel(html, bind) {
  const ov = $('overlay'); ov.innerHTML = `<div class="panel">${html}</div>`; ov.classList.remove('hidden'); A.sfx.click();
  const p = ov.firstChild; p.querySelectorAll('[data-close]').forEach(b => b.onclick = closePanel); ov.onclick = e => { if (e.target === ov) closePanel(); };
  bind && bind(p);
}
function closePanel() { const ov = $('overlay'), p = ov.firstChild; if (!p) return; p.classList.add('out'); setTimeout(() => { ov.classList.add('hidden'); ov.innerHTML = ''; }, RM ? 0 : 240); }
function showPaytable() {
  const rows = Object.entries(cfg.paytable).map(([k, p]) => `<div><img src="${SYM_SRC(k)}" alt=""><span><b>${M.SYMBOLS[k].name}</b><br>3: ${p[0]} · 4: ${p[1]} · 5: ${p[2]}</span></div>`).join('');
  openPanel(`<h2>Paytable</h2><p class="note">Pays × line bet (line bet = bet ÷ 5), left to right on 5 lines: 3 rows + 2 V-shapes. The Dragon WILD substitutes for all symbols except the War Banner. CROWNS pay nothing on lines; a Crown lights its reel's crown meter (meters are kept per bet level). Light all five to play the PICK JACKPOT: pick shields until three match - Mini ${cfg.jackpot.tiers.mini.x}×, Minor ${cfg.jackpot.tiers.minor.x}×, Major ${cfg.jackpot.tiers.major.x}×, Grand ${cfg.jackpot.tiers.grand.x}× bet; the meters then reset. 3+ War Banners anywhere trigger Clash of Crowns (4 banners: +1 round; 5 banners: +2 rounds and a Shield). Each round you choose STRIKE, GUARD or FURY - the result is already decided, the move only changes the show. Win the duel: it pays bet × final multiplier, then SPOILS OF WAR awards 5-10 free spins where every win is × that multiplier and landed kingdom crests stay sticky. Lose: the LAST STAND consolation pays 1-3× bet, so the bonus never pays zero. Quick-stop only shortens the animation - the result is decided when the spin starts.</p>
  <div class="paytable">${rows}<div><img src="${SYM_SRC('B')}" alt=""><span><b>War Banner</b><br>scatter · bonus trigger</span></div><div><img src="${SYM_SRC('C')}" alt=""><span><b>Crown</b><br>collect · lights the reel's meter</span></div></div>
  <p class="note">Free play demo - no real money. Theoretical RTP of this build: ${(cfg.targetRTP * 100).toFixed(0)}% (uncertified prototype).</p><button class="big" data-close>CLOSE</button>`);
}
function showHistory() {
  const rows = state.history.length ? state.history.map(h => `<div><span>#${h.spin} · ${h.desc}</span><b>+${fmt(h.win)}</b></div>`).join('') : '<p>No wins yet - spin to make history!</p>';
  openPanel(`<h2>Recent wins</h2><p class="note">Spins ${state.spins} · Hits ${state.hits}</p><div class="hist">${rows}</div><button class="big" data-close>CLOSE</button>`);
}

// ---------- bonus: Clash of Crowns cinematic chain ----------
let bctl = { speed: 1, skip: false };
const bsleep = ms => bctl.skip ? sleep(0) : sleep((RM ? ms * 0.4 : ms) / bctl.speed);
const phase = p => { state.phases.push(p); };
let bonusVideo = null;
function preloadBonusVideo() {
  if (!F.bonusVideo || RM || bonusVideo) return;
  bonusVideo = document.createElement('video'); Object.assign(bonusVideo, { muted: true, playsInline: true, preload: 'auto' }); bonusVideo.setAttribute('playsinline', '');
  bonusVideo.src = 'assets/bonus_transition_web.mp4'; bonusVideo.onerror = () => { bonusVideo.failed = true; }; bonusVideo.load();
}
function cineSkipUI(c) {
  c.insertAdjacentHTML('beforeend', '<button class="skip" id="bSkip">Skip ▸▸</button><div class="speedhint">Tap to speed up</div>');
  $('bSkip').onclick = e => { e.stopPropagation(); bctl.skip = true; };
  c.onclick = () => { bctl.speed = 3; };
}
async function runBonus(count) {
  state.inBonus = true; bctl = { speed: 1, skip: false }; state.phases = []; ui();
  const tierCfg = cfg.bonus.tiers[count];
  $('status').textContent = `${count} WAR BANNERS! Clash of Crowns!`;
  // 1. banners flash on the reels + war horn
  phase('bannerFlash'); A.sfx.horn(); A.theme('bonus');
  document.querySelectorAll('#reels [data-s="B"]').forEach(c => c.classList.add('bflash'));
  FX.flash('#ffb040', 500, 0.5); await sleep(RM ? 300 : 1000);
  // 2. gates burst: video clip (baked title) or code camera push through the text-free art (code title)
  phase('transition');
  const c = $('cine'); c.innerHTML = ''; c.classList.remove('hidden'); cineSkipUI(c);
  A.sfx.whoosh(1.2); A.sfx.gates();
  let usedVideo = false;
  if (bonusVideo && !bonusVideo.failed && bonusVideo.readyState >= 2 && !bctl.skip) {
    try {
      c.prepend(bonusVideo); bonusVideo.currentTime = BONUS_VIDEO_START; await bonusVideo.play(); usedVideo = true;
      await new Promise(res => { const end = () => res(); bonusVideo.onended = end; const iv = setInterval(() => { if (bctl.skip || bctl.speed > 1 && bonusVideo.currentTime > 2) { clearInterval(iv); end(); } }, 100); setTimeout(() => { clearInterval(iv); end(); }, 5000); });
      bonusVideo.pause();
    } catch (e) { usedVideo = false; }
  }
  if (!usedVideo) {
    c.insertAdjacentHTML('afterbegin', '<div class="push"></div><div class="ctitle">CLASH<br>OF CROWNS</div>');
    await bsleep(2500);
  }
  state.bonusVideoUsed = usedVideo;
  FX.flash('#fff', 400, 0.9);
  // 3. champion select slides in
  phase('select');
  c.innerHTML = ''; c.onclick = null; bctl.skip = false; bctl.speed = 1;
  const heroes = cfg.bonus.heroes, extra = count - 3;
  c.insertAdjacentHTML('beforeend', `<div class="scene" id="heroSelect" style="background:linear-gradient(#0008,#000c)">
    <h2>Choose Your Champion</h2>
    <div class="callouts">${extra ? `<span class="callout rounds">EXTRA ROUNDS +${extra === 2 ? 2 : 1}</span>` : ''}${tierCfg.shield ? '<span class="callout shield">🛡 SHIELD</span>' : ''}<span class="callout" style="background:#000a;border:2px solid #d4a23a">${tierCfg.rounds} ROUNDS</span></div>
    <div class="hs">${Object.keys(heroes).map((k, i) => `<button data-hero="${k}" style="left:${[2, 22.5, 41, 59.8, 78.6][i]}%;--c:${HERO_COLORS[k]}" aria-label="${heroes[k].name}"></button>`).join('')}</div>
    <div class="hcap">${Object.entries(heroes).map(([k, h]) => `<div style="--c:${HERO_COLORS[k]}">${h.name.split(' ').slice(1).join(' ')}<small>${h.vol} volatility</small></div>`).join('')}</div>
    <p class="note">Every champion has the same expected return - the choice only changes the swing. Outcomes are random.</p></div>`);
  window.__game.bonusOpen = { count, rounds: tierCfg.rounds, shield: tierCfg.shield };
  const hero = await new Promise(res => { let done=false; const pick=b=>{ if(done)return; done=true; b.classList.add('picked'); A.sfx.gem(); res(b.dataset.hero); }; c.querySelectorAll('[data-hero]').forEach(b => { b.addEventListener('click', e => { e.stopPropagation(); pick(b); }, { once:true }); }); });
  FX.flash(HERO_COLORS[hero], 450, 0.8); await sleep(RM ? 100 : 550);
  cineSkipUI(c);
  const outcome = M.playBonus(cfg, hero, count, rng, forceDuel); forceDuel = {};   // EVERYTHING fixed now (duel, multiplier, free spins); moves only change the show
  window.__game.bonusOutcome = outcome; state.moves = [];
  const h = heroes[hero];
  // 4. versus splash
  phase('versus');
  c.querySelector('.scene')?.remove();
  c.insertAdjacentHTML('afterbegin', `<div class="vs" id="versus"><div class="side hero" style="--c:${HERO_COLORS[hero]}"><img src="assets/hero_${hero}.webp" alt=""><div class="name">${h.name}</div></div>
    <div class="vsword">VS</div><div class="side horde"><img src="assets/horde_champion.webp" alt=""><div class="name">${CHAMPION}</div></div></div>`);
  A.sfx.whoosh(0.5); setTimeout(() => { A.sfx.slam(); FX.shake(c, 12); }, RM ? 0 : 450);
  await bsleep(1900);
  // 5. duel
  phase('duel');
  c.querySelector('#versus')?.remove();
  c.insertAdjacentHTML('afterbegin', `<div class="duel" id="duel">
    <div class="hud"><div class="grp"><div class="lbl">${h.name.split(' ')[0].toUpperCase()} HEALTH</div><div class="bar hp"><i id="heroHP"></i></div><div class="lbl">MORALE</div><div class="bar morale"><i id="morale" style="width:40%"></i></div></div>
      <div class="multbanner" id="mult">x0</div>
      <div class="grp right"><div class="lbl">HORDE HEALTH</div><div class="bar horde"><i id="hordeHP"></i></div>${outcome.shield ? '<div class="shieldtag" id="shieldTag">🛡 SHIELD READY</div>' : ''}</div></div>
    <div class="arena"><div class="fighter" id="fHero" style="--c:${HERO_COLORS[hero]}" data-hero="${hero}"><img class="port sprite" src="assets/coalition/${hero}_charge.webp" alt="${h.name}"></div>
      <div class="fighter" id="fHorde"><img class="champ" src="assets/horde_champion.webp" alt="${CHAMPION}"></div></div>
    <div class="moves hidden" id="moves">${Object.entries(MOVES).map(([k, m]) => `<button data-move="${k}"><span>${m.icon}</span>${m.label}</button>`).join('')}<div class="mtimer"><i id="mtimer"></i></div></div>
    <div class="dfoot"><div class="rounds" id="rounds">ROUND 1 OF ${outcome.rounds}</div><div class="log" id="log">The Horde champion approaches...</div></div></div>`);
  const set = (id, v) => { const e = $(id); if (e) e.style.width = v + '%'; };
  const vfx = (el, name, big) => { const i = document.createElement('img'); i.src = `assets/vfx/${name}.jpg`; i.className = 'vfx' + (big ? ' big' : ''); i.alt = ''; el.appendChild(i); setTimeout(() => i.remove(), 1100); };
  await bsleep(900);
  const critAt = Math.max(3, outcome.total * 0.3);
  // three acts (presentation only - the outcome above is already fixed): I duel, II Dragon Phase transform, III coalition assists
  const dragonAt = Math.max(2, Math.ceil(outcome.rounds / 2));
  const allies = Object.keys(heroes).filter(k => k !== hero);   // never the player's own champion
  let assistN = 0;
  for (const s of outcome.seq) {
    if (s.round === dragonAt && !state.dragon) {
      state.dragon = true; phase('dragonPhase');
      const fD0 = $('fHorde'); $('log').textContent = 'Vorrhak takes his DRAGON FORM!';
      A.sfx.roar(); A.duck(0.3, 1.5); vfx(fD0, 'dragonfire', true); FX.shake(c, 16); FX.flash('#ff5a1a', 500, 0.8);
      fD0.insertAdjacentHTML('beforeend', `<img class="champ dragon" src="assets/vorrhak_dragon.webp" alt="Vorrhak, dragon form">`);
      fD0.classList.add('transform'); await bsleep(1300);
    }
    if (state.dragon && (s.result === 'win' || s.result === 'kill')) {
      const ally = allies[(assistN++ + Math.floor(Math.random() * allies.length)) % allies.length];   // cosmetic pick
      const a = document.createElement('img'); a.className = 'ally'; a.src = `assets/coalition/${ally}_charge.webp`; a.alt = heroes[ally].name; a.style.setProperty('--c', HERO_COLORS[ally]);
      $('duel').querySelector('.arena').appendChild(a); A.sfx.whoosh(0.5); setTimeout(() => a.remove(), RM ? 600 : 1300);
      $('log').textContent = `${heroes[ally].name} joins the charge!`; await bsleep(450);
    }
    const fH = $('fHero'), fD = $('fHorde'); [fH, fD].forEach(f => f.classList.remove('lungeR', 'lungeL', 'hit', 'mv-strike', 'mv-guard', 'mv-fury')); void fH.offsetWidth;
    $('rounds').textContent = `ROUND ${s.round} OF ${outcome.rounds}`;
    // player move: STRIKE / GUARD / FURY (5 s auto-pick). Presentation only: s (the round result) is already fixed.
    const mv = await chooseMove(); state.moves.push(mv);
    fH.classList.add('mv-' + mv); A.sfx[mv === 'guard' ? 'block' : mv === 'fury' ? 'roar' : 'whoosh'](0.5);
    if (mv === 'fury') FX.flash('#ff3a00', 250, 0.35); if (mv === 'guard') vfx(fH, 'block');
    $('log').textContent = mv === 'strike' ? 'You STRIKE!' : mv === 'guard' ? 'You raise your GUARD...' : 'You unleash your FURY!';
    await bsleep(450); fH.classList.remove('mv-' + mv); void fH.offsetWidth;
    if (s.result === 'win' || s.result === 'kill') {
      if (s.result === 'kill') { $('log').textContent = 'The final blow...'; A.sfx.drumroll(0.9); A.duck(0.3, 2); await bsleep(950); }
      fH.classList.add('lungeR'); const crit = s.result === 'kill' || s.add >= critAt;
      await bsleep(150); fD.classList.add('hit'); vfx(fD, 'slash'); A.sfx.clash();
      if (crit) { vfx(fD, s.result === 'kill' ? 'impact' : 'crit', true); A.sfx.crit(); FX.shake(c, s.result === 'kill' ? 18 : 11); FX.flash('#fff', 250, 0.6); }
      $('log').textContent = s.result === 'kill' ? `KILLING BLOW! +x${s.add.toFixed(1)}` : `${crit ? 'CRITICAL HIT' : 'Hit'}! +x${s.add.toFixed(1)}`;
      if (s.result === 'kill') { vfx(fD, 'victory', true); FX.coins(120, 'burst'); }
    } else if (s.result === 'blocked') {
      fD.classList.add('lungeL'); await bsleep(150); vfx(fH, 'block', true); A.sfx.block(); $('log').textContent = 'The Shield blocks the Horde!'; const st = $('shieldTag'); if (st) st.textContent = '🛡 SHIELD USED';
    } else if (s.result === 'fall') {
      $('log').textContent = 'Vorrhak unleashes the inferno...'; A.sfx.drumroll(0.9); await bsleep(800);
      fD.classList.add('lungeL'); await bsleep(150); vfx(fH, 'dragonfire', true); vfx(fH, 'impact', true); A.sfx.roar(); A.sfx.impact(); FX.shake(c, 18); FX.flash('#ff3a00', 400, 0.7);
      fH.classList.add('hit', 'fallen'); $('log').textContent = 'Your champion falls! The spoils are lost...';
    } else {
      fD.classList.add('lungeL'); await bsleep(150); vfx(fH, 'dragonfire', true); A.sfx.roar(); await bsleep(150); fH.classList.add('hit'); vfx(fH, 'impact'); A.sfx.impact(); $('log').textContent = 'The Horde strikes back!';
    }
    const m = $('mult'); m.textContent = 'x' + (+s.mult).toFixed(1).replace(/\.0$/, ''); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
    set('morale', s.morale); set('heroHP', s.heroHP); set('hordeHP', s.hordeHP);
    await bsleep(s.result === 'kill' || s.result === 'fall' ? 1100 : 1100);
  }
  state.dragon = false;
  const B = bet(); let duelWin = 0, fsWin = 0;
  // tear down the duel HUD / skip / speedhint so they cannot show through the payout overlay
  const clearDuelChrome = () => { c.querySelector('#duel')?.remove(); c.querySelectorAll('.skip,.speedhint').forEach(e => e.remove()); c.onclick = null; };
  if (outcome.won) {
    // 6a. victory: the duel pays bet x multiplier, and the multiplier carries into Spoils of War
    phase('total'); clearDuelChrome();
    duelWin = Math.round(B * outcome.total * 100) / 100;
    c.insertAdjacentHTML('beforeend', `<div class="total" id="total"><div class="vic"></div><h2 class="ctitle" style="font-size:clamp(34px,10vw,64px);animation:none">VICTORY!</h2>
      <div class="amt" id="bonusAmt">0</div><div class="calc">Bet ${B} × x${outcome.total} = ${fmt(duelWin)} demo credits</div>
      <div class="spoils">SPOILS OF WAR<br><b>${outcome.fsN} FREE SPINS</b> at <b>x${outcome.total}</b><small>Kingdom crests stick</small></div>
      <button class="big" id="collect">CLAIM THE SPOILS</button></div>`);
    A.sfx.fanfare(1); FX.coins(80, 'shower'); FX.flash('#ffd77a', 400, 0.6);
    const cu = {}; c.onclick = () => { cu.skip = true; };
    await FX.countUp($('bonusAmt'), 0, duelWin, bctl.skip ? 200 : 1400, fmt, () => A.sfx.tick(), cu);
    await new Promise(res => { $('collect').onclick = e => { e.stopPropagation(); res(); }; });
    // 6b. free spins on the reels
    phase('freeSpins');
    c.onclick = null; c.insertAdjacentHTML('beforeend', '<div class="gate l"></div><div class="gate r"></div>'); A.sfx.gates();
    await sleep(RM ? 50 : 700); c.classList.add('hidden'); c.innerHTML = '';
    fsWin = await runFreeSpins(outcome.fs, B);
  } else {
    // 6c. Last Stand consolation - the bonus never pays zero
    phase('lastStand'); clearDuelChrome();
    duelWin = Math.round(B * outcome.lastStand * 100) / 100;
    c.insertAdjacentHTML('beforeend', `<div class="total laststand" id="total"><div class="vic"></div><h2 class="ctitle" style="font-size:clamp(30px,9vw,58px);animation:none">LAST STAND</h2>
      <p class="lsnote">Your champion fell, but the kingdom honours their courage.</p>
      <div class="amt" id="bonusAmt">0</div><div class="calc">Consolation: bet ${B} × ${outcome.lastStand} = ${fmt(duelWin)} demo credits</div><button class="big" id="collect">COLLECT</button></div>`);
    A.sfx.fanfare(0); FX.coins(30, 'burst');
    const cu = {}; c.onclick = () => { cu.skip = true; };
    await FX.countUp($('bonusAmt'), 0, duelWin, bctl.skip ? 200 : 1200, fmt, () => A.sfx.tick(), cu);
    await new Promise(res => { $('collect').onclick = e => { e.stopPropagation(); res(); }; });
  }
  const win = Math.round((duelWin + fsWin) * 100) / 100;
  window.__game.lastBonus = { hero, count, won: outcome.won, total: outcome.total, duelWin, fsWin, win, fsN: outcome.fsN, lastStand: outcome.lastStand, rounds: outcome.rounds, shield: outcome.shield, video: usedVideo, moves: state.moves.slice(),
    fsGrids: outcome.fs ? outcome.fs.spins.map(x => x.grid.map(c => c.join('')).join('|')) : [] };
  // 7. back to the reels
  phase('return');
  if (!c.classList.contains('hidden')) { c.onclick = null; c.insertAdjacentHTML('beforeend', '<div class="gate l"></div><div class="gate r"></div>'); A.sfx.gates(); await sleep(RM ? 50 : 800); c.classList.add('hidden'); c.innerHTML = ''; }
  A.theme('base');
  setBalance(state.balance + win);
  addHistory(win, outcome.won ? `Clash of Crowns x${outcome.total} + ${outcome.fsN} free spins (${h.name.split(' ')[0]})` : `Last Stand (${h.name.split(' ')[0]})`);
  banner(`BONUS WIN ${fmt(win)}`); state.inBonus = false; ui();
  // the triggering spin is finished: clear win lines and settle the War Banners (no re-highlight)
  clearWins();
  document.querySelectorAll('#reels .cell.banner,#reels .cell.bflash').forEach(el => { el.classList.remove('banner', 'bflash'); el.classList.add('settled'); });
  $('status').textContent = `Clash of Crowns paid ${fmt(win)} demo credits.`;
  phase('done');
}
function chooseMove() {
  // Skip only speeds duel animations (bsleep); it must NOT auto-resolve the move. Turbo / ?demo=1 keep a shorter timer.
  const box = $('moves'); box.classList.remove('hidden'); A.sfx.click();
  const bar = $('mtimer'); bar.style.transition = 'none'; bar.style.width = '100%'; void bar.offsetWidth;
  const ms = RM ? 400 : (DEMO || state.turbo) ? 1500 : MOVE_AUTO_MS;
  bar.style.transition = `width ${ms}ms linear`; bar.style.width = '0%';
  // pause the global skip while the player chooses, so a prior Skip press cannot zero this wait
  const heldSkip = bctl.skip; bctl.skip = false;
  return new Promise(res => {
    const done = k => { clearTimeout(tm); bctl.skip = heldSkip; box.classList.add('hidden'); box.querySelectorAll('button').forEach(b => b.onclick = null); res(k); };
    const keys = Object.keys(MOVES), tm = setTimeout(() => done(keys[Math.floor(Math.random() * 3)]), ms);
    box.querySelectorAll('[data-move]').forEach(b => b.onclick = e => { e.stopPropagation(); b.classList.add('picked'); setTimeout(() => b.classList.remove('picked'), 300); done(b.dataset.move); });
  });
}
// Spoils of War: replays the pre-drawn free spins on the main reels (sticky crests, every win x multiplier), then the tally
async function runFreeSpins(fs, B) {
  const hud = $('fsHud'); 
  // pin the HUD over the ladder's bounding box so the control row cannot shift
  const placeHud = () => { const L = $('ladder'); if (!L) return; const r = L.getBoundingClientRect(); hud.style.top = (r.top + scrollY) + 'px'; hud.style.width = r.width + 'px'; };
  hud.classList.remove('hidden'); document.body.classList.add('fsmode'); placeHud();
  const onR = () => placeHud(); addEventListener('resize', onR);
  A.theme('bonus');
  let total = 0; const set = (i) => { hud.innerHTML = `<div><small>FREE SPIN</small><b id="fsCount">${i} / ${fs.n}</b></div><div class="fsm"><small>MULTIPLIER</small><b>x${fs.mult}</b></div><div><small>SPOILS</small><b id="fsTotal">${fmt(total)}</b></div>`; };
  set(0); clearWins(); await sleep(RM ? 100 : 500);
  for (let i = 0; i < fs.spins.length; i++) {
    const sp = fs.spins[i]; set(i + 1); clearWins(); A.sfx.whoosh(0.6);
    const ctl = spinCtl = { anims: [], timers: [], quick: false }; const k = state.turbo ? 0.45 : 0.8;
    const stuck = new Set(i ? fs.spins[i - 1].sticky : []);
    await Promise.all([0, 1, 2, 3, 4].map(r => spinReel(r, sp.grid[r], RM ? 250 : 620 * k + r * 200 * k, false, ctl))); spinCtl = null; current = sp.grid;
    sp.sticky.forEach(key => { const [r, y] = key.split(':').map(Number); const cell = stripEls[r].children[y]; cell && cell.classList.add('sticky'); if (!stuck.has(key) && cell) { cell.classList.add('stuck'); A.sfx.gem(); } });
    if (sp.winX > 0) {
      const w = Math.round(sp.winX * B * 100) / 100; total = Math.round((total + w) * 100) / 100;
      drawLines(sp.wins); banner(`WIN ${fmt(sp.lineWinX * B)} × ${fs.mult} = ${fmt(w)}`); A.sfx.fanfare(0); set(i + 1);
      $('fsTotal').classList.add('pop'); $('status').textContent = `Free spin ${i + 1}: ${fmt(w)} demo credits`;
      await sleep(RM ? 300 : state.turbo ? 700 : 1300);
    } else { $('status').textContent = `Free spin ${i + 1}: no win`; await sleep(RM ? 150 : state.turbo ? 250 : 550); }
    window.__game.fsProgress = { i: i + 1, n: fs.n, total };
  }
  phase('tally');
  // big tally with the platinum tiers (on the whole bonus win in x bet)
  const grand = total + Math.round(B * fs.mult * 100) / 100, tier = tierOf(grand / B);
  if (tier) await celebrate(tier, grand);
  const c = $('cine'); c.innerHTML = ''; c.classList.remove('hidden');
  c.insertAdjacentHTML('beforeend', `<div class="total tally" id="fsTally"><div class="vic"></div>${tier ? `<img src="assets/${tier[1]}_win.webp" alt="${tier[1].toUpperCase()} WIN" style="width:min(70vw,420px);animation:titlepop .7s cubic-bezier(.2,1.7,.4,1) both">` : '<h2 class="ctitle" style="font-size:clamp(30px,9vw,58px);animation:none">SPOILS OF WAR</h2>'}
    <div class="amt" id="tallyAmt">0</div>
    <div class="calc">Duel x${fs.mult}: ${fmt(B * fs.mult)} · ${fs.n} free spins at x${fs.mult}: ${fmt(total)}</div><button class="big" id="collect">COLLECT</button></div>`);
  A.sfx.fanfare(tier ? tier[2] : 1); FX.coins(80 + (tier ? tier[2] * 60 : 0), 'shower');
  const cu = {}; c.onclick = () => { cu.skip = true; };
  await FX.countUp($('tallyAmt'), 0, grand, RM ? 200 : 1800, fmt, () => A.sfx.tick(), cu);
  window.__game.fsTally = { total, grand, tier: tier ? tier[1] : null };
  await new Promise(res => { $('collect').onclick = e => { e.stopPropagation(); res(); }; });
  hud.classList.add('hidden'); document.body.classList.remove('fsmode'); removeEventListener('resize', onR); hud.style.top = hud.style.width = ''; document.querySelectorAll('.cell.sticky').forEach(x => x.classList.remove('sticky', 'stuck'));
  return total;
}

// ---------- PICK JACKPOT: match three (award already drawn; the board is arranged around it) ----------
async function runJackpot(jp, b) {
  state.inBonus = true; ui(); state.phases = [];
  const c = $('cine'); c.innerHTML = ''; c.classList.remove('hidden'); c.onclick = null;
  phase('jpIntro'); A.sfx.horn(); A.theme('bonus'); FX.flash('#ffd77a', 500, 0.7);
  const amt = t => fmt(cfg.jackpot.tiers[t].x * b);
  c.insertAdjacentHTML('beforeend', `<div class="scene jp" id="jackpot">
    <h2 class="jptitle">PICK JACKPOT</h2>
    <div class="jplaques">${[...M.JP_TIERS].reverse().map(t => `<div class="plq" data-t="${t}" style="--c:${JP_COLORS[t]}"><img src="assets/jackpot/plaque_${t}.webp" alt="${t.toUpperCase()}"><b>${amt(t)}</b><span class="pips"><i></i><i></i><i></i></span></div>`).join('')}</div>
    <p class="note">Match 3 to win that jackpot</p>
    <div class="board">${Array.from({ length: 12 }, (_, i) => `<button class="tile" data-i="${i}" aria-label="Pick tile ${i + 1}"><span class="in"><img class="back" src="assets/jackpot/pick_shield.webp" alt=""><img class="front" alt=""></span></button>`).join('')}</div></div>`);
  window.__game.jackpotOpen = { tier: jp.tier };
  phase('pick');
  const tiles = [...c.querySelectorAll('.tile')], counts = { mini: 0, minor: 0, major: 0, grand: 0 };
  const flip = (tile, t, dim) => { const f = tile.querySelector('.front'); f.src = `assets/jackpot/tile_${t}.webp`; f.alt = t; tile.dataset.t = t; tile.style.setProperty('--c', JP_COLORS[t]); tile.classList.add('flipped'); if (dim) tile.classList.add('dim'); tile.disabled = true; };
  let k = 0, matched = false;
  await new Promise(res => tiles.forEach(tile => tile.onclick = e => {
    e.stopPropagation(); if (tile.disabled || matched || k >= jp.reveal.length) return;
    const t = jp.reveal[k++]; flip(tile, t); counts[t]++; A.sfx.clash();
    const pl = c.querySelector(`.jplaques .plq[data-t="${t}"]`); pl.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < counts[t]));
    pl.classList.remove('bump'); void pl.offsetWidth; pl.classList.add('bump');
    // stop on the first triple (the predetermined tier). Never award with fewer than 3 of that tier showing.
    if (counts[t] >= 3) { matched = true; res(); }
  }));
  // guarantee exactly 3 of the winning tier are face-up before we celebrate (covers any missed flip)
  while (tiles.filter(t => t.dataset.t === jp.tier).length < 3 && k < jp.reveal.length) {
    const tile = tiles.find(t => !t.disabled); if (!tile) break;
    const t = jp.reveal[k++]; flip(tile, t); counts[t]++; 
    const plx = c.querySelector(`.jplaques .plq[data-t="${t}"]`); plx.querySelectorAll('.pips i').forEach((p, j) => p.classList.toggle('on', j < counts[t]));
  }
  phase('match');
  const winners = tiles.filter(t => t.dataset.t === jp.tier);
  if (winners.length !== 3) console.warn('jackpot match expected 3 tiles of', jp.tier, 'got', winners.length);
  const pl = c.querySelector(`.jplaques .plq[data-t="${jp.tier}"]`); pl.classList.add('won');
  winners.forEach(t => t.classList.add('match'));
  A.sfx.fanfare(JP_LEVEL[jp.tier]); FX.flash(JP_COLORS[jp.tier], 450, 0.7); FX.coins(40 + JP_LEVEL[jp.tier] * 60, 'burst');
  await sleep(RM ? 200 : 900);
  phase('reveal');
  // unconsumed reveal entries (picks after the winning triple) still need to be shown face-up with the rest
  const pool = [...jp.reveal.slice(k), ...jp.rest];
  let ri = 0; for (const tile of tiles) if (!tile.disabled) { flip(tile, pool[ri++], true); await sleep(RM ? 0 : 70); }
  await sleep(RM ? 200 : 700);
  const win = Math.round(jp.x * b * 100) / 100;
  phase('award');
  // dedicated jackpot celebration only - do NOT run the generic Big/Mega/Epic banner over the board
  c.querySelectorAll('.skip,.speedhint').forEach(e => e.remove()); c.onclick = null;
  c.insertAdjacentHTML('beforeend', `<div class="total jptotal" id="jpTotal" style="--c:${JP_COLORS[jp.tier]}"><div class="plq jpwon"><img src="assets/jackpot/plaque_${jp.tier}.webp" alt="${jp.tier.toUpperCase()}"><b>${fmt(win)}</b></div><div class="amt" id="jpAmt">0</div>
    <div class="calc">${jp.tier.toUpperCase()} JACKPOT · bet ${b} × ${jp.x} = ${fmt(win)} demo credits</div><button class="big" id="jpCollect">COLLECT</button></div>`);
  A.sfx.fanfare(JP_LEVEL[jp.tier]); A.duck(0.3, 2); FX.flash(JP_COLORS[jp.tier], 500, 0.75);
  FX.coins(50 + JP_LEVEL[jp.tier] * 70, 'shower'); if (jp.tier === 'grand') FX.coins(80, 'burst');
  const cu = {}; c.onclick = () => { cu.skip = true; };
  await FX.countUp($('jpAmt'), 0, win, RM ? 200 : 1000 + JP_LEVEL[jp.tier] * 500, fmt, () => A.sfx.tick(), cu);
  window.__game.lastJackpot = { tier: jp.tier, x: jp.x, win, reveal: jp.reveal, rest: jp.rest, matched: winners.length };
  await new Promise(res => { $('jpCollect').onclick = e => { e.stopPropagation(); res(); }; });
  phase('return');
  c.onclick = null; c.insertAdjacentHTML('beforeend', '<div class="gate l"></div><div class="gate r"></div>'); A.sfx.gates(); A.theme('base');
  await sleep(RM ? 50 : 800); c.classList.add('hidden'); c.innerHTML = '';
  setBalance(state.balance + win); addHistory(win, `${jp.tier.toUpperCase()} Jackpot`);
  banner(`${jp.tier.toUpperCase()} JACKPOT ${fmt(win)}`); state.inBonus = false; ui();
  $('status').textContent = `${jp.tier.toUpperCase()} Jackpot paid ${fmt(win)} demo credits. Crowns reset.`;
  phase('done');
}

// ---------- loader & intro ----------
const PRELOAD = [...Object.values(M.SYMBOLS).map(s => 'assets/symbols/' + s.file), 'assets/reel_frame.webp', 'assets/background.webp', 'assets/background_portrait.webp',
  'assets/hero_select_bg_notitle.webp', 'assets/duel_arena_bg_balanced.webp', 'assets/bonus_transition_notext.webp', 'assets/horde_champion.webp', 'assets/vorrhak_dragon.webp', ...Object.keys(HERO_COLORS).map(k => `assets/coalition/${k}_charge.webp`),
  ...Object.keys(HERO_COLORS).map(k => `assets/hero_${k}.webp`), ...['slash', 'block', 'impact', 'crit', 'dragonfire', 'victory'].map(v => `assets/vfx/${v}.jpg`),
  'assets/big_win.webp', 'assets/mega_win.webp', 'assets/epic_win.webp', 'assets/ui/crown_meter_off.webp', 'assets/ui/crown_meter_on.webp', 'assets/jackpot/pick_shield.webp',
  ...['mini', 'minor', 'major', 'grand'].flatMap(t => [`assets/jackpot/tile_${t}.webp`, `assets/jackpot/plaque_${t}.webp`])];
function preload() {
  let done = 0; const gems = [...document.querySelectorAll('.lgems i')];
  return Promise.all(PRELOAD.map(src => new Promise(res => { const i = new Image(); i.decoding = 'async';
    i.onload = () => { window.__game.loaded[src] = i.naturalWidth > 0; fin(); }; i.onerror = () => { window.__game.loaded[src] = false; fin(); }; i.src = src;
    function fin() { done++; const p = done / PRELOAD.length; $('lbarFill').style.width = (p * 100) + '%'; $('lpct').textContent = `Loading ${Math.round(p * 100)}%`; gems.forEach((g, k) => g.classList.toggle('lit', p >= (k + 1) / 5)); res(); } })));
}
async function intro() {
  const L = $('loader'), v = $('introVideo'); let videoOK = false;
  const loading = preload();
  const toCode = () => { L.classList.add('code'); $('skipIntro').classList.add('hidden'); };
  let tapped = false, enterResolve = null;
  L.addEventListener('click', () => { tapped = true; enterResolve && enterResolve(); });   // any tap skips remaining loader
  $('skipIntro').onclick = e => { e.stopPropagation(); tapped = true; enterResolve && enterResolve(); };
  if (F.introVideo && !RM && !DEMO) {
    v.src = 'assets/load_intro_web.mp4';
    try {
      await Promise.race([v.play(), sleep(1800).then(() => { throw new Error('autoplay timeout'); })]); videoOK = true;
      await new Promise(res => { enterResolve = res; v.onended = res; v.ontimeupdate = () => { if (v.currentTime >= INTRO_VIDEO_CUT) res(); }; v.onerror = res; });
    } catch (e) { videoOK = false; }
    enterResolve = null; v.pause();
  }
  window.__game.introVideo = videoOK; toCode();
  await loading; $('lpct').textContent = 'Ready'; $('enter').classList.remove('hidden');
  if (!tapped && !DEMO) await new Promise(res => { enterResolve = res; $('enter').onclick = e => { e.stopPropagation(); res(); }; });
  enterResolve = null;
  // first tap: unlock audio, swell music, frame slams in, reels drop one by one
  A.init(); A.sfx.swell(); setTimeout(() => A.theme('base'), 300);
  L.classList.add('out'); $('app').classList.remove('pre'); $('app').classList.add('enter'); layout();
  await sleep(RM ? 0 : 250); A.sfx.slam(); FX.flash('#ffd77a', 300, 0.4);
  for (let r = 0; r < 5; r++) { reelEls[r].classList.add('drop'); await sleep(RM ? 0 : 110); setTimeout(() => A.sfx.thud(r), 300); }
  setTimeout(() => { L.remove(); $('app').classList.remove('enter'); reelEls.forEach(r => r.classList.remove('drop')); }, 900);
  pulseGems(); window.__game.introDone = true; preloadBonusVideo();
}
function pulseGems() { const g = $('gems'); g.classList.remove('pulse'); void g.offsetWidth; g.classList.add('pulse'); }

// ---------- wiring ----------
buildReels(); layout(); setBalance(state.balance, false); ui();
if (!F.autoplay) $('autoBtn').classList.add('hidden');
if (!F.turbo) $('turboBtn').classList.add('hidden');
const setToggle = (id, on) => $(id).setAttribute('aria-pressed', on);
setToggle('musicBtn', A.state().musicOn); setToggle('sfxBtn', A.state().sfxOn);
function spinPress() {
  if (!window.__game.introDone || state.inBonus) return;
  if (state.auto) { stopAuto('user'); quickStop(); return; }
  if (busy || state.spinning) { quickStop(); return; }
  doSpin();
}
$('spin').addEventListener('click', spinPress);
$('reels').addEventListener('click', spinPress);
const changeBet = d => { if (state.spinning || state.auto) return; const n = Math.max(0, Math.min(BETS.length - 1, state.betIdx + d)); if (n === state.betIdx) return; state.betIdx = n; save(); ui(); pulseGems(); A.sfx.gem(); };
$('betUp').onclick = () => changeBet(1); $('betDown').onclick = () => changeBet(-1);
$('reset').onclick = () => { if (state.spinning || state.inBonus) return; stopAuto(); setBalance(START, false); state.spins = state.hits = 0; state.history = []; ui(); $('status').textContent = 'Demo credits reset to 1,000.'; A.sfx.click(); };
$('musicBtn').onclick = () => { A.init(); const on = !A.state().musicOn; A.setMusic(on); if (on) A.theme(state.inBonus ? 'bonus' : 'base'); setToggle('musicBtn', on); };
$('sfxBtn').onclick = () => { A.init(); const on = !A.state().sfxOn; A.setSfx(on); setToggle('sfxBtn', on); };
$('turboBtn').onclick = () => { state.turbo = !state.turbo; ui(); A.sfx.click(); };
$('autoBtn').onclick = () => { if (state.auto) return stopAuto('user'); if (!state.spinning && !state.inBonus) autoMenu(); };
$('payBtn').onclick = () => { if (!state.spinning && !state.inBonus) showPaytable(); };
$('histBtn').onclick = () => { if (!state.inBonus) showHistory(); };
addEventListener('keydown', e => { if (e.code === 'Space' && $('overlay').classList.contains('hidden') && window.__game.introDone) { e.preventDefault(); spinPress(); } });
FX.startEmbers();
window.__game.runJackpot = runJackpot; window.__game.doSpin = doSpin; window.__game.quickStop = quickStop; window.__game.busy = () => busy;
intro();
})();
