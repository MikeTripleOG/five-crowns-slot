# Five Crowns - Math Report (uncertified prototype)

Generated from `tools/tune.js` and `tools/simulate.js`. `tune.js` enumerates all 45,396,120 weighted reel-stop combinations for the exact base game and Banner trigger probabilities, and estimates the Spoils of War free-spin sticky-crest mean by a 4,000,000-trial Monte Carlo (SE ±0.01432). `simulate.js` runs a Monte Carlo of 50,000,000 spins per variant with an xorshift128 PRNG, a random hero per bonus, and the Crown meter carried across one continuous session.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, stop weights, the paytable and the jackpot are shared by every variant; only the duel outcome tables change.
- **Clash of Crowns** (3/4/5 Banners): when the hero is chosen, the engine draws EVERYTHING at once - duel won/lost (P(win) = 0.75/0.8/0.9 by tier, same for every hero), the final multiplier from that hero's tier table, the free-spin count (uniform 5..10) and every free-spin outcome. The player's per-round STRIKE / GUARD / FURY choice is presentation only (5 s auto-pick); it never changes the result.
  - Win: pays bet × multiplier, then **Spoils of War** free spins where every line win is × that multiplier and landed kingdom crests stay sticky. Banners and Crowns are inert in free spins.
  - Loss: **Last Stand** consolation (1 / 1.5 / 2 / 3 × bet, mean 1.55×) so the bonus never pays zero.
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.
- **Crown Collector + PICK JACKPOT.** Each reel strip holds one CROWN (collect only; never pays on lines). Weighted stops: Crown-showing stops weigh 1, others weigh 40. Per-reel Crown P ≈ 0.249%, 0.241%, 0.234%, 0.241%, 0.241%. A Crown lights its reel's meter; landing on a lit reel does nothing. All 5 lit → PICK JACKPOT, then meters reset. **Meters persist across spins, stored per bet level.**
- Jackpot award: the tier is drawn when the meter fills (same spin decision), from fixed weights. The 12-tile board (3 of each) and the reveal order are arranged so that tier is first to three. Unpicked tiles are revealed at the end.

## Jackpot tiers (fixed multiples of the total bet)
| Tier | Award | Weight | P(tier | jackpot) | Simulated frequency (96%) |
|---|---|---|---|---|
| Mini | 10x bet | 70 | 70.00% | 1 in 1,358 spins |
| Minor | 25x bet | 22 | 22.00% | 1 in 4,271 spins |
| Major | 100x bet | 7 | 7.00% | 1 in 13,699 spins |
| Grand | 1000x bet | 1 | 1.00% | 1 in 92,421 spins |

Mean award: 29.5x bet. Exact E[spins to fill] = **945.6**. Exact jackpot RTP = **3.12%** (same in all three variants). The duel/free-spin/last-stand tables fill the rest: RTP = base + jackpot + duel + free spins + last stand.

Exact 96% split: base 66.62% + jackpot 3.12% + duel 2.55% + free spins 22.97% + last stand 0.74% = 96.00%.

Persistent-meter caveat: the jackpot's 3.12% is a long-run figure for one continuous session at one bet level. Leaving with partly lit meters leaves that progress behind; arriving at partly lit meters (the same browser's saved meters) gets above-average value. Disclose and handle per market.

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
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base | Duel | Free spins | Last Stand | Jackpot (sim / exact) | Avg fill | Hit freq | Bonus 1-in | SD/spin | Max |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 96% | 96.00% | **95.77%** | ±0.27% | 66.63% | 2.55% | 22.71% | 0.74% | 3.13% / 3.12% | 948.3 | 18.48% | 51.8 | 9.81 | 9346.0x |
| 94% | 94.00% | **94.18%** | ±0.27% | 66.69% | 2.36% | 21.30% | 0.74% | 3.10% / 3.12% | 946.1 | 18.49% | 51.7 | 9.80 | 13512.8x |
| 92% | 92.00% | **92.11%** | ±0.24% | 66.65% | 2.15% | 19.37% | 0.74% | 3.19% / 3.12% | 947.2 | 18.48% | 51.7 | 8.51 | 8179.0x |

Exact base RTP is 66.62%. Exact P(3/4/5 Banners) is 1.7982e-2 / 1.3224e-3 / 3.7965e-5. 96%: -0.23 pts (-1.67 SD); 94%: +0.18 pts (1.26 SD); 92%: +0.11 pts (0.88 SD). A deviation past 1.96 SD is outside the 95% CI. Exact figures (enumeration + closed-form jackpot + free-spin MC mean) are the reference; the long Monte Carlo is the cross-check.

**92% re-run on seed 2** (same N=50,000,000): measured **91.88%** (±0.24%), jackpot 3.04%, fill 943.7. Both seed 0 and seed 2 sit inside the 95% CI of the exact 92.00% target.

**Hit frequency** = share of paid spins with any award: a line win, a bonus trigger or a jackpot. The in-game Hits counter uses exactly this definition. Duel win rate ≈ 75.38%.

## Quick-stop (STOP / spacebar / tap the reels)
The whole outcome is decided when the spin starts, before any animation: reel stops (line wins, Banners, Crowns), the meter update, and the jackpot tier if the meter fills. The duel (won/lost, multiplier, free-spin count and every free spin) is drawn when the hero is chosen. STRIKE/GUARD/FURY and the jackpot tile picks are presentation only. STOP only finishes the reel animations early and skips anticipation; win, bonus and jackpot presentations still play. Cosmetic reel filler uses a separate non-outcome random source. The Playwright suite runs seeded spins twice (with and without STOP) and checks stops, line wins, bonuses, crowns, meters, jackpots and balances are identical.

## Per-hero RTP (equality check)
Mean bonus return per trigger (duel + free spins or last stand). "Exact" comes from the tables + free-spin mean + last-stand mean. Total RTP = base + jackpot + P(trigger) × mean.

### 96% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 13.5742 | 13.526 | 59.2 | 96.00% | 95.91% |
| northgard | low | 13.5742 | 13.527 | 47.6 | 96.00% | 95.91% |
| solenthia | medium | 13.5742 | 13.531 | 57.0 | 96.00% | 95.92% |
| vellorien | medium-high | 13.5742 | 13.526 | 65.5 | 96.00% | 95.91% |
| drakonia | high | 13.5742 | 13.511 | 87.4 | 96.00% | 95.88% |

### 94% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 12.5402 | 12.546 | 57.1 | 94.00% | 94.01% |
| northgard | low | 12.5402 | 12.561 | 44.5 | 94.00% | 94.04% |
| solenthia | medium | 12.5402 | 12.541 | 54.3 | 94.00% | 94.00% |
| vellorien | medium-high | 12.5402 | 12.540 | 64.3 | 94.00% | 94.00% |
| drakonia | high | 12.5402 | 12.581 | 87.5 | 94.00% | 94.08% |

### 92% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 11.5062 | 11.537 | 49.9 | 92.00% | 92.06% |
| northgard | low | 11.5062 | 11.525 | 40.2 | 92.00% | 92.04% |
| solenthia | medium | 11.5062 | 11.521 | 47.2 | 92.00% | 92.03% |
| vellorien | medium-high | 11.5062 | 11.537 | 54.1 | 92.00% | 92.06% |
| drakonia | high | 11.5062 | 11.468 | 72.9 | 92.00% | 91.93% |

## Reproduce
```
node tools/tune.js                       # regenerates configs.js (exact enumeration + free-spin MC, ~1 min)
node tools/simulate.js 50000000 2000000  # ~6 min per variant
node tools/simulate.js 50000000 2000000 2 92   # optional seed-2 re-run of the 92% variant
node tools/report.js                     # writes MATH.md
```
