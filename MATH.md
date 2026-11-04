# Five Crowns - Math Report (uncertified prototype)

Generated from `tools/tune.js` and `tools/simulate.js`. `tune.js` enumerates all 39,099,456 reel-stop combinations to get the exact base game and trigger probabilities. `simulate.js` runs a Monte Carlo of 30,000,000 spins per variant with an xorshift128 PRNG and picks a random hero for each bonus.

## Model
- 5x3 grid with 5 lines (3 rows and 2 V shapes). Line bet = bet/5. Lines pay left to right, and each line pays its highest win. The dragon Wild substitutes for everything except the Banner, and 3+ Wilds pay as Wild.
- Reel strips, the paytable and the bonus outcome tables are data in `configs.js` (generated). Every variant uses the same reel strips and paytable; only the bonus outcome tables change.
- Bonus: 3, 4 or 5 Banners anywhere on a paid spin. The total multiplier is drawn from the weighted outcome table of the chosen hero for that tier, then shown as rounds: each won exchange adds to the multiplier, and a final killing blow ends the duel. Pays bet x total multiplier. The tier mean is 1.6x the 3-Banner mean for 4 Banners (+1 round) and 3x for 5 Banners (+2 rounds and a Shield).
- Each hero table is normalised to the **same mean** in every tier, so the expected return is identical. Only the spread (volatility) differs.

## Paytable (x line bet)
| Symbol | 3 | 4 | 5 |
|---|---|---|---|
| W | 80 | 322 | 1610 |
| D | 64 | 241 | 966 |
| V | 48 | 161 | 644 |
| S | 40 | 129 | 483 |
| N | 32 | 97 | 402 |
| E | 24 | 80 | 322 |
| sw | 8 | 24 | 97 |
| sp | 8 | 24 | 97 |
| bo | 6 | 19 | 80 |
| sh | 6 | 19 | 80 |
| ho | 6 | 19 | 80 |

## Results
| Variant | Exact RTP | Measured RTP (MC) | 95% CI | Base RTP | Bonus RTP | Hit freq | Bonus trigger | SD/spin | Max win seen |
|---|---|---|---|---|---|---|---|---|---|
| 96% | 96.00% | **96.01%** | ±0.16% | 65.12% | 30.88% | 19.08% (1 in 5.24) | 1 in 43.3 | 4.37 | 866.1x bet |
| 94% | 94.00% | **93.87%** | ±0.15% | 64.94% | 28.93% | 19.09% (1 in 5.24) | 1 in 43.1 | 4.19 | 433.2x bet |
| 92% | 92.00% | **91.94%** | ±0.14% | 65.04% | 26.89% | 19.07% (1 in 5.24) | 1 in 43.2 | 4.05 | 754.1x bet |

Exact base RTP is 65.08%. Exact P(3/4/5 Banners) is 2.1415e-2 / 1.6656e-3 / 4.9719e-5. The 96% variant measures within the ±0.3% target.

## Per-hero RTP (equality check)
Mean bonus multiplier per trigger. "Exact" comes from the tables. "Sim" comes from the bonus trials per hero. Total RTP = base + P(trigger) x mean.

### 96% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 13.3669 | 13.368 | 12.9 | 96.00% | 96.00% |
| northgard | low | 13.3669 | 13.366 | 5.6 | 96.00% | 96.00% |
| solenthia | medium | 13.3669 | 13.367 | 12.3 | 96.00% | 96.00% |
| vellorien | medium-high | 13.3669 | 13.368 | 17.4 | 96.00% | 96.00% |
| drakonia | high | 13.3669 | 13.379 | 29.9 | 96.00% | 96.03% |

### 94% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 12.5023 | 12.494 | 12.1 | 94.00% | 93.98% |
| northgard | low | 12.5023 | 12.499 | 5.2 | 94.00% | 93.99% |
| solenthia | medium | 12.5023 | 12.494 | 11.4 | 94.00% | 93.98% |
| vellorien | medium-high | 12.5023 | 12.492 | 16.2 | 94.00% | 93.98% |
| drakonia | high | 12.5023 | 12.531 | 28.1 | 94.00% | 94.07% |

### 92% variant
| Hero | Volatility | Exact mean x | Sim mean x | Bonus SD (x) | Total RTP exact | Total RTP sim |
|---|---|---|---|---|---|---|
| eldenvale | medium | 11.6376 | 11.629 | 11.2 | 92.00% | 91.98% |
| northgard | low | 11.6376 | 11.634 | 4.9 | 92.00% | 91.99% |
| solenthia | medium | 11.6376 | 11.628 | 10.7 | 92.00% | 91.98% |
| vellorien | medium-high | 11.6376 | 11.625 | 15.1 | 92.00% | 91.97% |
| drakonia | high | 11.6376 | 11.647 | 26.0 | 92.00% | 92.02% |

## Reproduce
```
node tools/tune.js                       # regenerates configs.js (exact enumeration, ~25s)
node tools/simulate.js 30000000 3000000  # ~8 min for all three variants
node tools/report.js                     # writes MATH.md
```
