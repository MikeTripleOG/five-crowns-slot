// Five Crowns - data-driven math engine (shared by browser + node). UNCERTIFIED prototype.
(function (root) {
  const SYMBOLS = {
    D: { file: 'crest_drakonia.png', name: 'Drakonia', kind: 'high' },
    V: { file: 'crest_vellorien.png', name: 'Vellorien', kind: 'high' },
    S: { file: 'crest_solenthia.png', name: 'Solenthia', kind: 'high' },
    N: { file: 'crest_northgard.png', name: 'Northgard', kind: 'high' },
    E: { file: 'crest_eldenvale.png', name: 'Eldenvale', kind: 'high' },
    W: { file: 'wild_dragon.png', name: 'Crimson Horde Wild', kind: 'wild' },
    B: { file: 'bonus_banner.png', name: 'War Banner', kind: 'scatter' },
    sw: { file: 'sword.png', name: 'Sword', kind: 'low' },
    sp: { file: 'spear.png', name: 'Spear', kind: 'low' },
    bo: { file: 'bow.png', name: 'Bow', kind: 'low' },
    sh: { file: 'shield.png', name: 'Shield', kind: 'low' },
    ho: { file: 'horn.png', name: 'Horn', kind: 'low' },
    C: { file: 'crown.png', name: 'Crown (collect)', kind: 'collect' },
  };
  const JP_TIERS = ['mini', 'minor', 'major', 'grand'];
  // rows 0..2 top..bottom; one entry per reel
  const PAYLINES = [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2]];
  const ROWS = 3, REELS = 5;

  function evalLine(syms, paytable) {
    // returns {sym, count, pay} in line-bet multiples
    let target = null;
    for (const s of syms) { if (s !== 'W') { target = s; break; } }
    let wildRun = 0; while (wildRun < 5 && syms[wildRun] === 'W') wildRun++;
    let best = { sym: null, count: 0, pay: 0 };
    if (wildRun >= 3 && paytable.W) { const p = paytable.W[wildRun - 3]; if (p > best.pay) best = { sym: 'W', count: wildRun, pay: p }; }
    if (target && target !== 'B' && target !== 'C' && paytable[target]) {
      let c = 0; while (c < 5 && (syms[c] === target || syms[c] === 'W')) c++;
      if (c >= 3) { const p = paytable[target][c - 3]; if (p > best.pay) best = { sym: target, count: c, pay: p }; }
    }
    return best;
  }

  function spin(cfg, rng) {
    const stops = [], grid = [];
    for (let r = 0; r < REELS; r++) {
      const strip = cfg.strips[r], L = strip.length; let st;
      if (cfg.weights) { const w = cfg.weights[r]; let x = rng() * cfg.weightTotals[r]; st = 0; while (st < L - 1 && (x -= w[st]) >= 0) st++; }   // weighted (virtual) reel stops
      else st = Math.floor(rng() * L);
      stops.push(st); grid.push([strip[st], strip[(st + 1) % L], strip[(st + 2) % L]]);
    }
    return evaluate(cfg, grid, stops);
  }

  function evaluate(cfg, grid, stops) {
    const wins = []; let linePay = 0;
    PAYLINES.forEach((pl, i) => {
      const w = evalLine(pl.map((row, r) => grid[r][row]), cfg.paytable);
      if (w.pay > 0) { wins.push({ line: i, ...w }); linePay += w.pay; }
    });
    let banners = 0; const bannerPos = [];
    for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) if (grid[r][y] === 'B') { banners++; bannerPos.push([r, y]); }
    const crownReels = []; for (let r = 0; r < REELS; r++) if (grid[r].includes('C')) crownReels.push(r);
    // linePay in line-bet units; total bet = LINES line bets
    return { stops, grid, wins, lineWinX: linePay / PAYLINES.length, banners, bannerPos, bonus: banners >= 3 ? Math.min(banners, 5) : 0, crownReels };
  }

  function pickWeighted(table, rng) {
    let tot = 0; for (const e of table) tot += e[1];
    let x = rng() * tot; for (const e of table) { x -= e[1]; if (x < 0) return e[0]; }
    return table[table.length - 1][0];
  }

  // Clash of Crowns. EVERYTHING is drawn here, once, when the hero is chosen: duel won/lost, the final multiplier,
  // the free-spin count and every free spin. The player's per-round move (STRIKE/GUARD/FURY) only changes the animation.
  // force (tests only): { won: true|false, fs: 5..10 }
  function playBonus(cfg, heroId, tier, rng, force) {
    force = force || {};
    const B = cfg.bonus, t = B.tiers[tier], rounds = t.rounds;
    const won = force.won != null ? !!force.won : rng() < B.winProb[tier];
    const fsN = force.fs != null ? Math.max(5, Math.min(10, force.fs | 0)) : 5 + Math.floor(rng() * 6);
    const drawn = pickWeighted(B.tables[heroId][tier], rng);          // final multiplier (a loss shows it building, then losing it)
    const lastStand = won ? 0 : pickWeighted(B.lastStand, rng);
    const total = won ? drawn : 0;
    const seq = duelSeq(drawn, rounds, !!t.shield, won, rng);
    const fs = won ? playFreeSpins(cfg, fsN, total, rng) : null;
    const pay = won ? total + fs.payX : lastStand;                    // x total bet
    return { won, total, rounds, shield: !!t.shield, seq, fsN: won ? fsN : 0, fs, lastStand, pay };
  }
  function duelSeq(total, rounds, hasShield, won, rng) {
    const winP = won ? 0.6 : 0.45, wonR = []; for (let i = 0; i < rounds - 1; i++) wonR.push(rng() < winP);
    const wonCount = wonR.filter(Boolean).length, T = Math.round(total * 10);
    const weights = []; for (let i = 0; i < wonCount; i++) weights.push(0.5 + rng()); weights.push(1.5 + rng() * 1.5);
    const wsum = weights.reduce((a, b) => a + b, 0), parts = []; let rem = T;
    for (let i = 0; i < weights.length; i++) { const v = i === weights.length - 1 ? rem : Math.max(1, Math.floor(T * weights[i] / wsum)); parts.push(Math.min(v, rem)); rem -= Math.min(v, rem); }
    const seq = []; let pi = 0, mult = 0, heroHP = 100, hordeHP = 100, morale = 40, shield = hasShield ? 1 : 0;
    for (let i = 0; i < rounds - 1; i++) {
      if (wonR[i]) { const add = parts[pi++] / 10; mult += add; hordeHP = Math.max(8, hordeHP - 10 - rng() * 12); morale = Math.min(100, morale + 15); seq.push({ round: i + 1, result: 'win', add, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
      else if (shield > 0) { shield--; seq.push({ round: i + 1, result: 'blocked', add: 0, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
      else { heroHP = Math.max(10, heroHP - 12 - rng() * 10); morale = Math.max(5, morale - 12); seq.push({ round: i + 1, result: 'lose', add: 0, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
    }
    if (won) seq.push({ round: rounds, result: 'kill', add: parts[pi] / 10, mult: +total.toFixed(1), heroHP, hordeHP: 0, morale: 100 });
    else seq.push({ round: rounds, result: 'fall', add: 0, mult: 0, heroHP: 0, hordeHP, morale: 0 });
    return seq;
  }
  // Spoils of War: n free spins on the same weighted reels; every line win x mult; kingdom crests (D,V,S,N,E) that land stay
  // sticky for the remaining free spins. Banners and Crowns are inert in free spins (no retrigger, no meter).
  function playFreeSpins(cfg, n, mult, rng) {
    const sticky = {}; const spins = []; let sumX = 0;
    for (let i = 0; i < n; i++) {
      const base = spin(cfg, rng), grid = base.grid.map(c => c.slice());
      for (const k in sticky) { const [r, y] = k.split(':'); grid[r][y] = sticky[k]; }
      const ev = evaluate(cfg, grid, base.stops);
      for (let r = 0; r < REELS; r++) for (let y = 0; y < ROWS; y++) if (SYMBOLS[grid[r][y]].kind === 'high') sticky[r + ':' + y] = grid[r][y];
      sumX += ev.lineWinX;
      spins.push({ stops: base.stops, grid, wins: ev.wins, lineWinX: ev.lineWinX, winX: ev.lineWinX * mult, sticky: Object.keys(sticky) });
    }
    return { n, mult, spins, sumX, payX: sumX * mult };
  }

  // Crown Collector: apply a spin's crowns to the persistent meter (array of 5 booleans). Returns {meter, newly, full}.
  function applyCrowns(meter, crownReels) {
    const m = meter.slice(), newly = [];
    for (const r of crownReels) if (!m[r]) { m[r] = true; newly.push(r); }
    return { meter: m, newly, full: m.every(Boolean) };
  }
  // PICK JACKPOT: the tier is drawn FIRST from the fixed weights; the 12-tile board (3 of each tier) and the
  // reveal order are then arranged so the drawn tier is the first to reach three. Pays bet x tier multiple.
  function playJackpot(cfg, rng, forced) {
    const J = cfg.jackpot, tier = forced || pickWeighted(JP_TIERS.map(t => [t, J.tiers[t].w]), rng);
    const others = JP_TIERS.filter(t => t !== tier), pre = [tier, tier];
    for (const o of others) { const k = Math.floor(rng() * 3); for (let i = 0; i < k; i++) pre.push(o); }   // 0-2 of each loser before the win
    for (let i = pre.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pre[i], pre[j]] = [pre[j], pre[i]]; }
    const reveal = [...pre, tier];
    const rest = []; for (const t of JP_TIERS) { const left = 3 - reveal.filter(x => x === t).length; for (let i = 0; i < left; i++) rest.push(t); }
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    return { tier, x: J.tiers[tier].x, reveal, rest };
  }

  const api = { JP_TIERS, applyCrowns, playJackpot, playFreeSpins, duelSeq, SYMBOLS, PAYLINES, ROWS, REELS, evalLine, spin, evaluate, playBonus, pickWeighted };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SlotMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
