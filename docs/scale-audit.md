# v8 Scale audit

1 world unit = 1 yard throughout (engine and renderer). In the table, "Before" means v7 and "After" means v8.

## Sources

- **NFL Rulebook, Rule 1 (The Field).**
  - Field is 120 yd × 160 ft (53⅓ yd).
  - Lines are 4 in wide; there is a 6-ft white border.
  - Inbound lines (hashes) are 70 ft 9 in from each sideline, with 2-ft marks.
  - Yard numbers are 6 ft tall × 4 ft wide, tops 9 yd from the sideline.
  - Goal posts: 10-ft crossbar, uprights 18 ft 6 in apart, extending 35 ft above the crossbar (minimum 30 ft in older rule books).
  - Source: operations.nfl.com, "Rules of the game / Field".
- **Ball:** NFL ball is about 11 in long, about 22 in long circumference, short axis about 6.7 in (Wilson "The Duke" spec).
- **Player heights:** NFL combine/roster averages by position. Weights are not modelled.

| Position | Average height |
|---|---|
| QB | ~6'3" |
| OL | ~6'5" |
| TE | ~6'4" |
| WR | ~6'1" |
| RB | ~5'11" |
| DL | ~6'4" |
| LB | ~6'2" |
| DB | ~6'0" |

  - Figures are from public combine databases and roster studies.
  - They are approximate and vary by year (±1 in).
- **Splits and depths:**
  - Typical OL splits are 2–3 ft between linemen. With ~2-ft-wide players that is about 4–5 ft (≈1.4–1.7 yd) centre-to-centre.
  - Shotgun QB at 5 yd, pistol at 4 yd, under-center at 1 yd.
  - These come from coaching manuals (common knowledge, not a single citation).

## Field and props

| Item | Before (v7) | After (v8) | Real |
|---|---|---|---|
| Field width | 53.3 yd | 53.33 yd | 53⅓ yd |
| Yard-line width | ~8.6 in | 4 in | 4 in |
| Hash marks | 1 yd ticks, approx. position | 2 ft × 4 in, 70'9" from sideline | same |
| Yard numbers | small, ~12 yd in from sideline | 6 ft tall, centred 8 yd in (tops at ≈9 yd) | 6 ft, tops 9 yd |
| Sideline border | none / thin | 6-ft white border + yellow restraining line at 4.1 yd outside | 6 ft border (+ coaching box lines) |
| Goal post | uprights 30 ft, approximate spacing | crossbar 10 ft high, 18'6" wide, uprights 35 ft | same |
| Ball | 10.8 × 18.9 in (2× too big) | 6.7 × 11 in | 6.7 × 11 in |

## Players

| Position | Before rendered height | After (table + cleats) | Debug HUD shows |
|---|---|---|---|
| QB | ~2.25 yd (6'9") | 6'3" + 1.5 in | 6'5" |
| OL | ~2.19 yd (6'7"), shorter than WRs | 6'5" + 1.5 in | 6'7" |
| TE | ~2.27 yd | 6'4" | 6'5" |
| WR | ~2.27 yd (6'10") | 6'1" | 6'2" |
| RB | ~2.27 yd | 5'11" | 6'1" |
| DL | ~2.19 yd | 6'4" | 6'5" |
| LB | ~2.27 yd | 6'2" | 6'4" |
| DB | ~2.27 yd | 6'0" | 6'2" |

- **Implementation:**
  - `rig3d.js` reports the rig's natural standing height (`naturalHeight`).
  - `game3d.js` scales each player's `body` group to `heightYd(pos) = (ft + 0.125) / 3`. The +1.5 in is for cleats and the helmet top.
  - The selection ring and tap/hit areas are not scaled, so input is unchanged.
- **Pads:** shoulder width came down from up to 37 in. Big bodies are now 1.12× wide (was 1.26×), mid builds 1.02×.

## Spacing: a deliberate render-side compression

- **The problem:** the engine places OL at dx = −5, −2.5, 0, 2.5, 5 yd. That is 2.5 yd (7.5 ft) centre-to-centre, about 1.6× too wide. Protections, gap math (`gapOf` thresholds 2.5/5/7.5), the sack matrix, the int-stats and the authored reads are all tuned on that grid.
- **Decision:** the engine is not changed. The renderer maps lateral offsets from the ball through `boxMap`:
  - within 6 yd of the ball: ×0.62. OL centre-to-centre becomes 1.55 yd (4'8"), which is realistic.
  - from 6 to 12 yd: blends smoothly back to 1:1.
  - beyond 12 yd (WR splits, CBs, the numbers, hashes): unchanged, so receiver splits and leverage read true.
- **Result:** every engine number (sack times, INT rates, reads, grading) is identical to v7. This is verified by diffing the sack-matrix, int-stats and bake-reads outputs before and after.
- **Toggles:**
  - `Shift+K` (or `window.__boxK = 1`) shows the raw engine spacing.
  - The scale-debug HUD prints the current factor.

## Kept on purpose

| Item | Engine value | Real | Why kept |
|---|---|---|---|
| Ball speed | 20 yd/s (~41 mph) | 24–29 yd/s (50–60 mph) | Gives readable windows on mobile; INT/completion tuning depends on it |
| WR route speed | 7.4 yd/s | 7–8 yd/s at route speed (4.4 forty ≈ 9 yd/s top end) | Plausible |
| DB / zone speed | 7.0 / 6.4 yd/s | similar | Plausible |
| Depths | QB −5 (gun) / −1 (UC); RB −5 to −7; LBs 4–5; safeties 10–13 | same | Already realistic |
| DL at +1, OL at −1 | 2 yd apart | ~1 yd (neutral zone = ball length) | Gives stance animations room; visually close at the box scale |

## Camera

- **New camera "QB eye level (realistic)":** the camera sits inside the QB's helmet at his scaled eye height (~6'1"). His head and torso are hidden in this mode.
- **Field of view:** 62° landscape and 75° portrait, the same as before.
- **Pulled-back and classic cameras:** unchanged.

## Debug overlay (K)

- 1-yd cyan grid with bright 5-yd lines.
- Line-of-scrimmage ruler.
- Magenta height bars with 1-ft ticks on every player.
- A HUD listing heights by position, OL centre-to-centre spacing, QB depth and the box factor.
- Screenshot: `screenshots/v8-scale-debug.png`.
