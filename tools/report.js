const r=require("./sim-results.json"),C=require("../configs.js");const p=x=>(x*100).toFixed(2)+"%";
const ks=Object.keys(r).sort((a,b)=>b-a);
let s=`# Five Crowns - Math Report (uncertified prototype)

Generated from \`tools/tune.js\` and \`tools/simulate.js\`. \`tune.js\` enumerates all ${C[96].exact.combos.toLocaleString()} reel-stop combinations to get the exact base game and trigger probabilities. \`simulate.js\` runs a Monte Carlo of ${r[96].spins.toLocaleString()} spins per variant, with the Crown meter carried across the whole session, with an xorshift128 PRNG and picks a random hero for each bonus.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, the paytable and the bonus outcome tables are data in \`configs.js\` (generated). Every variant uses the same reel strips, stop weights, paytable and jackpot; only the duel bonus outcome tables change.
- Bonus: 3, 4 or 5 Banners anywhere on a paid spin. The total multiplier is drawn from the weighted outcome table of the chosen hero for that tier, then shown as rounds: each won exchange adds to the multiplier, and a final killing blow ends the duel. Pays bet x total multiplier. The tier mean is 1.6x the 3-Banner mean for 4 Banners (+1 round) and 3x for 5 Banners (+2 rounds and a Shield).
- **Crown Collector + PICK JACKPOT.** Each reel strip holds one CROWN (a collect symbol; it never pays on lines and breaks a line like the Banner). The reels use weighted (virtual) stops: the 3 stops that show the Crown weigh 1 and every other stop weighs ${C[96].weights[0].find(w=>w>1)}. So a Crown shows on a given reel with probability ~${(C[96].jackpot.crownProb[0]*100).toFixed(3)}% per spin (reel by reel: ${C[96].jackpot.crownProb.map(q=>(q*100).toFixed(3)+'%').join(', ')}). A Crown lights its reel's meter; landing on a lit reel does nothing. When all 5 are lit, the PICK JACKPOT plays and the meters reset. **Meters persist across spins, stored per bet level**, so a nearly full meter cannot be moved to a bigger bet.
- Jackpot award: the tier is drawn at the moment the meter fills, within the same spin decision, from fixed weights. The 12-tile board (3 of each tier) and the reveal order are then arranged so that tier is the first to reach three, which is standard "predetermined pick" practice. Player picks only change which tile shows which pre-arranged face. Unpicked tiles are revealed at the end.
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.

## Jackpot tiers (fixed multiples of the total bet)
| Tier | Award | Weight | P(tier given jackpot) | Simulated frequency (96%) |
|---|---|---|---|---|
${Object.entries(C[96].jackpot.tiers).map(([k,t])=>`| ${k[0].toUpperCase()+k.slice(1)} | ${t.x}x bet | ${t.w} | ${p(t.w/100)} | 1 in ${Math.round(r[96].tierFreqOneIn[k]).toLocaleString()} spins |`).join("\n")}

Mean award: ${C[96].jackpot.meanX}x bet. Exact E[spins to fill an empty meter] = E[max of 5 independent geometric waits] (inclusion-exclusion) = **${C[96].jackpot.fillSpins.toFixed(1)} spins**. Exact jackpot RTP (renewal-reward, long-run per bet level) = ${C[96].jackpot.meanX} / ${C[96].jackpot.fillSpins.toFixed(1)} = **${p(C[96].jackpot.rtp)}**, the same in all three variants. The duel bonus tables are re-normalised to carry the rest: RTP = base + jackpot + duel.

Persistent-state caveat: the jackpot's ${p(C[96].jackpot.rtp)} is a long-run figure for one continuous session at one bet level. A player who leaves with partly lit meters leaves that progress behind, and a player who arrives at partly lit meters (the same browser's saved meters) gets above-average value on the next spins. This is the usual property of persistent-meter games and must be disclosed and handled per market.

## Paytable (x line bet)
| Symbol | 3 | 4 | 5 |
|---|---|---|---|
${Object.entries(C[96].paytable).map(([k,v])=>`| ${k} | ${v.join(" | ")} |`).join("\n")}

## Results
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base RTP | Duel bonus RTP | Jackpot RTP (sim / exact) | Avg spins to fill (sim) | Jackpots | Hit freq | Bonus trigger | SD/spin | Max win seen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
${ks.map(k=>{const v=r[k];return `| ${k}% | ${p(v.target)} | **${p(v.rtp)}** | ±${p(v.ci95)} | ${p(v.baseRTP)} | ${p(v.bonusRTP)} | ${p(v.jackpotRTP)} / ${p(C[k].jackpot.rtp)} | ${v.avgSpinsToFill.toFixed(1)} (exact ${C[k].jackpot.fillSpins.toFixed(1)}) | ${v.jackpots.toLocaleString()} | ${p(v.hitFreq)} (1 in ${(1/v.hitFreq).toFixed(2)}) | 1 in ${v.oneInBonus.toFixed(1)} | ${v.sdPerSpin.toFixed(2)} | ${v.maxWinX.toFixed(1)}x bet |`}).join("\n")}

Exact base RTP is ${p(C[96].exact.baseRTP)}. Exact P(3/4/5 Banners) is ${C[96].exact.p3.toExponential(4)} / ${C[96].exact.p4.toExponential(4)} / ${C[96].exact.p5.toExponential(4)}. ${ks.map(k=>{const v=r[k],z=(v.rtp-v.target)/(v.ci95/1.96);return `${k}%: ${(v.rtp-v.target>=0?'+':'')+((v.rtp-v.target)*100).toFixed(2)} pts (${z.toFixed(2)} SD)`}).join('; ')}. A deviation past 1.96 SD is outside the 95% CI. The exact figures (enumeration plus closed-form jackpot) are the reference, and the Monte Carlo is a cross-check. The CI is wide-ish (about ±0.15%) because the 1000x Grand dominates the variance, at roughly 500 Grands per 50M spins. Simulated with the **persistent meter carried across one continuous ${r[96].spins.toLocaleString()}-spin session per variant**.

**Hit frequency** = share of paid spins with any award: a line win, a bonus trigger or a jackpot. The in-game "Hits" counter uses exactly this definition.

## Quick-stop (STOP / spacebar / tap the reels)
The whole outcome is decided when the spin starts, before any animation: reel stops (and so line wins, Banners and Crowns), the meter update, and the jackpot tier if the meter fills. The duel outcome is drawn when the hero is chosen, and the jackpot board is fixed when the meter fills. STOP only finishes the reel animations early and skips the anticipation; the win, bonus and jackpot presentations still play. Cosmetic reel filler uses a separate non-outcome random source. The Playwright suite runs ${process.env.N||25} seeded spins (\`?seed=20261104\`) twice, once without and once with STOP on every spin, and checks that stops, line wins, bonuses, crowns, meter states, jackpots and balances are identical (\`screenshots/quickstop-determinism.json\`).

## Per-hero RTP (equality check)
Mean bonus multiplier per trigger. "Exact" comes from the tables. "Sim" comes from the bonus trials per hero. Total RTP = base + jackpot + P(trigger) x mean.
${ks.map(k=>`\n### ${k}% variant\n| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |\n|---|---|---|---|---|---|---|\n`+Object.entries(r[k].perHero).map(([h,v])=>`| ${h} | ${C[k].bonus.heroes[h].vol} | ${v.exactBonusMeanX.toFixed(4)} | ${v.simBonusMeanX.toFixed(3)} | ${v.bonusSD.toFixed(1)} | ${p(v.totalRTP_exact)} | ${p(v.totalRTP_sim)} |`).join("\n")).join("\n")}

## Reproduce
\`\`\`
node tools/tune.js                       # regenerates configs.js (exact weighted enumeration of 45.4M stop combos, ~35s)
node tools/simulate.js 50000000 2000000  # ~10 min for all three variants
node tools/report.js                     # writes MATH.md
\`\`\`
`;require("fs").writeFileSync(__dirname+"/../MATH.md",s);
