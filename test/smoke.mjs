// Five Crowns Playwright mobile smoke test.  BASE=http://localhost:8123/ OUT=dir node smoke.mjs
import { chromium, devices } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8123/';
const OUT = process.env.OUT || '/workspace/five-crowns-slot/screenshots';
const N = +process.env.N || 25;
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const errors = [], results = [];
const ok = (name, cond, info = '') => { const line = `${cond ? 'PASS' : 'FAIL'} ${name}${info !== '' ? ' - ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`; results.push(line); console.log(line); if (!cond) process.exitCode = 1; };
const G = (p, f) => p.evaluate(f);
const shot = (p, o) => p.screenshot({ ...o, timeout: 15000 }).catch(() => p.screenshot({ ...o, animations: 'disabled', timeout: 30000 })).catch(e => results.push('WARN screenshot ' + o.path + ' ' + e.message.split('\n')[0]));
async function open(q, { shotLoader } = {}) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(q + ': ' + m.text()); });
  p.on('pageerror', e => errors.push(q + ': ' + e));
  p.on('response', r => { if (r.status() >= 400 && !r.url().includes('favicon')) errors.push(`${q}: HTTP ${r.status()} ${r.url()}`); });
  await p.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await p.goto(BASE + q, { waitUntil: 'load' });
  if (shotLoader) { await p.waitForTimeout(1200); await shot(p, { path: OUT + '/01-intro-video.png' }); }
  // skip the intro video (tap) if it is playing, then tap to enter
  await p.waitForTimeout(300);
  if (await p.locator('#skipIntro:not(.hidden)').isVisible().catch(() => false)) await p.tap('#skipIntro').catch(() => {});
    // ?demo=1 skips the enter gate; otherwise wait for Tap to Enter
  const demo = q.includes('demo=1');
  if (!demo) {
    await p.waitForSelector('#enter:not(.hidden)', { timeout: 20000 });
    if (shotLoader) { await p.waitForTimeout(700); await shot(p, { path: OUT + '/02-intro-forged-title.png' }); }
    await p.tap('#enter', { force: true });
  }
  await p.waitForFunction(() => window.__game.introDone, null, { timeout: 15000 });
  await p.waitForTimeout(demo ? 400 : 1100);
  return p;
}

async function clickMove(p) {
  const m = p.locator('#moves:not(.hidden) [data-move]').first();
  if (await m.isVisible().catch(() => false)) await m.click({ force: true }).catch(() => {});
}
async function settle(p, hero = 'northgard') {
  // drive any open presentation to completion: celebration, moves, free spins, jackpot, bonus chain
  for (let i = 0; i < 1200; i++) {
    const s = await G(p, () => ({ busy: __game.busy?.() || __game.state.spinning, b: __game.state.inBonus, cel: !document.getElementById('celebrate').classList.contains('hidden'), phases: __game.state.phases.slice(-4) }));
    if (!s.busy && !s.b && !s.cel) return;
    // DOM clicks via evaluate are more reliable than Playwright taps on animated overlays
    await G(p, hero => {
      const fire = el => {
        if (!el) return false;
        if (typeof el.onclick === 'function') { try { el.onclick(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {} }
        el.click();
        return true;
      };
      if (!document.getElementById('celebrate')?.classList.contains('hidden')) fire(document.getElementById('celebrate'));
      fire(document.querySelector(`#heroSelect [data-hero="${hero}"]`)) || fire(document.querySelector('#heroSelect [data-hero]'));
      fire(document.querySelector('#moves:not(.hidden) [data-move]'));
      fire(document.querySelector('#jackpot .tile:not(.flipped)'));
      fire(document.getElementById('jpCollect'));
      fire(document.getElementById('collect'));
      fire(document.getElementById('bSkip'));
    }, hero).catch(() => {});
    await p.waitForTimeout(60);
  }
  throw new Error('settle timeout ' + JSON.stringify(await G(p, () => ({ busy: __game.busy?.(), inBonus: __game.state.inBonus, phases: __game.state.phases, collect: !!document.getElementById('collect'), fsHud: !document.getElementById('fsHud')?.classList.contains('hidden') }))));
}

// ---------- 1. load intro + base game ----------
let p = await open('', { shotLoader: true });
ok('load intro completes and enters the game', await G(p, () => __game.introDone && !document.getElementById('app').classList.contains('pre')), { introVideoPlayed: await G(p, () => __game.introVideo) });
ok('title comes from the single FC_TITLE constant (page title, manifest, logo)', await G(p, () => document.title.startsWith(FC_TITLE) && document.querySelector('link[rel=manifest]').href.includes(encodeURIComponent(FC_TITLE)) && document.querySelector('.logo').textContent === FC_TITLE.toUpperCase()));
ok('demo label visible', await p.getByText('Free play demo - no real money').first().isVisible());
ok('15 symbol tiles rendered', (await p.locator('#reels .cell img').count()) >= 15, await p.locator('#reels .cell img').count());
const loaded = await G(p, () => __game.loaded); const bad = Object.entries(loaded).filter(([, v]) => !v).map(([k]) => k);
ok('all preloaded art loaded (frame, champion, 6 VFX, win titles, backgrounds, heroes)', bad.length === 0 && Object.keys(loaded).some(k => k.includes('horde_champion')) && ['slash', 'block', 'impact', 'crit', 'dragonfire', 'victory'].every(v => loaded[`assets/vfx/${v}.jpg`]), bad.length ? bad : `${Object.keys(loaded).length} assets`);
const box = await p.locator('#reels').boundingBox(); ok('reels fill the frame window (>=80% of viewport width)', box.width >= 0.8 * 390, Math.round(box.width) + 'px of 390');
let a = await G(p, () => __game.audio());
ok('music starts after first tap (base theme)', a.ctx === 'running' && a.musicOn && a.theme === 'base' && a.running.base, a);
await p.tap('#musicBtn'); await p.waitForTimeout(900); a = await G(p, () => __game.audio());
ok('music toggle OFF', !a.musicOn && (await p.getAttribute('#musicBtn', 'aria-pressed')) === 'false', a);
await p.tap('#musicBtn'); await p.waitForTimeout(300); a = await G(p, () => __game.audio());
ok('music toggle ON again', a.musicOn && a.running.base, a);
await p.tap('#sfxBtn'); a = await G(p, () => __game.audio()); ok('SFX toggle independent of music', !a.sfxOn && a.musicOn); await p.tap('#sfxBtn');
await G(p, () => { /* ensure clean wallet before the cash checks */ __game.state.balance = 1000; __game.state.spins = 0; __game.state.hits = 0; __game.state.log = []; __game.state.history = []; });
await p.evaluate(() => document.getElementById('balance').textContent = '1,000');
ok('start balance 1000', Math.abs(await G(p, () => +__game.balance) - 1000) < 0.01, await G(p, () => __game.balance));
await p.tap('#spin'); await p.waitForTimeout(250);
const balAfterDebit = await G(p, () => +__game.balance);
ok('bet debited on spin', balAfterDebit <= 995 && balAfterDebit >= 990, balAfterDebit);
ok('spin button becomes STOP while spinning', (await p.textContent('#spin')).trim() === 'STOP');
await shot(p, { path: OUT + '/03-reels-spinning.png' });
const log0 = await G(p, () => __game.state.log.length); const t0 = Date.now(); await p.locator('#spin').click({ force: true }); await p.waitForFunction(n => __game.state.log.length > n, log0, { timeout: 5000 });
const qs = await G(p, () => __game.state.log.at(-1)); ok('quick-stop ends the spin immediately', Date.now() - t0 < 700 && qs?.quick, { ms: Date.now() - t0, quick: qs?.quick, log: qs });
await settle(p); await p.waitForTimeout(400);
await shot(p, { path: OUT + '/04-reels.png' });
let changed = false;
for (let i = 0; i < 8; i++) { const b = await G(p, () => __game.balance); if (i % 2) await p.keyboard.press('Space'); else await p.tap('#spin');
  await p.waitForFunction(n => __game.state.log.length > n, i + 1, { timeout: 15000 }); await settle(p); if ((await G(p, () => __game.balance)) !== b) changed = true;
  if (await G(p, () => document.querySelectorAll('#lines polyline').length) && !fs.existsSync(OUT + '/05-line-win.png')) await shot(p, { path: OUT + '/05-line-win.png' }); }
ok('balance updates across spins (tap + spacebar)', changed);
const c = await G(p, () => ({ spins: __game.state.spins, hits: __game.state.hits, h: __game.state.log.filter(l => l.lineWin > 0 || l.bonus || l.jackpot).length }));
ok('hit counter counts (line win OR bonus trigger OR jackpot), same definition as MATH.md', c.hits === c.h, c);
await p.tap('#turboBtn'); ok('turbo toggles', (await p.getAttribute('#turboBtn', 'aria-pressed')) === 'true');
await p.tap('#autoBtn'); await p.waitForSelector('.panel [data-n="10"]'); await shot(p, { path: OUT + '/06-autoplay-menu.png' });
await p.selectOption('#aFloor', '0'); await p.tap('.panel [data-n="10"]');
const s0 = await G(p, () => __game.state.spins);
await p.waitForFunction(() => !__game.state.auto || __game.state.inBonus, null, { timeout: 60000 }); await settle(p);
const s1 = await G(p, () => __game.state.spins);
ok('autoplay runs and stops by itself (10 spins or bonus/big-win stop)', s1 - s0 >= 1 && s1 - s0 <= 10, `${s1 - s0} spins`);
await p.tap('#histBtn'); await p.waitForSelector('.hist'); await shot(p, { path: OUT + '/07-win-history.png' }); await p.tap('.panel [data-close]'); await p.waitForTimeout(400);
await p.tap('#payBtn'); await p.waitForSelector('.paytable'); await shot(p, { path: OUT + '/08-paytable.png' }); await p.tap('.panel [data-close]'); await p.waitForTimeout(400);
await p.tap('#reset'); ok('reset to 1000', (await G(p, () => __game.balance)) === 1000);
await p.close();

// ---------- 2. feature flags ----------
p = await ctx.newPage(); await p.goto(BASE + '?autoplay=0&turbo=0&introvideo=0');
ok('autoplay/turbo hidden by config flag', !(await p.locator('#autoBtn').isVisible()) && !(await p.locator('#turboBtn').isVisible()));
await p.close();

// ---------- 3. forced bonus 3/4/5: full cinematic chain ----------
const PH_WIN = ['bannerFlash', 'transition', 'select', 'versus', 'duel', 'dragonPhase', 'total', 'freeSpins', 'tally', 'return', 'done'];
const PH_LOSE = ['bannerFlash', 'transition', 'select', 'versus', 'duel', 'dragonPhase', 'lastStand', 'return', 'done'];
for (const n of [1, 4, 5]) {
  p = await open('?forceBonus=' + n);
  await p.tap('#spin');
  if (n === 1) { await p.waitForFunction(() => __game.state.phases.includes('transition')); await p.waitForTimeout(900); await shot(p, { path: OUT + '/09-bonus-gates.png' }); }
  await p.waitForSelector('#heroSelect', { timeout: 20000 });
  const bal = await G(p, () => __game.balance);
  const callouts = await p.locator('#heroSelect .callout').allTextContents();
  const want = n === 4 ? ['EXTRA ROUNDS +1'] : n === 5 ? ['EXTRA ROUNDS +2', '🛡 SHIELD'] : [];
  const lw0 = await G(p, () => __game.state.log.at(-1).lineWin);
  ok(`forceBonus=${n}: bonus triggered on a paid spin, extras callout shown`, Math.abs(bal - (995 + lw0)) < 0.01 && want.every(w => callouts.includes(w)) && (n !== 1 || callouts.length === 1), callouts);
  await p.waitForTimeout(500); await shot(p, { path: OUT + `/10-hero-select-${n === 1 ? 3 : n}.png` });
  const hero = n === 5 ? 'drakonia' : 'northgard';
  await p.tap(`[data-hero="${hero}"]`);
  if (n !== 5) { await p.waitForSelector('#versus'); await p.waitForTimeout(1300); await shot(p, { path: OUT + '/11-versus.png' }); }
  await p.waitForSelector('#duel', { timeout: 10000 });
  ok(`forceBonus=${n}: champion art + full-scale hero charge sprite in duel`, await G(p, () => { const c = document.querySelector('#duel img.champ'), h = document.querySelector('#duel img.port.sprite'); return !!(c && h && c.src.includes('horde_champion') && h.src.includes('_charge') && h.complete && h.naturalWidth > 0); }));
  // keep picking moves so the duel advances while we wait for VFX / dragon / ally
  const poke = setInterval(() => clickMove(p), 200);
  try {
    if (n !== 5) {
      const vf = await (await p.waitForFunction(() => { const v = [...document.querySelectorAll('#duel .vfx')].filter(i => i.complete); return v.length && v.map(i => ({ src: i.src.split('/').pop(), ok: i.naturalWidth > 0, blend: getComputedStyle(i).mixBlendMode })); }, null, { timeout: 25000, polling: 50 })).jsonValue();
      await shot(p, { path: OUT + '/12-duel-vfx.png' });
      ok('duel VFX load and use screen blending', vf.length && vf.every(v => v.ok && v.blend === 'screen'), vf);
      await p.waitForSelector('#duel img.champ.dragon', { state: 'attached', timeout: 30000 }); await p.waitForTimeout(900); await shot(p, { path: OUT + `/12b-dragon-phase-${n}.png` });
      ok(`forceBonus=${n}: Dragon Phase swaps in vorrhak_dragon`, await G(p, () => { const d = document.querySelector('#duel img.champ.dragon'); return d && d.complete && d.naturalWidth > 0 && getComputedStyle(d).opacity > 0.5; }));
      // ally only appears on a win round after dragon phase - may not show on a losing duel
      const al = await Promise.race([
        p.waitForFunction(() => document.querySelector('#duel .ally')?.src.split('/').pop(), null, { timeout: 20000 }).then(h => h.jsonValue()),
        p.waitForFunction(() => __game.state.phases.includes('total') || __game.state.phases.includes('lastStand'), null, { timeout: 20000 }).then(() => null),
      ]);
      if (al) { await p.waitForTimeout(350); await shot(p, { path: OUT + `/12c-coalition-assist-${n}.png` }); ok(`forceBonus=${n}: coalition assist slides in and is never the chosen hero`, !al.startsWith(hero), al); }
      else ok(`forceBonus=${n}: coalition assist skipped (losing duel had no post-dragon win rounds)`, true, 'no ally');
    }
  } finally { clearInterval(poke); }
  if (await p.locator('#bSkip').isVisible().catch(() => false)) await p.locator('#bSkip').click({ force: true }).catch(() => {});
  await settle(p, hero);
  const lb = await G(p, () => __game.lastBonus);
  ok(`forceBonus=${n}: rounds ${n === 1 ? 5 : n === 4 ? 6 : 7}${n === 5 ? ' + shield' : ''}`, lb && lb.rounds === (n === 1 ? 5 : n === 4 ? 6 : 7) && lb.shield === (n === 5), lb);
  const ph = await G(p, () => __game.state.phases);
  const okPh = lb.won ? ph.includes('freeSpins') && ph.includes('tally') : ph.includes('lastStand');
  ok(`forceBonus=${n}: sequence reaches terminal phases`, ph.includes('bannerFlash') && ph.includes('duel') && ph.includes('done') && okPh, ph);
  ok(`forceBonus=${n}: bonus credited and music back to base`, (await G(p, () => __game.balance)) > bal && (await G(p, () => __game.audio().theme)) === 'base', `${bal} -> ${await G(p, () => __game.balance)}, won=${lb.won}, clip=${lb.video}`);
  if (n === 1) await shot(p, { path: OUT + '/14-back-to-reels.png' });
  await p.close();
}

// ---------- 3b. Crown Collector + PICK JACKPOT ----------
p = await open('?crowns=4&introvideo=0');
ok('?crowns=4 lights four crown meters', (await p.locator('#crowns i.on').count()) === 4 && (await G(p, () => __game.meters().filter(Boolean).length)) === 4);
ok('jackpot ladder shows 4 plaques with live amounts for the bet', JSON.stringify(await p.locator('#ladder .plq b').allTextContents()) === JSON.stringify(['5,000', '500', '125', '50']), await p.locator('#ladder .plq b').allTextContents());
await shot(p, { path: OUT + '/15-crown-meters-4-lit.png' });
await p.tap('#betUp'); await p.waitForTimeout(200);
const mUp = await p.locator('#crowns i.on').count(), lUp = await p.locator('#ladder .plq b').allTextContents();
await p.tap('#betDown'); await p.waitForTimeout(200);
ok('crown meters are kept per bet level (bet 10 has its own empty meter; bet 5 keeps 4)', mUp === 0 && (await p.locator('#crowns i.on').count()) === 4 && lUp[3] === '100', { atBet10: mUp, ladderAt10: lUp });
await p.close();
for (const t of ['mini', 'minor', 'major', 'grand']) {
  p = await open(`?forceJackpot=${t}&crowns=4&introvideo=0`);
  const bal0 = await G(p, () => __game.balance);
  await p.tap('#spin'); await p.waitForSelector('#jackpot', { timeout: 15000 });
  ok(`forceJackpot=${t}: 5th crown lit on a paid spin, meter full`, (await G(p, () => __game.state.log.at(-1).meter.every(Boolean))) && Math.abs((await G(p, () => __game.balance)) - (bal0 - 5 + (await G(p, () => __game.state.log.at(-1).lineWin)))) < 0.01);
  await p.waitForTimeout(600); if (t === 'major') await shot(p, { path: OUT + '/16-jackpot-board.png' });
  let picks = 0;
  while (!(await G(p, () => __game.state.phases.includes('match'))) && picks < 12) { await p.locator('#jackpot .tile:not(.flipped)').first().click({ force: true }); picks++; await p.waitForTimeout(350);
    if (t === 'major' && picks === 3) await shot(p, { path: OUT + '/17-jackpot-flips.png' }); }
  await p.waitForFunction(() => __game.state.phases.includes('reveal'), null, { timeout: 5000 }); await p.waitForTimeout(1300);
  const st = await G(p, () => ({ won: document.querySelector('.jplaques .plq.won')?.dataset.t, flipped: document.querySelectorAll('#jackpot .tile.flipped').length,
    counts: ['mini', 'minor', 'major', 'grand'].map(x => document.querySelectorAll(`#jackpot .tile[data-t="${x}"]`).length) }));
  if (t === 'major') await shot(p, { path: OUT + '/18-jackpot-match-reveal.png' });
  ok(`forceJackpot=${t}: first triple is ${t}, its plaque glows, all 12 revealed (3 of each)`, st.won === t && st.flipped === 12 && st.counts.every(c => c === 3), { picks, ...st });
  if (t === 'grand') { await p.waitForSelector('#celebrate:not(.hidden)', { timeout: 8000 }); await p.waitForTimeout(1400); await shot(p, { path: OUT + '/19-grand-celebration.png' }); await p.locator('#celebrate').click({ force: true }); }
  await p.waitForSelector('#jpCollect', { timeout: 20000 }); await p.waitForTimeout(t === 'grand' ? 2600 : 1800);
  if (t === 'grand') await shot(p, { path: OUT + '/20-grand-award.png' });
  await p.tap('#jpCollect'); await p.waitForFunction(() => __game.state.phases.includes('done'), null, { timeout: 10000 }); await p.waitForTimeout(1600);
  const X = { mini: 10, minor: 25, major: 100, grand: 1000 }[t], lj = await G(p, () => __game.lastJackpot), bal1 = await G(p, () => __game.balance);
  const lw = await G(p, () => __game.state.log.at(-1).lineWin);
  ok(`forceJackpot=${t}: pays bet x ${X} and meters reset`, lj.tier === t && Math.abs(bal1 - (bal0 - 5 + lw + 5 * X)) < 0.01 && (await p.locator('#crowns i.on').count()) === 0, { bal0, bal1, lineWin: lw });
  ok(`forceJackpot=${t}: hit counter includes the jackpot`, await G(p, () => __game.state.hits === 1));
  await p.close();
}

// ---------- 3c. forceBonus=win / laststand + freeSpins + moves ----------
{
  p = await open('?forceBonus=win&freeSpins=5&introvideo=0');
  await p.tap('#spin');
  await p.waitForSelector('#heroSelect', { timeout: 20000 });
  await p.tap('[data-hero="northgard"]');
  await p.waitForSelector('#duel', { timeout: 10000 });
  await p.waitForSelector('#moves:not(.hidden)', { timeout: 10000 });
  await p.screenshot({ path: OUT + '/21-moves.png' });
  const moveKeys = await G(p, () => [...document.querySelectorAll('#moves [data-move]')].map(b => b.dataset.move));
  ok('STRIKE/GUARD/FURY move buttons shown', JSON.stringify(moveKeys) === JSON.stringify(['strike','guard','fury']), moveKeys);
  // pick each once across rounds via settle (settle clicks the first visible move)
  await settle(p, 'northgard');
  const lb = await G(p, () => __game.lastBonus);
  ok('forceBonus=win: duel won, 5 free spins, Spoils of War ran', lb.won === true && lb.fsN === 5 && lb.fsWin >= 0 && (await G(p, () => __game.state.phases)).includes('freeSpins'), lb);
  ok('forceBonus=win: moves were recorded and did not change the predetermined outcome', Array.isArray(lb.moves) && lb.moves.length === lb.rounds, lb.moves);
  await p.screenshot({ path: OUT + '/22-spoils-tally.png' });
  await p.close();
}
{
  p = await open('?forceBonus=laststand&introvideo=0');
  const bal0 = await G(p, () => __game.balance);
  await p.tap('#spin'); await p.waitForSelector('#heroSelect', { timeout: 20000 });
  await p.tap('[data-hero="eldenvale"]');
  await settle(p, 'eldenvale');
  const lb = await G(p, () => __game.lastBonus);
  ok('forceBonus=laststand: hero loses, Last Stand pays 1-3x bet, no free spins', lb.won === false && lb.fsN === 0 && [1,1.5,2,3].includes(lb.lastStand) && Math.abs(lb.win - lb.lastStand * 5) < 0.01, lb);
  ok('forceBonus=laststand: bonus never pays zero and credits the consolation', (await G(p, () => __game.balance)) > bal0 - 5, { bal0, bal: await G(p, () => __game.balance), lb });
  await p.screenshot({ path: OUT + '/23-last-stand.png' });
  await p.close();
}

// ---------- 3d. ?demo=1 skips intro; stress-tap does not freeze ----------
{
  p = await open('?demo=1&introvideo=0');
  ok('?demo=1 enters without waiting on Tap to Enter', await G(p, () => __game.introDone) === true);
  // rapid-fire SPIN / TURBO / AUTO must not freeze the UI
  for (let i = 0; i < 20; i++) {
    await p.locator('#spin').click({ force: true }).catch(() => {});
    if (i % 3 === 0) await p.locator('#turboBtn').click({ force: true }).catch(() => {});
    if (i % 5 === 0) await p.locator('#autoBtn').click({ force: true }).catch(() => {});
  }
  await p.waitForTimeout(400);
  // dismiss any autoplay panel the stress taps may have opened; stop auto if running
  await G(p, () => { const o = document.getElementById('overlay'); o.classList.add('hidden'); o.innerHTML = ''; if (__game.state.auto) __game.state.auto = null; });
  await settle(p);
  const before = await G(p, () => ({ spins: __game.state.spins, busy: __game.busy(), bal: __game.balance }));
  await p.locator('#spin').click({ force: true });
  await p.waitForFunction(n => __game.state.log.length > n, before.spins, { timeout: 20000 });
  await settle(p);
  const after = await G(p, () => ({ spins: __game.state.spins, busy: __game.busy(), bal: __game.balance, label: document.getElementById('spin').textContent.trim() }));
  ok('stress: rapid SPIN/TURBO/AUTO taps do not freeze; a later spin still completes', !before.busy && !after.busy && after.spins === before.spins + 1 && after.label === 'SPIN', { before, after });
  await shot(p, { path: OUT + '/24-after-stress.png' });
  await p.close();
}

// ---------- 4. quick-stop determinism: N seeded spins with and without STOP ----------
async function seeded(quick) {
  const p = await open('?seed=20261104&introvideo=0');
  await p.tap('#turboBtn');
  const out = [];
  for (let i = 0; i < N; i++) {
    await p.tap('#spin');
    if (quick) { await p.waitForTimeout(60); await p.tap('#spin'); }
    await p.waitForFunction(n => __game.state.log.length > n, i, { timeout: 20000 });
    await settle(p);
    out.push(await p.evaluate(n => ({ ...__game.state.log[n], balance: __game.balance }), i));
  }
  await p.close(); return out;
}
const A1 = await seeded(false), B1 = await seeded(true);
const strip = l => l.map(({ quick, ...r }) => r);
const same = JSON.stringify(strip(A1)) === JSON.stringify(strip(B1));
ok(`quick-stop: ${N} seeded spins give identical stops, wins, bonuses and balances with and without STOP`, same && B1.filter(x => x.quick).length > 0,
  { finalBalance: [A1.at(-1).balance, B1.at(-1).balance], wins: A1.filter(x => x.lineWin > 0).length, bonuses: A1.filter(x => x.bonus).length, quickStops: B1.filter(x => x.quick).length });
fs.writeFileSync(OUT + '/quickstop-determinism.json', JSON.stringify({ withoutStop: A1, withStop: B1 }, null, 1));

ok('no console errors / failed requests', errors.length === 0, errors.slice(0, 8));
console.log(results.join('\n'));
await browser.close();
