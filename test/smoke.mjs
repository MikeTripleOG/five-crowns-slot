// Playwright mobile smoke test. BASE=http://localhost:8123/ node smoke.mjs
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8123/';
const OUT = process.env.OUT || '/workspace/five-crowns-slot/screenshots';
import fs from 'fs'; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined });
const errors = [];
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`); if (!cond) process.exitCode = 1; };
async function open(q) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push(String(e)));
  p.on('requestfailed', r => errors.push('requestfailed ' + r.url()));
  p.on('response', r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.goto(BASE + q, { waitUntil: 'networkidle' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'networkidle' });
  return p;
}
let p = await open('');
ok('demo label visible', await p.getByText('Free play demo - no real money').isVisible());
ok('15 symbol tiles rendered', (await p.locator('#reels .cell img').count()) === 15);
const allLoaded = await p.evaluate(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
ok('all images loaded', allLoaded);
const b0 = await p.evaluate(() => __game.balance);
ok('start balance 1000', b0 === 1000, b0);
await p.tap('#spin');
await p.waitForTimeout(300);
const bMid = await p.evaluate(() => __game.balance);
ok('bet debited on spin', bMid === 995, bMid);
await p.waitForFunction(() => !__game.state.spinning || __game.state.inBonus, null, { timeout: 15000 });
await p.screenshot({ path: OUT + '/reels-mobile.png' });
// several spins via tap and spacebar
let changed = false;
for (let i = 0; i < 6; i++) {
  if (await p.evaluate(() => __game.state.inBonus)) break;
  const before = await p.evaluate(() => __game.balance);
  if (i % 2) await p.keyboard.press('Space'); else await p.tap('#spin');
  await p.waitForFunction(() => !__game.state.spinning || __game.state.inBonus, null, { timeout: 15000 });
  const after = await p.evaluate(() => __game.balance); if (after !== before) changed = true;
}
ok('balance updates across spins (tap + space)', changed);
const hasWinLines = await p.evaluate(() => document.querySelectorAll('#lines polyline').length);
results.push(`INFO paylines currently drawn: ${hasWinLines}`);
await p.tap('#mute'); ok('mute toggles', (await p.textContent('#mute')).includes('🔇'));
await p.close();

// forced bonus
p = await open('?forceBonus=1');
await p.tap('#spin');
await p.waitForSelector('#heroSelect', { timeout: 20000 });
ok('bonus triggered via ?forceBonus=1 (paid spin)', true, 'balance after debit ' + await p.evaluate(() => __game.balance));
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '/bonus-hero-select.png' });
await p.tap('[data-hero="northgard"]');
await p.waitForSelector('#duel');
await p.waitForTimeout(3600);
const mid = await p.evaluate(() => ({ m: document.getElementById('mult').textContent, morale: document.getElementById('morale').style.width, horde: document.getElementById('hordeHP').style.width, rounds: document.getElementById('rounds').textContent }));
results.push('INFO duel mid-state ' + JSON.stringify(mid));
ok('duel bars move', mid.horde !== '100%' || mid.morale !== '40%');
await p.screenshot({ path: OUT + '/bonus-duel.png' });
await p.waitForSelector('#collect', { timeout: 30000 });
await p.screenshot({ path: OUT + '/bonus-victory.png' });
const before = await p.evaluate(() => __game.balance);
await p.tap('#collect');
await p.waitForTimeout(300);
const after = await p.evaluate(() => __game.balance);
ok('bonus win credited', after > before, `${before} -> ${after}`);
await p.tap('#reset'); ok('reset to 1000', (await p.evaluate(() => __game.balance)) === 1000);
await p.close();
ok('no console errors', errors.length === 0, errors.join(' | '));
console.log(results.join('\n'));
await browser.close();
