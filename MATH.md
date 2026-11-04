# Five Crowns - Math Report (uncertified prototype)

Generated from `tools/tune.js` and `tools/simulate.js`. `tune.js` enumerates all 45,396,120 reel-stop combinations to get the exact base game and trigger probabilities. `simulate.js` runs a Monte Carlo of 50,000,000 spins per variant, with the Crown meter carried across the whole session, with an xorshift128 PRNG and picks a random hero for each bonus.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, the paytable and the bonus outcome tables are data in `configs.js` (generated). Every variant uses the same reel strips, stop weights, paytable and jackpot; only the duel bonus outcome tables change.
- Bonus: 3, 4 or 5 Banners anywhere on a paid spin. The total multiplier is drawn from the weighted outcome table of the chosen hero for that tier, then shown as rounds: each won exchange adds to the multiplier, and a final killing blow ends the duel. Pays bet x total multiplier. The tier mean is 1.6x the 3-Banner mean for 4 Banners (+1 round) and 3x for 5 Banners (+2 rounds and a Shield).
- **Crown Collector + PICK JACKPOT.** Each reel strip holds one CROWN (a collect symbol; it never pays on lines and breaks a line like the Banner). The reels use weighted (virtual) stops: the 3 stops that show the Crown weigh 1 and every other stop weighs 40. So a Crown shows on a given reel with probability ~0.249% per spin (reel by reel: 0.249%, 0.241%, 0.234%, 0.241%, 0.241%). A Crown lights its reel's meter; landing on a lit reel does nothing. When all 5 are lit, the PICK JACKPOT plays and the meters reset. **Meters persist across spins, stored per bet level**, so a nearly full meter cannot be moved to a bigger bet.
- Jackpot award: the tier is drawn at the moment the meter fills, within the same spin decision, from fixed weights. The 12-tile board (3 of each tier) and the reveal order are then arranged so that tier is the first to reach three, which is standard "predetermined pick" practice. Player picks only change which tile shows which pre-arranged face. Unpicked tiles are revealed at the end.
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.

## Jackpot tiers (fixed multiples of the total bet)
| Tier | Award | Weight | P(tier given jackpot) | Simulated frequency (96%) |
|---|---|---|---|---|
| Mini | 10x bet | 70 | 70.00% | 1 in 1,348 spins |
| Minor | 25x bet | 22 | 22.00% | 1 in 4,347 spins |
| Major | 100x bet | 7 | 7.00% | 1 in 13,740 spins |
| Grand | 1000x bet | 1 | 1.00% | 1 in 99,404 spins |

Mean award: 29.5x bet. Exact E[spins to fill an empty meter] = E[max of 5 independent geometric waits] (inclusion-exclusion) = **945.6 spins**. Exact jackpot RTP (renewal-reward, long-run per bet level) = 29.5 / 945.6 = **3.12%**, the same in all three variants. The duel bonus tables are re-normalised to carry the rest: RTP = base + jackpot + duel.

Persistent-state caveat: the jackpot's 3.12% is a long-run figure for one continuous session at one bet level. A player who leaves with partly lit meters leaves that progress behind, and a player who arrives at partly lit meters (the same browser's saved meters) gets above-average value on the next spins. This is the usual property of persistent-meter games and must be disclosed and handled per market.

## Paytable (x line bet)
| Symbol | 3 | 4 | 5 |
|---|---|---|---|
| W | 75 | 302 | 1510 |
| D | 60 | 226 | 906 |
| V | 45 | 151 | 604 |
| S | 38 | 121 | 453 |
| N | 30 | 91 | 377 |
| E | 23 | 75 | 302 |
| sw | 8 | 23 | 91 |
| sp | 8 | 23 | 91 |
| bo | 6 | 18 | 75 |
| sh | 6 | 18 | 75 |
| ho | 6 | 18 | 75 |

## Results
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base RTP | Duel bonus RTP | Jackpot RTP (sim / exact) | Avg spins to fill (sim) | Jackpots | Hit freq | Bonus trigger | SD/spin | Max win seen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 96% | 96.00% | **95.97%** | ±0.15% | 66.65% | 26.27% | 3.05% / 3.12% | 948.2 (exact 945.6) | 52,731 | 18.48% (1 in 5.41) | 1 in 51.7 | 5.39 | 1025.4x bet |
| 94% | 94.00% | **93.99%** | ±0.15% | 66.64% | 24.26% | 3.10% / 3.12% | 944.8 (exact 945.6) | 52,922 | 18.49% (1 in 5.41) | 1 in 51.6 | 5.26 | 1042.0x bet |
| 92% | 92.00% | **91.85%** | ±0.14% | 66.63% | 22.20% | 3.02% / 3.12% | 949.2 (exact 945.6) | 52,675 | 18.48% (1 in 5.41) | 1 in 51.8 | 5.10 | 1032.3x bet |

Exact base RTP is 66.62%. Exact P(3/4/5 Banners) is 1.7982e-2 / 1.3224e-3 / 3.7965e-5. 96%: -0.03 pts (-0.38 SD); 94%: -0.01 pts (-0.11 SD); 92%: -0.15 pts (-2.11 SD). A deviation past 1.96 SD is outside the 95% CI. The exact figures (enumeration plus closed-form jackpot) are the reference, and the Monte Carlo is a cross-check. The CI is wide-ish (about ±0.15%) because the 1000x Grand dominates the variance, at roughly 500 Grands per 50M spins. Simulated with the **persistent meter carried across one continuous 50,000,000-spin session per variant**.

**Hit frequency** = share of paid spins with any award: a line win, a bonus trigger or a jackpot. The in-game "Hits" counter uses exactly this definition.

## Quick-stop (STOP / spacebar / tap the reels)
The whole outcome is decided when the spin starts, before any animation: reel stops (and so line wins, Banners and Crowns), the meter update, and the jackpot tier if the meter fills. The duel outcome is drawn when the hero is chosen, and the jackpot board is fixed when the meter fills. STOP only finishes the reel animations early and skips the anticipation; the win, bonus and jackpot presentations still play. Cosmetic reel filler uses a separate non-outcome random source. The Playwright suite runs 25 seeded spins (`?seed=20261104`) twice, once without and once with STOP on every spin, and checks that stops, line wins, bonuses, crowns, meter states, jackpots and balances are identical (`screenshots/quickstop-determinism.json`).

## Per-hero RTP (equality check)
Mean bonus multiplier per trigger. "Exact" comes from the tables. "Sim" comes from the bonus trials per hero. Total RTP = base + jackpot + P(trigger) x mean.

### 96% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 13.5742 | 13.577 | 13.1 | 96.00% | 96.01% |
| northgard | low | 13.5742 | 13.573 | 5.6 | 96.00% | 96.00% |
| solenthia | medium | 13.5742 | 13.577 | 12.4 | 96.00% | 96.01% |
| vellorien | medium-high | 13.5742 | 13.579 | 17.6 | 96.00% | 96.01% |
| drakonia | high | 13.5742 | 13.591 | 30.3 | 96.00% | 96.03% |

### 94% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 12.5402 | 12.525 | 12.1 | 94.00% | 93.97% |
| northgard | low | 12.5402 | 12.535 | 5.2 | 94.00% | 93.99% |
| solenthia | medium | 12.5402 | 12.526 | 11.5 | 94.00% | 93.97% |
| vellorien | medium-high | 12.5402 | 12.522 | 16.3 | 94.00% | 93.96% |
| drakonia | high | 12.5402 | 12.579 | 28.2 | 94.00% | 94.07% |

### 92% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 11.5062 | 11.501 | 11.1 | 92.00% | 91.99% |
| northgard | low | 11.5062 | 11.504 | 4.8 | 92.00% | 92.00% |
| solenthia | medium | 11.5062 | 11.501 | 10.5 | 92.00% | 91.99% |
| vellorien | medium-high | 11.5062 | 11.499 | 14.9 | 92.00% | 91.99% |
| drakonia | high | 11.5062 | 11.517 | 25.7 | 92.00% | 92.02% |

## Reproduce
```
node tools/tune.js                       # regenerates configs.js (exact weighted enumeration of 45.4M stop combos, ~35s)
node tools/simulate.js 50000000 2000000  # ~10 min for all three variants
node tools/report.js                     # writes MATH.md
```
