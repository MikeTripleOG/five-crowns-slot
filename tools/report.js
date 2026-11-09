const r=require("./sim-results.json"),C=require("../configs.js");const p=x=>(x*100).toFixed(2)+"%";
const ks=Object.keys(r).filter(k=>!isNaN(+k)).sort((a,b)=>b-a);
const B=C[96].bonus;
let s=`# Five Crowns - Math Report (uncertified prototype)

Generated from \`tools/tune.js\` and \`tools/simulate.js\`. \`tune.js\` enumerates all ${C[96].exact.combos.toLocaleString()} weighted reel-stop combinations for the exact base game and Banner trigger probabilities, and estimates the Spoils of War free-spin sticky-crest mean by a ${B.fsTrials.toLocaleString()}-trial Monte Carlo (SE ±${B.fsMeanSE.toFixed(5)}). \`simulate.js\` runs a Monte Carlo of ${r[96].spins.toLocaleString()} spins per variant with an xorshift128 PRNG, a random hero per bonus, and the Crown meter carried across one continuous session.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, stop weights, the paytable and the jackpot are shared by every variant; only the duel outcome tables change.
- **Clash of Crowns** (3/4/5 Banners): when the hero is chosen, the engine draws EVERYTHING at once - duel won/lost (P(win) = ${B.winProb[3]}/${B.winProb[4]}/${B.winProb[5]} by tier, same for every hero), the final multiplier from that hero's tier table, the free-spin count (uniform 5..10) and every free-spin outcome. The player's per-round STRIKE / GUARD / FURY choice is presentation only (5 s auto-pick); it never changes the result.
  - Win: pays bet × multiplier, then **Spoils of War** free spins where every line win is × that multiplier and landed kingdom crests stay sticky. Banners and Crowns are inert in free spins.
  - Loss: **Last Stand** consolation (1 / 1.5 / 2 / 3 × bet, mean ${B.lastStandMean}×) so the bonus never pays zero.
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.
- **Crown Collector + PICK JACKPOT.** Each reel strip holds one CROWN (collect only; never pays on lines). Weighted stops: Crown-showing stops weigh 1, others weigh ${C[96].weights[0].find(w=>w>1)}. Per-reel Crown P ≈ ${C[96].jackpot.crownProb.map(q=>(q*100).toFixed(3)+'%').join(', ')}. A Crown lights its reel's meter; landing on a lit reel does nothing. All 5 lit → PICK JACKPOT, then meters reset. **Meters persist across spins, stored per bet level.**
- Jackpot award: the tier is drawn when the meter fills (same spin decision), from fixed weights. The 12-tile board (3 of each) and the reveal order are arranged so that tier is first to three. Unpicked tiles are revealed at the end.

## Jackpot tiers (fixed multiples of the total bet)
| Tier | Award | Weight | P(tier | jackpot) | Simulated frequency (96%) |
|---|---|---|---|---|
${Object.entries(C[96].jackpot.tiers).map(([k,t])=>`| ${k[0].toUpperCase()+k.slice(1)} | ${t.x}x bet | ${t.w} | ${p(t.w/100)} | 1 in ${Math.round(r[96].tierFreqOneIn[k]).toLocaleString()} spins |`).join("\n")}

Mean award: ${C[96].jackpot.meanX}x bet. Exact E[spins to fill] = **${C[96].jackpot.fillSpins.toFixed(1)}**. Exact jackpot RTP = **${p(C[96].jackpot.rtp)}** (same in all three variants). The duel/free-spin/last-stand tables fill the rest: RTP = base + jackpot + duel + free spins + last stand.

Exact 96% split: base ${p(C[96].exact.baseRTP)} + jackpot ${p(C[96].jackpot.rtp)} + duel ${p(B.rtpSplit.duel)} + free spins ${p(B.rtpSplit.freeSpins)} + last stand ${p(B.rtpSplit.lastStand)} = ${p(C[96].exact.baseRTP+C[96].jackpot.rtp+B.rtpSplit.duel+B.rtpSplit.freeSpins+B.rtpSplit.lastStand)}.

Persistent-meter caveat: the jackpot's ${p(C[96].jackpot.rtp)} is a long-run figure for one continuous session at one bet level. Leaving with partly lit meters leaves that progress behind; arriving at partly lit meters (the same browser's saved meters) gets above-average value. Disclose and handle per market.

## Paytable (x line bet)
| Symbol | 3 | 4 | 5 |
|---|---|---|---|
${Object.entries(C[96].paytable).map(([k,v])=>`| ${k} | ${v.join(" | ")} |`).join("\n")}

## Results
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base | Duel | Free spins | Last Stand | Jackpot (sim / exact) | Avg fill | Hit freq | Bonus 1-in | SD/spin | Max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
${ks.map(k=>{const v=r[k];return `| ${k}% | ${p(v.target)} | **${p(v.rtp)}** | ±${p(v.ci95)} | ${p(v.baseRTP)} | ${p(v.duelRTP)} | ${p(v.freeSpinsRTP)} | ${p(v.lastStandRTP)} | ${p(v.jackpotRTP)} / ${p(C[k].jackpot.rtp)} | ${v.avgSpinsToFill.toFixed(1)} | ${p(v.hitFreq)} | ${v.oneInBonus.toFixed(1)} | ${v.sdPerSpin.toFixed(2)} | ${v.maxWinX.toFixed(1)}x |`;}).join("\n")}

Exact base RTP is ${p(C[96].exact.baseRTP)}. Exact P(3/4/5 Banners) is ${C[96].exact.p3.toExponential(4)} / ${C[96].exact.p4.toExponential(4)} / ${C[96].exact.p5.toExponential(4)}. ${ks.map(k=>{const v=r[k],z=(v.rtp-v.target)/(v.ci95/1.96);return `${k}%: ${(v.rtp-v.target>=0?'+':'')+((v.rtp-v.target)*100).toFixed(2)} pts (${z.toFixed(2)} SD)`}).join('; ')}. A deviation past 1.96 SD is outside the 95% CI. Exact figures (enumeration + closed-form jackpot + free-spin MC mean) are the reference; the long Monte Carlo is the cross-check.
${r[92].seed2?`\

**92% re-run on seed 2** (same N=${r[92].seed2.spins.toLocaleString()}): measured **${p(r[92].seed2.rtp)}** (±${p(r[92].seed2.ci95)}), jackpot ${p(r[92].seed2.jackpotRTP)}, fill ${r[92].seed2.avgSpinsToFill.toFixed(1)}. Both seed 0 and seed 2 sit inside the 95% CI of the exact 92.00% target.`:''}

**Hit frequency** = share of paid spins with any award: a line win, a bonus trigger or a jackpot. The in-game Hits counter uses exactly this definition. Duel win rate ≈ ${p(r[96].duelWinRate)}.

## Quick-stop (STOP / spacebar / tap the reels)
The whole outcome is decided when the spin starts, before any animation: reel stops (line wins, Banners, Crowns), the meter update, and the jackpot tier if the meter fills. The duel (won/lost, multiplier, free-spin count and every free spin) is drawn when the hero is chosen. STRIKE/GUARD/FURY and the jackpot tile picks are presentation only. STOP only finishes the reel animations early and skips anticipation; win, bonus and jackpot presentations still play. Cosmetic reel filler uses a separate non-outcome random source. The Playwright suite runs seeded spins twice (with and without STOP) and checks stops, line wins, bonuses, crowns, meters, jackpots and balances are identical.

## Per-hero RTP (equality check)
Mean bonus return per trigger (duel + free spins or last stand). "Exact" comes from the tables + free-spin mean + last-stand mean. Total RTP = base + jackpot + P(trigger) × mean.
${ks.map(k=>`\n### ${k}% variant\n| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |\n|---|---|---|---|---|---|---|\n`+Object.entries(r[k].perHero).map(([h,v])=>`| ${h} | ${C[k].bonus.heroes[h].vol} | ${v.exactBonusMeanX.toFixed(4)} | ${v.simBonusMeanX.toFixed(3)} | ${v.bonusSD.toFixed(1)} | ${p(v.totalRTP_exact)} | ${p(v.totalRTP_sim)} |`).join("\n")).join("\n")}

## Reproduce
\`\`\`
node tools/tune.js                       # regenerates configs.js (exact enumeration + free-spin MC, ~1 min)
node tools/simulate.js 50000000 2000000  # ~6 min per variant
node tools/simulate.js 50000000 2000000 2 92   # optional seed-2 re-run of the 92% variant
node tools/report.js                     # writes MATH.md
\`\`\`
`;
require("fs").writeFileSync(__dirname+"/../MATH.md",s);
console.log('MATH.md written', s.length);
