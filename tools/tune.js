// Builds configs.js: reel strips + paytable + bonus outcome tables, calibrated EXACTLY (full enumeration) per RTP variant.
const fs = require('fs'), path = require('path');
const M = require('../math.js');
// reel symbol counts (strip length 32). Banners spaced so max one visible per reel.
const COUNTS = [
  { D:1, V:1, S:2, N:2, E:2, W:0, B:2, C:1, sw:5, sp:5, bo:4, sh:4, ho:4 },
  { D:1, V:1, S:1, N:2, E:2, W:3, B:1, C:1, sw:5, sp:4, bo:5, sh:4, ho:4 },
  { D:1, V:1, S:2, N:1, E:2, W:3, B:2, C:1, sw:4, sp:5, bo:4, sh:5, ho:4 },
  { D:1, V:2, S:1, N:2, E:1, W:3, B:1, C:1, sw:4, sp:4, bo:5, sh:4, ho:5 },
  { D:1, V:1, S:2, N:2, E:2, W:1, B:2, C:1, sw:5, sp:4, bo:4, sh:4, ho:5 },
];
const RAW_PAY = { W:[50,200,1000], D:[40,150,600], V:[30,100,400], S:[25,80,300], N:[20,60,250], E:[15,50,200],
  sw:[5,15,60], sp:[5,15,60], bo:[4,12,50], sh:[4,12,50], ho:[4,12,50] };
const BASE_TARGET = 0.66;
function seeded(seed){ let s=seed>>>0; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
function buildStrip(counts, seed) {
  const rng = seeded(seed);
  for (let attempt = 0; attempt < 100000; attempt++) {
    const a = []; for (const k in counts) for (let i = 0; i < counts[k]; i++) a.push(k);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const L = a.length; let ok = true;
    for (let i = 0; i < L && ok; i++) if (a[i] === 'B') for (let d = 1; d <= 2; d++) if (a[(i + d) % L] === 'B') ok = false;
    if (ok) return a;
  }
  throw new Error('strip');
}
const strips = COUNTS.map((c, i) => buildStrip(c, 1234 + i * 77));
// Weighted (virtual) reel stops: the 3 stops showing the Crown weigh 1, every other stop weighs CROWN_W.
const CROWN_W = 40;
const weights = strips.map(s => s.map((_, st) => [0,1,2].some(d => s[(st + d) % s.length] === 'C') ? 1 : CROWN_W));
const weightTotals = weights.map(w => w.reduce((a, b) => a + b, 0));
const q = weights.map((w, r) => 3 / weightTotals[r]);   // P(crown visible on reel r) per spin
// Jackpot: fixed bet multiples + tier weights. Award is drawn when the jackpot starts.
const JP = { mini: { x: 10, w: 70 }, minor: { x: 25, w: 22 }, major: { x: 100, w: 7 }, grand: { x: 1000, w: 1 } };
const jpMeanX = Object.values(JP).reduce((a, t) => a + t.x * t.w, 0) / Object.values(JP).reduce((a, t) => a + t.w, 0);
// E[spins to light all 5] from an empty meter = E[max of 5 independent geometrics] (inclusion-exclusion, exact)
let fillSpins = 0;
for (let mask = 1; mask < 32; mask++) { let pNone = 1, bits = 0; for (let r = 0; r < 5; r++) if (mask >> r & 1) { pNone *= 1 - q[r]; bits++; } fillSpins += (bits % 2 ? 1 : -1) / (1 - pNone); }
const jpRTP = jpMeanX / fillSpins;   // renewal-reward: long-run jackpot return per unit bet
console.log('crown q', q.map(x => x.toFixed(5)), 'fill', fillSpins.toFixed(1), 'jp mean x', jpMeanX, 'jp RTP', jpRTP.toFixed(5));
function exact(paytable) {
  const cfg = { strips, paytable };
  const W = weights;
  const L = strips.map(s => s.length);
  let total = 0, hits = 0, n = 0, wt = 0; const bc = [0,0,0,0,0,0];
  const g = [[],[],[],[],[]];
  for (let a=0;a<L[0];a++){ const wa=W[0][a]; g[0]=[0,1,2].map(d=>strips[0][(a+d)%L[0]]);
  for (let b=0;b<L[1];b++){ const wb=wa*W[1][b]; g[1]=[0,1,2].map(d=>strips[1][(b+d)%L[1]]);
  for (let c=0;c<L[2];c++){ const wc=wb*W[2][c]; g[2]=[0,1,2].map(d=>strips[2][(c+d)%L[2]]);
  for (let d=0;d<L[3];d++){ const wd=wc*W[3][d]; g[3]=[0,1,2].map(x=>strips[3][(d+x)%L[3]]);
  for (let e=0;e<L[4];e++){ g[4]=[0,1,2].map(x=>strips[4][(e+x)%L[4]]);
    const we=wd*W[4][e]; const r = M.evaluate(cfg, g, null); n++; wt += we; total += we*r.lineWinX; if (r.lineWinX>0) hits += we; bc[Math.min(r.banners,5)] += we;
  }}}}}
  return { base: total/wt, lineHit: hits/wt, p3: bc[3]/wt, p4: bc[4]/wt, p5: bc[5]/wt, n };
}
// raw base RTP, then scale paytable
let r0 = exact(RAW_PAY);
const scale = BASE_TARGET / r0.base;
const paytable = {}; for (const k in RAW_PAY) paytable[k] = RAW_PAY[k].map(v => Math.max(1, Math.round(v * scale)));
const ex = exact(paytable);
console.log('exact', ex, 'scale', scale.toFixed(3), paytable);
// hero shapes: relative multiplier distributions (volatility flavour). Normalised to mean 1 exactly below.
const HEROES = {
  eldenvale: { name: 'Eldenvale Ranger', vol: 'medium', shape: [[0.4,30],[0.7,30],[1,20],[1.6,12],[3,6],[6,2]] },
  northgard: { name: 'Northgard Shieldbearer', vol: 'low', shape: [[0.6,30],[0.85,30],[1.1,25],[1.5,12],[2.2,3]] },
  solenthia: { name: 'Solenthia Sun-Spear', vol: 'medium', shape: [[0.3,25],[0.6,30],[1,25],[1.8,13],[3.5,6],[5,1]] },
  vellorien: { name: 'Vellorien Knight', vol: 'medium-high', shape: [[0.25,30],[0.5,30],[1,18],[2,13],[4,7],[8,2]] },
  drakonia: { name: 'Drakonia Reaver', vol: 'high', shape: [[0.2,40],[0.4,25],[0.8,15],[1.5,10],[4,7],[10,2.5],[25,0.5]] },
};
const TIER_FACTOR = { 3: 1, 4: 1.6, 5: 3 };
const TIERS = { 3: { rounds: 5, shield: false }, 4: { rounds: 6, shield: false }, 5: { rounds: 7, shield: true } };
function buildTables(M3) {
  const tables = {};
  for (const h in HEROES) {
    tables[h] = {};
    const sh = HEROES[h].shape; const W = sh.reduce((a,e)=>a+e[1],0); const mean = sh.reduce((a,e)=>a+e[0]*e[1],0)/W;
    for (const t of [3,4,5]) {
      const target = M3 * TIER_FACTOR[t];
      // values to 0.1, weights integer (x10). Fix exact mean by adjusting the weights of the two nearest-to-target entries.
      let tab = sh.map(e => [Math.max(1, Math.round(e[0] / mean * target * 10)) / 10, Math.round(e[1] * 1000)]);
      // exact correction: shift weight between an entry below and above target so sum(v*w)=target*sum(w)
      let sw = tab.reduce((a,e)=>a+e[1],0), sv = tab.reduce((a,e)=>a+e[0]*e[1],0);
      let err = sv - target * sw; // want 0
      const lo = tab.findIndex(e => e[0] < target), hi = tab.findIndex(e => e[0] > target);
      // move dw weight from hi to lo (or reverse): changes err by dw*(v_lo - v_hi)
      const dw = err / (tab[hi][0] - tab[lo][0]);
      tab[lo][1] += dw; tab[hi][1] -= dw;
      tables[h][t] = tab.map(e => [e[0], +e[1].toFixed(6)]);
    }
  }
  return tables;
}
const configs = {};
for (const target of [0.96, 0.94, 0.92]) {
  const per = ex.p3 * TIER_FACTOR[3] + ex.p4 * TIER_FACTOR[4] + ex.p5 * TIER_FACTOR[5];
  const M3 = (target - ex.base - jpRTP) / per;   // the jackpot carries its exact share; the duel bonus fills the rest
  configs[Math.round(target*100)] = { id: Math.round(target*100), targetRTP: target, strips, weights, weightTotals, paytable,
    jackpot: { tiers: JP, crownProb: q, meanX: jpMeanX, fillSpins, rtp: jpRTP },
    bonus: { heroes: Object.fromEntries(Object.entries(HEROES).map(([k,v])=>[k,{name:v.name,vol:v.vol}])), tiers: TIERS, tierFactor: TIER_FACTOR, meanMult3: M3, tables: buildTables(M3) },
    exact: { baseRTP: ex.base, lineHitRate: ex.lineHit, p3: ex.p3, p4: ex.p4, p5: ex.p5, combos: ex.n } };
  console.log(target, 'bonus mean x', M3.toFixed(3));
}
fs.writeFileSync(path.join(__dirname, '..', 'configs.js'),
  '// GENERATED by tools/tune.js - do not edit by hand\n(function(root){const C=' + JSON.stringify(configs) + ';if(typeof module!=="undefined"&&module.exports)module.exports=C;else root.SlotConfigs=C;})(typeof window!=="undefined"?window:globalThis);\n');
