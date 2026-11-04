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

  // Bonus: outcome (total multiplier) drawn from hero/tier table, then dramatised into rounds.
  function playBonus(cfg, heroId, tier, rng) {
    const total = pickWeighted(cfg.bonus.tables[heroId][tier], rng);
    const t = cfg.bonus.tiers[tier];
    const rounds = t.rounds;
    // choose which of the first (rounds-1) exchanges are won; final round is the killing blow
    const won = [];
    for (let i = 0; i < rounds - 1; i++) won.push(rng() < 0.6);
    let wonCount = won.filter(Boolean).length;
    // split total into wonCount+1 parts (killing blow gets the biggest share)
    const parts = []; let rem = Math.round(total * 10);
    const weights = []; for (let i = 0; i < wonCount; i++) weights.push(0.5 + rng());
    weights.push(1.5 + rng() * 1.5);
    const wsum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) {
      const v = i === weights.length - 1 ? rem : Math.max(1, Math.floor(Math.round(total * 10) * weights[i] / wsum));
      parts.push(Math.min(v, rem)); rem -= Math.min(v, rem);
    }
    const seq = []; let pi = 0, mult = 0, heroHP = 100, hordeHP = 100, morale = 40, shield = t.shield ? 1 : 0;
    for (let i = 0; i < rounds - 1; i++) {
      if (won[i]) { const add = parts[pi++] / 10; mult += add; hordeHP = Math.max(8, hordeHP - 10 - rng() * 12); morale = Math.min(100, morale + 15); seq.push({ round: i + 1, result: 'win', add, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
      else if (shield > 0) { shield--; seq.push({ round: i + 1, result: 'blocked', add: 0, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
      else { heroHP = Math.max(10, heroHP - 12 - rng() * 10); morale = Math.max(5, morale - 12); seq.push({ round: i + 1, result: 'lose', add: 0, mult: +mult.toFixed(1), heroHP, hordeHP, morale }); }
    }
    const add = parts[pi] / 10; mult += add;
    seq.push({ round: rounds, result: 'kill', add, mult: +total.toFixed(1), heroHP, hordeHP: 0, morale: 100 });
    return { total, rounds, shield: !!t.shield, seq };
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

  const api = { JP_TIERS, applyCrowns, playJackpot, SYMBOLS, PAYLINES, ROWS, REELS, evalLine, spin, evaluate, playBonus, pickWeighted };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SlotMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
