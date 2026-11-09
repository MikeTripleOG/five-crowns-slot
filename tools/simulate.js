// Monte Carlo simulator. Usage: node tools/simulate.js [spinsPerVariant=50000000] [heroBonusTrials=2000000]
const M = require('../math.js'), C = require('../configs.js'), fs = require('fs');
const N = +process.argv[2] || 50_000_000, HB = +process.argv[3] || 2_000_000, SEED = +process.argv[4] || 0, ONLY = process.argv[5];
const OUTF = __dirname + (SEED ? `/sim-results-seed${SEED}` : '/sim-results') + (ONLY ? '-' + ONLY : '') + '.json';
function xs(seed){ let a=seed>>>0||1,b=0x9E3779B9,c=0x85EBCA6B,d=0xC2B2AE35; return ()=>{ const t=a^(a<<11); a=b;b=c;c=d; d=(d^(d>>>19)^(t^(t>>>8)))>>>0; return d/4294967296; }; }
const heroes = Object.keys(C[96].bonus.heroes);
const out = {};
for (const id of Object.keys(C).sort((a,b)=>b-a).filter(k => !ONLY || k === ONLY)) {
  const cfg = C[id], rng = xs(+id * 7919 + SEED * 1000003);
  let duelRet = 0, fsRet = 0, lsRet = 0, wins = 0, fsCount = 0;
  let ret = 0, sq = 0, hits = 0, bon = 0, baseRet = 0, bonusRet = 0, maxWin = 0, jpRet = 0, jps = 0, since = 0, fillSum = 0; let meter = [false,false,false,false,false]; const tierN = { mini: 0, minor: 0, major: 0, grand: 0 }; const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = M.spin(cfg, rng); let w = r.lineWinX; baseRet += w;
    if (r.bonus) { bon++; const h = heroes[Math.floor(rng()*heroes.length)]; const o = M.playBonus(cfg, h, r.bonus, rng), b = o.pay; w += b; bonusRet += b; if (o.won) { wins++; duelRet += o.total; fsRet += o.fs.payX; fsCount += o.fsN; } else lsRet += o.lastStand; }
    // persistent Crown meter over one continuous 50M-spin session (one bet level)
    since++;
    if (r.crownReels.length) { const c = M.applyCrowns(meter, r.crownReels); meter = c.meter;
      if (c.full) { const j = M.playJackpot(cfg, rng); w += j.x; jpRet += j.x; jps++; tierN[j.tier]++; fillSum += since; since = 0; meter = [false,false,false,false,false]; } }
    if (w > 0) hits++; ret += w; sq += w*w; if (w > maxWin) maxWin = w;
  }
  const rtp = ret/N, sd = Math.sqrt(sq/N - rtp*rtp), ci = 1.96*sd/Math.sqrt(N);
  // per-hero bonus RTP: same trigger draws for each hero (tier mix from exact probabilities)
  const ex = cfg.exact, pT = ex.p3+ex.p4+ex.p5; const perHero = {};
  for (const h of heroes) {
    const hr = xs(+id*31 + h.length*101); let s = 0, s2 = 0;
    for (let i = 0; i < HB; i++) { const u = hr()*pT; const tier = u < ex.p3 ? 3 : u < ex.p3+ex.p4 ? 4 : 5; const v = M.playBonus(cfg, h, tier, hr).pay; s += v; s2 += v*v; }
    const mean = s/HB, hsd = Math.sqrt(s2/HB-mean*mean);
    let exactMean = 0; for (const t of [3,4,5]) { const tab = cfg.bonus.tables[h][t]; const W = tab.reduce((a,e)=>a+e[1],0); const B = cfg.bonus, wp = B.winProb[t]; exactMean += ({3:ex.p3,4:ex.p4,5:ex.p5})[t]/pT * (wp * tab.reduce((a,e)=>a+e[0]*e[1],0)/W * (1 + B.fsMeanSumX) + (1 - wp) * B.lastStandMean); }
    perHero[h] = { simBonusMeanX: mean, exactBonusMeanX: exactMean, bonusSD: hsd, totalRTP_exact: ex.baseRTP + cfg.jackpot.rtp + pT*exactMean, totalRTP_sim: ex.baseRTP + cfg.jackpot.rtp + pT*mean };
  }
  out[id] = { target: cfg.targetRTP, spins: N, rtp, ci95: ci, baseRTP: baseRet/N, bonusRTP: bonusRet/N, duelRTP: duelRet/N, freeSpinsRTP: fsRet/N, lastStandRTP: lsRet/N, duelWinRate: wins/bon, avgFreeSpins: fsCount/wins, seed: SEED, jackpotRTP: jpRet/N, jackpots: jps, avgSpinsToFill: fillSum/jps, tierCounts: tierN, tierFreqOneIn: Object.fromEntries(Object.entries(tierN).map(([k,v])=>[k, v ? N/v : null])), hitFreq: hits/N, bonusRate: bon/N, oneInBonus: N/bon, sdPerSpin: sd, maxWinX: maxWin, exact: ex, perHero, secs: (Date.now()-t0)/1000 };
  console.log(id, JSON.stringify({ rtp: rtp.toFixed(5), ci: ci.toFixed(4), base: (baseRet/N).toFixed(4), bonus: (bonusRet/N).toFixed(4), duel: (duelRet/N).toFixed(4), fs: (fsRet/N).toFixed(4), ls: (lsRet/N).toFixed(4), jp: (jpRet/N).toFixed(4), fill: (fillSum/jps).toFixed(1), tierN, hit: (hits/N).toFixed(4), bonusRate: `1 in ${(N/bon).toFixed(1)}`, sd: sd.toFixed(2), max: maxWin }));
}
fs.writeFileSync(OUTF, JSON.stringify(out, null, 1));
