# Five Crowns - Free-Play Slot Prototype

**Free play demo - no real money.** This uses demo credits only: there are no payments, no accounts and no cash value. Play: https://miketripleog.github.io/five-crowns-slot/

A 5-reel x 3-row, 5-line fantasy slot built as a static web app (no build step). Symbols: the five kingdom crests (high), the Crimson Horde dragon Wild, the weapons (low), the War Banner scatter and the CROWN collect symbol.
- **Clash of Crowns**: 3+ Banners on a paid spin. Banner flash → gates clip → champion select → versus → three-act duel (STRIKE/GUARD/FURY each round, 5 s auto-pick; Dragon Phase; coalition assists) → on a win, Spoils of War free spins (5–10, sticky crests, every win × the duel multiplier) → on a loss, Last Stand consolation (1–3× bet).
- **Crown Collector / PICK JACKPOT**: a Crown lights its reel's crown meter. Meters persist and are stored per bet level. Light all 5 to pick shields until three match: Mini 10x, Minor 25x, Major 100x, Grand 1000x bet. The ladder under the reels shows the live amounts.

## Run
Serve the folder with any static server, e.g. `python3 -m http.server`, then open `index.html`.

| URL hook | Effect |
|---|---|
| `?rtp=96\|94\|92` | math variant (default 96) |
| `?forceBonus=1\|4\|5` | first (still paid) spin lands 3 / 4 / 5 Banners |
| `?forceBonus=win\|laststand` | force the duel result (win → Spoils of War; laststand → consolation) |
| `?freeSpins=5..10` | force the Spoils of War free-spin count |
| `?demo=1` | skip the intro; autoplay never stops on Big Wins |
| `?forceJackpot=mini\|minor\|major\|grand` | first spin lands Crowns on every unlit reel and plays that jackpot tier |
| `?crowns=0..4` | pre-light that many crown meters for the starting bet |
| `?seed=N` | deterministic outcome RNG, **tests only** |
| `?autoplay=0&turbo=0&quickstop=0&introvideo=0&bonusvideo=0` | feature-flag overrides |

Controls: SPIN (becomes STOP while spinning). Space or a tap on the reels also spins or stops. Music and SFX have separate toggles.

## Renaming
"Five Crowns" is a working title: it is a registered trademark of a card game. To rename, change the one line `window.FC_TITLE = 'Five Crowns'` in `title.js`. It drives the page title, the web-app manifest name and the code-drawn logos. Titles baked into art (the intro video, `CLASH OF CROWNS` in the bonus clip) are separate assets. The repo and URL names would also need changing.

## Bonus controls
Each duel round shows STRIKE / GUARD / FURY. The result is already decided; the move only changes the animation. A 5-second timer auto-picks if you don't.

## Feature flags (`features.js`)
`window.FC_FEATURES = { autoplay, turbo, quickStop, introVideo, bonusVideo }`, all on by default. **Autoplay, turbo and quick-stop can be switched off for regulated markets** (e.g. UKGC rules) without code changes. Quick-stop never changes outcomes, because everything is decided at spin start (see MATH.md).
- Autoplay: 10/25/50/100 spins. It stops on a bonus, a jackpot, a Big Win+ (optional) or a balance floor.

## Audio
All music and SFX are **procedural WebAudio**: no third-party tracks or samples. That covers the orchestral base loop, the bonus battle theme, crossfades and ducking. Audio starts on the first tap ("Tap to enter").

## Video
`assets/load_intro_web.mp4` (muted, playsinline, skippable, cut at 3.4s) and `assets/bonus_transition_web.mp4` are H.264. If either fails, the game falls back to the code-drawn forged-title intro and the code camera push over `bonus_transition_notext.webp`.

## Structure
- `math.js`: line evaluation, weighted spin, bonus, crown meter and jackpot engine, shared by the browser and node.
- `configs.js`: generated reel strips, stop weights, paytable, jackpot and bonus tables (96/94/92%).
- `tools/tune.js`: exact enumeration and calibration. `tools/simulate.js`: 50M-spin Monte Carlo with the persistent meter. `tools/report.js` writes `MATH.md`.
- `game.js`, `audio.js`, `fx.js`, `style.css`, `index.html`: the UI.
- Art loads **by file name**, so swapping a file needs no code change:
  - `assets/symbols/*.png` (incl. `crown.png`)
  - `assets/ui/crown_meter_{off,on}.webp`
  - `assets/jackpot/{pick_shield,tile_*,plaque_*}.webp`
  - `assets/coalition/*_charge.webp`
  - `assets/vorrhak_dragon.webp`, `assets/horde_champion.webp`, `assets/duel_arena_bg_balanced.webp`
  - win titles, backgrounds, `vfx/`
- `test/smoke.mjs`: the Playwright mobile suite (iPhone 13 profile).
- `test/champion-selection.mjs`: coordinate-click checks for all five champion portraits on desktop, portrait and landscape. Each visible portrait and label now belongs to its own button; no invisible hit map or stretched group image.

## Math
See [MATH.md](MATH.md). Exact RTP is 96/94/92%. The jackpot carries ~3.12 points of each; free spins carry most of the bonus share. Every hero has the same expected return. The hero choice is cosmetic plus volatility flavour; all heroes have the same expected return. Jackpot picks are arranged around a tier already drawn by the RNG.

## IMPORTANT: not for real money
This prototype is **uncertified**. Its RNG is the browser's `crypto.getRandomValues`, and the math has only been self-tested. A real-money release would need:
- an RNG and game math certified by a licensed independent testing lab (e.g. GLI, BMM, eCOGRA), with server-side outcome generation (and server-side persistence of the crown meters);
- deployment on a licensed casino platform, under the gaming licences for each target jurisdiction, including responsible-gambling, age and KYC controls.
