const r=require("./sim-results.json"),C=require("../configs.js");const p=x=>(x*100).toFixed(2)+"%";
const ks=Object.keys(r).sort((a,b)=>b-a);
let s=`# Five Crowns - Math Report (uncertified prototype)

Generated from \`tools/tune.js\` and \`tools/simulate.js\`. \`tune.js\` enumerates all ${C[96].exact.combos.toLocaleString()} reel-stop combinations to get the exact base game and trigger probabilities. \`simulate.js\` runs a Monte Carlo of ${r[96].spins.toLocaleString()} spins per variant with an xorshift128 PRNG and picks a random hero for each bonus.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, the paytable and the bonus outcome tables are data in \`configs.js\` (generated). Every variant uses the same reel strips and paytable; only the bonus outcome tables change.
- Bonus: 3, 4 or 5 Banners anywhere on a paid spin. The total multiplier is drawn from the weighted outcome table of the chosen hero for that tier, then shown as rounds: each won exchange adds to the multiplier, and a final killing blow ends the duel. Pays bet x total multiplier. The tier mean is 1.6x the 3-Banner mean for 4 Banners (+1 round) and 3x for 5 Banners (+2 rounds and a Shield).
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.

## Paytable (x line bet)
| Symbol | 3 | 4 | 5 |
|---|---|---|---|
${Object.entries(C[96].paytable).map(([k,v])=>`| ${k} | ${v.join(" | ")} |`).join("\n")}

## Results
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base RTP | Bonus RTP | Hit freq | Bonus trigger | SD/spin | Max win seen |
|---|---|---|---|---|---|---|---|---|---|
${ks.map(k=>{const v=r[k];return `| ${k}% | ${p(v.target)} | **${p(v.rtp)}** | ±${p(v.ci95)} | ${p(v.baseRTP)} | ${p(v.bonusRTP)} | ${p(v.hitFreq)} (1 in ${(1/v.hitFreq).toFixed(2)}) | 1 in ${v.oneInBonus.toFixed(1)} | ${v.sdPerSpin.toFixed(2)} | ${v.maxWinX.toFixed(1)}x bet |`}).join("\n")}

Exact base RTP is ${p(C[96].exact.baseRTP)}. Exact P(3/4/5 Banners) is ${C[96].exact.p3.toExponential(4)} / ${C[96].exact.p4.toExponential(4)} / ${C[96].exact.p5.toExponential(4)}. The 96% variant measures within the ±0.3% target.

## Per-hero RTP (equality check)
Mean bonus multiplier per trigger. "Exact" comes from the tables. "Sim" comes from the bonus trials per hero. Total RTP = base + P(trigger) x mean.
${ks.map(k=>`\n### ${k}% variant\n| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |\n|---|---|---|---|---|---|---|\n`+Object.entries(r[k].perHero).map(([h,v])=>`| ${h} | ${C[k].bonus.heroes[h].vol} | ${v.exactBonusMeanX.toFixed(4)} | ${v.simBonusMeanX.toFixed(3)} | ${v.bonusSD.toFixed(1)} | ${p(v.totalRTP_exact)} | ${p(v.totalRTP_sim)} |`).join("\n")).join("\n")}

## Reproduce
\`\`\`
node tools/tune.js                       # regenerates configs.js (exact enumeration, ~25s)
node tools/simulate.js 30000000 3000000  # ~8 min for all three variants
node tools/report.js                     # writes MATH.md
\`\`\`
`;require("fs").writeFileSync(__dirname+"/../MATH.md",s);
