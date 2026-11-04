# Five Crowns - Free-Play Slot Prototype

**Free play demo - no real money.** This uses demo credits only: there are no payments, no accounts and no cash value. Play: https://miketripleog.github.io/five-crowns-slot/

A 5-reel x 3-row, 5-line fantasy slot built as a static web app (no build step). Symbols: the five kingdom crests (high), the Crimson Horde dragon Wild, the weapons (low) and the War Banner scatter. 3+ Banners on a paid spin trigger the **Clash of Crowns** duel bonus.

## Run
Serve the folder with any static server, e.g. `python3 -m http.server`, then open `index.html`.
- `?rtp=96|94|92` picks a math variant (default 96).
- `?forceBonus=1` forces Banners on the first (still paid) spin, for testing.
- Tap SPIN (or the reels), or press Space on desktop. Use the mute button for sound.

## Structure
- `math.js`: the line evaluation, spin and bonus engine, shared by the browser and node.
- `configs.js`: generated reel strips, paytable and bonus outcome tables for the 96/94/92% variants.
- `tools/tune.js`: exact enumeration and calibration. `tools/simulate.js`: Monte Carlo. `tools/report.js` writes `MATH.md`.
- `game.js`, `style.css`, `index.html`: the UI, with WebAudio procedural sound and the canvas coin burst.
- `assets/symbols/*.png`: tiles loaded **by file name** (see `SYMBOLS` in `math.js`). To swap art, replace the PNG; no code change is needed.
- `test/smoke.mjs`: the Playwright mobile smoke test.

## Math
See [MATH.md](MATH.md). The hero choice is cosmetic plus volatility flavour only. All heroes have the same expected return, and outcomes come only from the RNG and the outcome tables, never from player skill.

## IMPORTANT: not for real money
This prototype is **uncertified**. Its RNG is the browser's `crypto.getRandomValues`, and the math has only been self-tested. A real-money release would need:
- an RNG and game math certified by a licensed independent testing lab (e.g. GLI, BMM, eCOGRA), with server-side outcome generation;
- deployment on a licensed casino platform, under the gaming licences for each target jurisdiction, including responsible-gambling, age and KYC controls.
