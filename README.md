# Pocket IQ 3D: QB mental reps simulator (3D browser build)

This is the 3D follow-up to `../qb-sim` (the 2D build is untouched). Each rep runs the same way: read the defense before the snap, snap the ball, work your progression from behind the QB in 3D, throw, then get graded and watch a coach-view replay with the coverage drawn on the field.

## Run
```
cd qb-sim-3d
python3 -m http.server 8766
# open http://localhost:8766/
```
You need a local server because ES modules don't load from `file://`. The app works offline: Three.js r170 is vendored in `vendor/three.module.js`. There's no build step and no npm install.

## Controls
| Action | Desktop | Touch |
|---|---|---|
| Call coverage / pressure | click the chips | tap |
| Snap | Space or SNAP | SNAP |
| Look around / scan | drag, ← → (A/D), ↑ re-centres | swipe |
| Throw | click a receiver or press 1–4 (read order) | tap a receiver (forgiving ~70 px radius) |
| Coach (overhead) view | C or the button | button |
| Show routes (hold) | hold R | hold the ROUTES button (bottom-right thumb spot; works alongside a tap with another finger) |
| Replay / next rep | P / Space | buttons |

## What's in it
- **Camera:** a raised view over the QB's right shoulder. It follows the 3-step drop, orbits as you scan, and shakes as the pocket closes. The overhead coach view eases in after each rep.
- **Stadium:** field texture drawn on a canvas, with 5-yard stripes, yard lines, hashes, numbers, coloured end zones and goal posts. Also tiered stands, light towers, fog for depth, a directional light with soft shadows, and blue line-of-scrimmage and yellow line-to-gain lines.
- **Players:** all 22 are low-poly (capsule torso, pads, helmet with facemask, limbs) in team colours, with numbers front and back. Limb swing and bob are procedural, linemen and receivers start in a stance, DBs backpedal while facing the QB and turn to run once they open up, and rushers punch their hands.
- **Ball:** the arc comes from flight time (gravity-like apex), with the nose following the tangent, a spiral spin and a ground shadow.
- **Simulation:** `js/engine.js` steps at a fixed 120 Hz and rendering interpolates between steps. Receivers break at their route stems, zone and man defenders react, and rushers collapse the pocket on the sack clock.
- **Grading:** each rep gets a SIM score out of 100: Coverage ID 25 (coverage 20 + pressure 5), Read 30, Timing 20 (difficulty-dependent slack around the play's ideal time) and Outcome 25. You also get a coaching note, separation numbers and a looping replay with zones (deep = blue, underneath = amber), man matchups (dashed red), rush lanes and routes (best read in green).
- **Difficulty:**
  - Rookie: 12 s pre-snap, pocket ×1.3, no disguise.
  - Starter: 8 s, ×1.0, safeties disguised 40% toward a neutral 2-high look.
  - Pro: 5 s, ×0.85, 85% disguise.
- **Progress:** history is saved in `localStorage` (`pocketiq3d.history.v1`) and shows rolling and best SIM scores and ID/read percentages by coverage. Your difficulty choice is saved too.
- **HUD:** the concept and formation, down & distance and field position, pocket clock bar, and read badges (1/2/3/CD) above receivers, which turn green for the best read and blue for the one you threw to. The layout is responsive for phone landscape and portrait.

## v2 changes
**Interceptions.** `engine.js` now checks the ball against every non-rushing defender on every step of the flight, not only the target's defender:
- **Throwing-lane / tipped balls.** A defender within 1.6 yd of the ball while it is low enough to play (under 3.3 yd) builds up a per-second INT and pass-breakup chance. That chance scales with how close he is, whether he has leverage (between the QB and the receiver), how late the throw was, and the difficulty multiplier (Rookie 0.6, Starter 1.0, Pro 1.4). Tipped balls can pop up into an INT.
- **Catch point.** The separation that counts shrinks when the ball is off-target or late. An undercutting defender plus a late throw gives a high INT chance.
- **Pressure.** Close rushers or a nearly expired pocket clock add accuracy error, so the ball sails or dies short (and a sailed ball arrives higher).
- **INT risk.** `E.intRisk(sim)` accumulates the INT chance over the whole throw. Grading adds a *Ball security* line: −10 for an INT, and up to −15 for a risky completion, with a "Got away with it — N% INT risk" note.
- **INT presentation.** The defender leaps, the ball attaches to his hands and he returns it, an "INTERCEPTED by <position>" banner appears, the replay marks the spot in red, and the coaching note says why (late read / throwing lane / tipped / threw into coverage / pressure).
- **Progress.** The progress panel shows INT count and rate, plus INTs by coverage.
- **Check the numbers.** Run `node tests/int-stats.cjs` (Monte Carlo, 200 reps × 7 plays per case):

| Difficulty | On-time best read | 0.9 s late, best read | On-time wrong read | Late wrong read |
|---|---|---|---|---|
| Starter | 94% comp, 0.1% INT | 50% comp, 17% INT | 61% comp, 11% INT | 32% comp, 23% INT |
| Pro | 0.5% INT | 20% INT | 15% INT | 31% INT |

**Pre-snap dock.** The call panel is a compact, semi-transparent, collapsible (▾) strip docked at the bottom on desktop, and a slim left rail on phone landscape. It is fully hidden after the snap; a tiny "Your call: …" chip stays top-left. The Playwright test checks that it never overlaps the central play area at 1280×800 or 844×390.

**Hold-to-show routes.** Holding the ROUTES button or R draws glowing ribbons with arrowheads on the turf. Colours follow read order: 1 green, 2 yellow, 3 blue, CD pink, others white. The routes hide on release, cancel, leaving the button, lost capture or window blur. Pointers are tracked per ID, so tapping a receiver with another finger still throws. You can turn ROUTES off at Pro under Progress → "Allow ROUTES preview at Pro".

## Architecture
```
index.html        HUD markup
style.css         HUD styles (responsive breakpoints for short/portrait screens)
js/data.js        formations, routes, coverages, the 7 plays (copied from 2D; add plays here)
js/engine.js      pure sim (copied from 2D + opts: pocketMul, disguise). No DOM, Node-testable
js/game3d.js      Three.js scene, player rigs, camera, input, game flow, grading, replay, history
vendor/three.module.js
tests-playwright.cjs  headless smoke test + screenshots (panel placement, routes hold/cancel, forced INT)
tests/int-stats.cjs   Monte-Carlo INT/completion rates per difficulty
```
Coordinates are in yards, with world x = field x − 26.65 and world z = −yards downfield (line of scrimmage at z = 0). The scene reads the engine state; it never changes it, except through `snap` and `throwTo`.

## Test
```
python3 -m http.server 8766 &
node tests-playwright.cjs     # needs Playwright (default path /tmp/pwt/node_modules/playwright, override with PW=...)
```
The test plays 8 reps covering tap throws, key throws and sacks, checks that no JS errors are thrown, and writes the images in `screenshots/`.

## Roadmap
1. Protection calls (slide/MIDs), hot routes and sight adjusts, with a free rusher when protection is wrong.
2. Real pre-snap motion and late safety rotation animated at the snap (the disguise is currently a static alignment).
3. A throw mechanic with placement and touch (hold for velocity, aim lead), plus ball-placement grading.
4. Better defender AI: pattern-match rules (MOD/MEG/Cut), robber and green-dog behaviour, and broken-up/INT animations.
5. GLTF skinned characters with mocap run cycles, instanced crowd, and jersey and decal textures.
6. Learning modules: coverage flashcards, timed quizzes, playbook install per concept, and a weekly game plan.
7. Accounts and backend for cross-device progress and leaderboards, plus coach dashboards.
8. Packaging as a PWA and a Capacitor wrapper for iOS and Android, with haptics on pressure.
9. Audio: cadence, crowd, hits.

## v3 — Unlimited pre-snap & detailed coverage calls

### Toggles (saved in localStorage)
| Toggle | Where | Key | Effect |
|---|---|---|---|
| Unlimited pre-snap | `∞` chip in the dock, plus a checkbox in Progress | `pocketiq3d.unlimited` | The timer reads **Unlimited** and there's no auto-snap. Snap with SNAP, Space or Enter. The SIM score never charges for pre-snap time; Timing only measures post-snap decision time. |
| Detailed calls | `Detail` chip in the dock, plus a checkbox in Progress ("auto by difficulty" resets it) | `pocketiq3d.detailed` | **auto** (default) is on at Starter/Pro and off at Rookie. When it's on, picking a family chip shows its variant chips (VAR). When it's off, you only pick the family. |

### Grading
- **Detailed mode:** Coverage ID = family 12 + variant 8 + pressure 5 (25 total). The right family with the wrong variant gets partial credit.
- **Quick mode:** family 20 + pressure 5.
- **Coaching:** opens with the variant's tells. If you called the wrong variant, it compares the real tell to the tell your call would have shown.
- **Progress:** each rep stores the variant. The table lists reps per variant with family %, variant %, read %, INTs and SIM.

### Variants (data.js `VARIANTS`; coverage objects carry `variant`)
| Family | Variants | Plays |
|---|---|---|
| Cover 0 | Zero | slant_c0 |
| Cover 1 | Free (Man-Free), Robber | mesh_c1, dagger_c1r |
| Cover 2 | Zone, 2-Man, Tampa 2 | smash_c2, mesh_c2m, dig_t2 |
| Cover 3 | Sky, Cloud, Buzz | verts_c3, flood_c3, smash_c3c, stick_c3b |
| Cover 4 | Quarters, Palms (2-Read), Cover 6 | smash_c4, stick_c4, stick_palms, smash_c6 |

Each variant plays differently after the snap too: robber hole defender, press-trail man under two-deep, the Mike running the pole in Tampa, a squat cloud corner, a buzz safety walling the curl, and Palms "read" jobs (engine `read` defender job: the corner jumps #2 out, otherwise it plays quarters). Cover 6 is quarters to one side and cloud to the other. The INT model applies to every play unchanged.

### Not built yet
C1 Lock, Cover 2 Cloud/Sky rotations, C3 Match and C4 Match/Solo are not modelled. Disguise is limited to the existing pre-snap disguise rotation.

## v4 — Modes, protections, blitz model, run game, audibles, custom plays, INT celebration

### Modes (☰ menu or the mode select; saved as `pocketiq3d.mode`)
| Mode | Pool | Audibles |
|---|---|---|
| **Normal** (default) | all 50 plays (39 pass + 11 run/RPO) | pass ↔ run |
| **Passing** | 39 pass plays | pass checks only (hot slants, stick, smash, verts, max shot, screen) |
| **Running** | 11 run plays | run checks only (IZ, OZ, power, counter, draw, toss) |

Stats are split by mode (Progress → "By mode"). History moved to `pocketiq3d.history.v2`. Old v1 records are migrated as `mode: passing`, and the v1 key is left untouched.

### Defensive line / pressure model (`js/protections.js`)
Each rusher gets a lane: a gap (A/B/C/D, edge) plus a move (speed, bull, rip, swim, loop). Each blocker gets an assignment from the protection. Every matchup has a win time: base OL-vs-DL + move − stunt bonus, plus a double-team (+2.2 s) or chip (+0.8 s). It then becomes **blocked / late (back has to travel > 7 yd) / free**. The sack clock is the earliest arrival, scaled by difficulty. More rushers than blockers means a free rusher and much less time. The pressure picker is **family → variant**. At Rookie (or with Detail off) it's family only, worth the full 10 pts.

| Blitz | Family | Notes |
|---|---|---|
| NONE | 4-man | baseline ≈ 3.8 s |
| TEX, TT | Stunt | loopers beat **man** schemes (BOB) and lose to **slide/zone** |
| MUG, XDOG, OVER | LB | A-gap mug and cross-dog: man/turn protection leaves a free LB |
| CB, SAF, NICK | DB | edge/slot pressure: slide to it |
| FIRE | Fire zone | 5 rush, 3-deep 3-under: slide to the dropper's side |
| ZERO | All-out | 6+ rushers: 6-man / max, or throw hot |

### Protections (PROT dropdown; pass plays only)
BOB, Slide L/R (RB checks the opposite side), Half-slide L + RB, Man/Turn (back free), 6-man, Max (RB + TE), Hot/Sight (5-man; slots convert to hot slants vs a free rusher), Chip & release.
Pre-snap, holding ROUTES draws the arrows (rusher → blocker, **FREE**, **LATE**, "X BLOCKS"). A post-snap chip shows the call, blockers vs rushers, and **HOT!** when someone comes free.
**Hot rule:** if a rusher arrives before the authored read, the correct read becomes the best open throw before the hit, and grading follows it.
**Protection grade (10):** 10 for a top-tier call (within 0.6 of the best). Otherwise 6 if nobody came free, 5 if you had a hot answer, 0 if not.

`node tests/sack-matrix.cjs` prints blitz × protection mean sack time over 40 seeds. It fails if any blitz doesn't cut the pocket at least 0.3 s below the 4-man baseline under its own best protection.

### Run game (`js/runplay.js`)
IZ, OZ, Power, Counter, Draw, Dive, Toss, QB Sneak, plus RPO (bubble). Each concept has a fit model: box count vs blockers (a gun read adds one for zone), front (Bear/odd/even), shell, and where the force player lines up. Yards come from that fit plus noise, with a 1.2% fumble chance. The carrier and tackler are animated.
**Run grade:** Run decision 35 (good when EV ≥ 3.5 yd; 15 if marginal), Outcome 35, Audible ±10, Fumble −10. The coaching text spells out the box math ("Light box: 6 blockers vs 6…").

### Audibles (AUDIBLE row of the dock)
Each rep offers Keep plus 3–4 checks, filtered by mode. A check keeps the same formation and defense and swaps the offensive concept. The result shows *Called X → audibled to Y*.
- **+10** for checking into the best play (within 0.75 of the top, and better than the call by > 0.5).
- **−5** for keeping when a clearly better check existed (> 1.5).
- **−10** for checking into a worse play.
- Pass plays are compared using 0.3 × engine best-read EV; runs use expected yards.

### Custom plays (☰ → Custom plays; `js/customplay.js`)
- **Setup:** pick the formation and the defense (coverage and pressure, or random), plus the protection and optional play-action.
- **Receivers:** each one gets a route, a depth % slider, flip, and a progression slot (1st/2nd/3rd/CD).
- **Mini field:** tap it to place custom break points for the selected receiver.
- **Reads:** set an ideal read and time, or leave it on Auto (the engine probes the best read and timing against the chosen look).
- **Runs:** concept, direction, carrier, blocking scheme.
- **Library:** save, edit, rename, delete, export JSON (download and textarea), import JSON (validated). Stored in `pocketiq3d.customPlays.v1`.

### INT celebration
After the catch, the defender turns, **points at the camera**, then runs at it dancing (shimmy, arm pumps, spin) with a taunt bubble. The camera holds on him for about 2 s of game time. The grade appears at +2.9 s and the replay starts at +3.4 s. The timing runs on game time, so slow frames can't cut the dance short.

### Performance
On software GL (SwiftShader/llvmpipe, detected via `WEBGL_debug_renderer_info`) the game automatically drops to no MSAA, basic shadows, a 1024 shadow map and a 0.6 pixel ratio. An adaptive scaler lowers the render scale further if fps < 32. Panel `backdrop-filter` was removed because it re-blurred the live canvas every frame. Headless software GL holds about 34–50 fps live.

### Tests
- `node tests/playwright-v4.cjs`: modes, MUG vs MAN/BOB protection, sack + replay, audible grading, run play, custom play (designer → save → run → export/import), INT celebration frames (taunt, camera hold, delayed grade), by-mode stats, fps ≥ 30, no JS errors. Screenshots go to `screenshots/v4-*.png`.
- `node tests-playwright.cjs`: v3 regression.
- `node tests/sack-matrix.cjs`, `node tests/int-stats.cjs`, `node tests/bake-reads.cjs` (authored vs probed reads).

### v4 known gaps / roadmap
- The designer has no drag-editing of existing points, and run blocking can't be drawn by hand.
- The pre-snap protection-ranking defense is a soft probe, so CHIP/BOB/SLIDE often tie for "best".
- The run game is a fit model plus animation, not physics-blocked. Cutbacks are scripted.
- No motion or shifts yet. Audibles don't flip the play strength or change the protection automatically.
- Screenshots from software GL render at a reduced pixel ratio, so they look softer than on a real GPU.

## v5 — Bubble UI, answer glow, top toggles, camera

### Bubble bar (replaces the bottom dock)
- **The bubbles:** four round/pill bubbles in the ROUTES style sit at the bottom edge:
  - **COVERAGE:** coverage family → variant, then pressure family → blitz variant, with the tells for whatever you picked.
  - **PROTECTION:** every O-line call with its full name.
  - **AUDIBLE:** Keep plus the checks for the current mode.
  - **SNAP:** shows the pre-snap timer. Space and Enter still snap.
- **Panels:**
  - Each opens above the bubble row, compact and semi-transparent.
  - Only one is open at a time.
  - Close one by tapping its bubble again, tapping outside, or pressing Esc. Snapping closes it too.
- **After the snap:** the bubble row shrinks to 72% and fades to 28%, and stops taking clicks. The ROUTES button and the "Your call" / protection chips stay.
- **Phone layouts:**
  - Landscape: the bubbles sit bottom-right, next to ROUTES, within thumb reach. Panels open upward with their own scroll, and SNAP never overlaps a panel.
  - Portrait: the bubbles form one row above the pocket clock, and the top HUD wraps.
- **Protection bubble:** hidden on run plays.

### Answer glow
- **Glow:** a bubble you've answered gets a teal outline glow and a short value label, e.g. `Cov 2 Zone · A-Mug`, `Slide L`, `Hot slants`.
- **COVERAGE:** a soft glow once either the coverage or the pressure is called, and a stronger double-ring glow once **both** are called. That shows at a glance whether half the pre-snap read is still missing.
- **PROTECTION:** glows once you pick a call. Before that the label shows the play's default call, with no glow.
- **AUDIBLE:** glows once you pick an option, including Keep.

### Top HUD
**Detail** and **∞** (unlimited pre-snap) moved to the top bar next to the mode and difficulty selects. They're still saved in localStorage.

### Camera
- **Anchor:** the QB-view camera never sits closer than the shotgun spot (5 yd behind the ball). Under-center plays (I-form, Ace) get exactly the same framing as gun plays.
- **Pre-snap:** every formation gets a raised, pulled-back view (+9.5 yd back, +9.4 up) so both wideouts and the backfield routes are on screen at 16:10.
- **After the snap:** it eases back into the normal over-the-shoulder follow. Drop-back follow and pressure shake are unchanged.

### Tests
`node tests/playwright-v5.cjs` covers:
- Bubbles present and clear of the center, and the toggles in the top HUD.
- Glow states: none → soft → full on Coverage, plus the Protection and Audible glows.
- Only one panel open at a time; it closes on a re-tap, Esc, an outside tap, and Enter-snap.
- The post-snap minimal state, the call chip and ROUTES.
- Under-center vs shotgun camera at the same position, and all receivers in frame.
- On phone landscape SNAP doesn't overlap the audible panel, and the portrait bubbles stay in view.
- No JS errors.

Screenshots: `screenshots/v5-*.png`. `tests/playwright-v4.cjs` and `tests-playwright.cjs` were updated to open the bubbles.

### v5 known gaps
- An open Coverage panel can cover the middle of the screen pre-snap (it closes on snap).
- In portrait the narrow view can't fit both wideouts. Drag to scan.
- The protection label shows the default call before you choose one, without the glow.

## v6 — Classic camera option + performance

**Settings** live in the ☰ menu and are saved in localStorage:
- **Camera** (`pocketiq3d.camera`):
  - *Pulled-back (default)*: the v5 camera.
  - *Classic QB view*: the v3/v4 over-the-shoulder camera, close behind the QB at his own spot. The framing does not zoom or ease at the snap; it only follows the drop and shakes under pressure. Works under center and in shotgun.
  - Look-around and coach view work in both modes. The change applies immediately.
- **Graphics** (`pocketiq3d.graphics`), applied by a reload:
  - *Auto*: an adaptive resolution scaler that lowers the pixel ratio and also recovers it.
  - *High*: pixel ratio min(DPR, 2), soft shadows, 2048 map.
  - *Low*: reduced resolution, basic shadows, fewer shadow casters.

**Performance changes** (rendering only; engine, timing and fixed-step sim untouched — only `js/game3d.js` changed):
- Instanced stadium stands, poles and lamps.
- Shared per-team materials.
- Players pooled across reps.
- Invisible route rings are no longer drawn.
- Tighter shadow frustum.
- No per-frame Vector3 or object allocations in the ball update.
- Cached DOM writes for the clock, timer and badges.
- Rendering is skipped while the tab is hidden.

Tests: `node tests/playwright-v6.cjs`.

## v6.1 fixes — "Next rep" not responding
- **Root cause:** the keyboard-help line (`#help`) is placed after `#result` in the HTML, and v5 moved it up to `bottom:92px` (style.css). With no z-index and no `pointer-events:none`, it sat on top of the result panel's **Next rep** button and swallowed clicks and taps. Keyboard (Space) still worked, so the bug looked intermittent.
- **Fixes:**
  - `#help` no longer takes clicks; `#result` (z 6) sits above the bubbles; menu, progress and designer sit above that (z 40).
  - Next rep uses `goNext()`: it debounces double-fires, cancels any replay or INT celebration, returns to QB view, and shows pressed feedback.
  - Previously the click Event was passed into `nextPlay` as if it were a forced play (latent bug).
  - **N** key also works. Space/Enter are ignored while a select or input has focus.
- **Leak fix:** overlay and route cleanup now disposes nested arrow-head geometries, per-rep materials and label CanvasTextures. Before, GPU geometries grew by about 3.5 per rep (43 → 183 over 40 reps); now they stay flat.
- **Regression test:** `node tests/playwright-nextrep.cjs` (REPS=40, THROTTLE=4). It covers desktop and phone touch, every rep-ending scenario, CPU throttling via CDP, and leak checks.

## v7 — Player models & body movement

**New file `js/rig3d.js`** is a procedural football-player kit.
- **Builds:** QB/WR/DB are tall and slim, OL/DL are bulky, and LB/TE/RB sit in between.
- **Body:** a rounded shoulder-pad yoke, team-colour jersey with shoulder stripes, and a neck.
- **Numbers:** on the chest and back (and the shoulders on Auto/High). They come from cached outlined canvas textures.
- **Lower body:** striped pants with a belt, socks and cleats.
- **Helmet:** shell with a crown stripe, a facemask (two bars plus a centre bar), chin cup and strap, and side decals.
- **Other:** gloves and three skin tones.
- **Joints:** limbs hang from hierarchical pivots: hips → thighs → knees, spine → head and shoulders → elbows → hands.
- **Draw calls:** parts are merged per bone with vertex colours. All players share 2 materials, plus one number texture per jersey number, with a cheap rim light. Each player is 12 meshes.
- **Graphics Low:** a simpler model with 8 meshes (single-piece arms and legs, no shoulder numbers, lower tessellation).
- **Auto on software GL:** the same jointed model with lighter tessellation and fewer shadow casters.

**Animation** lives in the `animateActor` block in `game3d.js` and is render-side only. Sim results are unchanged.
- **Motion:** driven by smoothed velocity, with a limited turn rate and damped blending between poses.
- **Stances:** 3-point (OL/DL), 2-point (WR/TE/LB), QB under center or in shotgun, and DB press or off.
- **Running:**
  - Run cycle with stride and cadence scaled to speed, leaning into acceleration, and hips and shoulders counter-rotating.
  - Head tracking (the QB scans the progression; defenders watch the QB or the ball).
  - Cuts plant the outside foot.
  - Backpedal, shuffle and deceleration poses.
- **Line play:**
  - OL kick-slide with hands engaged.
  - DL swim, bull, rip or club-rip arms, driven by each rusher's move in `sim.prot.rows`.
- **QB:** drop-back, then the throwing motion keyed to the release time (`sim.throwInfo.time`).
- **Ball carriers:** RB handoff mesh and tuck; the ball follows the carrier's or QB's actual hand.
- **Catch:** hands go up to the ball, and the ball stays in the receiver's hands after the catch.
- **Ends of plays:**
  - The tackle and fall pair the carrier with the nearest defender.
  - A sack takes the QB down backwards.
  - Everyone else settles to hands on hips.
- **Defence plays on the ball:** PBU jump; INT leap, ball in hand and celebration on the new rig; the QB puts his hands on his helmet.

**Test hooks** are inert unless set:
- `window.__timeScale` slows or freezes the presentation.
- `window.__camOverride = {pos, look}` frames a close-up.

**Tests:**
- `node tests/playwright-v7.cjs` checks the rig, the Low model, sack/INT, hit areas and badges, flat geometry, and JS errors.
- It also writes the `screenshots/v7-*` close-ups, both camera options, and the contact sheets `v7-contact-run-cycle.png` and `v7-contact-throw.png` (stitched by `tests/contact-sheet.py`, which needs Pillow).

## v8: Pocket IQ shell and accurate scale

The sim now opens on a home screen and plays in sessions, closer in spirit to app-style QB trainers. Research notes are in `docs/crucible-research.md`; Pocket IQ uses only original names, text and art.

### What's new

- **Home screen:** pick a mode, a level, a playbook (full or a single concept) and Scored or Practice, then press ▶ PLAY. The screen also shows your Pocket IQ rating and progress chart, plus tiles for Practice, Film Room, Daily Coverage, Bests, Achievements and Free play.
  - Automated browsers skip the home screen so the older suites run unchanged. Add `?home=1` to force it, or `?home=0` to hide it.
- **Sessions:** 10 reps, with a slim HUD chip ("rep 3/10 · College"). The in-game settings selects are hidden during a session.
- **Summary screen:**
  - stats: SIM average (ring), coverage ID %, read %, average decision time, INTs, best and worst rep
  - seven traits: pre-snap, progressions, decision speed, accuracy, ball security, pocket presence, football IQ
  - an SVG chart of session SIM against your rating
- **Rating:** after each scored session, `rating = 0.7·rating + 0.3·avg·levelMult`.

| Level | Rating multiplier |
|---|---|
| Youth | 0.8 |
| HS | 0.9 |
| College | 1.0 |
| Pro | 1.1 |

- **Levels:**

| Level | Pre-snap timer | Pocket time | Disguise | Timing slack | INT multiplier |
|---|---|---|---|---|---|
| Youth (new) | 15 s | ×1.45 | none | 0.75 | ×0.45 |
| High School (was Rookie) | 12 s | ×1.3 | none | 0.6 | ×0.6 |
| College (was Starter) | 8 s | ×1.0 | 0.4 | 0.4 | ×1.0 |
| Pro | 5 s | ×0.85 | 0.85 | 0.25 | ×1.4 |

  - Averaging 70+ in a scored session at your highest level unlocks the next one.
  - The internal ids `rookie`/`starter`/`pro` are kept for compatibility.
- **Achievements:** 15 of them, including clean sheet, SIM 80/90, coverage master, perfect progressions, quick trigger, 5 and 10 good reps in a row, level reached, 3- and 7-day streaks, quiz count and a perfect daily.
- **Film Room:**
  - coverage-family quiz on top-down diagrams built from a real engine sim. The reveal shows deep zones, underneath zones, man lines and rushers.
  - "Where does the ball go?" concept quiz, with routes drawn and the answer highlighted
  - Daily Coverage: 5 looks seeded by date, one attempt per day
  - Coach cards for every coverage (with a diagram, tell, post-snap and how to attack it), every blitz and every protection
- **Practice:** pick a concept and a specific look, or Random across every look that concept is drawn against. You rep it endlessly, unrated, and can end it from the HUD chip to see a summary.
- **Bests:** top 10 scored sessions and personal bests per level. These are local-only and stored in this browser under the localStorage key `pocketiq.v8`.
- **Rep feedback:**
  - SIM score ring
  - ✓ Saw / ✗ Missed for coverage, pressure and best read, with the tell for anything missed
  - decision-time bar with the on-time window
  - the best receiver highlighted, as before
- **Stadium:** crowd texture on the stands and LED ribbon boards. The crowd texture is skipped on Low/light graphics.
- **Scale:** see `docs/scale-audit.md`.
  - realistic field markings, goal posts and ball size
  - player heights by position
  - OL splits compressed on the render side only, so engine results are unchanged
  - new "QB eye level" camera
  - **K** opens the scale debug overlay; **Shift+K** shows the raw engine spacing.

Tests: `node tests/playwright-v8.cjs` produces the screenshots `screenshots/v8-*.png`.

## v9
- **Ball always visible** – root cause: a v8 comment swallowed `ball.add(ballMesh)`, so the ball group was empty. Now: 1.25× base, 1.5× in flight, laces/stripes, 14-point trail, stronger shadow. Test: `tests/playwright-v9-ball.cjs` (projection + hide/show pixel diff, both cameras).
- **Defender AI** – reaction delay, QB-eye safeties, LB sink, Cover 3 Match/Quarters pattern-match, man trail/mirror, catch-point breaks, acceleration-limited movement, per-level react/discipline. See `docs/defender-ai.md`.
- **Instant result** – caption (COMPLETE +N / INCOMPLETE / INTERCEPTED / SACKED…) pops the same frame the result lands; grade panel shown immediately; analysis precomputed 60 ms after the snap; no INT wait.
- **Catch & YAC** – hands to ball, cushion, YAC carry 0.8–1.9 s to tackle/out of bounds, then auto-replay; drop/tip/miss loose-ball animations. YAC is **cosmetic**: the engine result (yards) is not changed.
- **Routes** – thick outlined screen-space overlay with arrowheads coloured by read; snap framing widens/dollies to include sideline routes; edge chips for off-screen receivers (clickable).
- **Click/tap throws** – throw on pointerdown any time after the snap (early throws allowed — bad timing is real); hit area ≥56 px desktop / 72 px touch, grows with player size, nearest wins, badges clickable, hover ring + faint target rings; HUD overlays no longer swallow input.
- **Home screen** – hero PLAY + rating ring, mode cards, level ladder, session/playbook/stadium, tiles for Film Room, Practice, Progress, Custom plays, Settings and more.
- **Stadiums** – Outdoor Bowl, Indoor Dome, High School (home screen + Settings, saved as `pocketiq3d.stadium`, live switch, field untouched, disposed on switch).
- Tests: `tests/playwright-v9-{ball,clicks,routes,catch,stadium-home}.cjs`; notes in `docs/v9-progress.md`.

## v10 — Smooth throws, every receiver, fronts & personnel, per-rep audibles, score ring

- **Throw/catch freeze fixed.**
  - Root cause: the rep analysis took 1–5 s of synchronous main-thread work. That was the audible EV table (the engine's bestRead probe over the called play plus every audible) and the protection table.
  - It ran just after the snap, so the game froze when you clicked a receiver and again when the ball arrived.
  - It now runs in a Web Worker (`js/analysis-worker.js`) that starts pre-snap. The result panel shows right away and the grade fills in. Audible scores are baked (`js/audible-ev.js`), so grading is instant.
  - Test: `tests/playwright-v10-freeze.cjs`. It uses real pointer clicks, checks rAF gaps and long tasks, and also runs under a 4× CPU throttle.
- **Every receiver is clickable on every play.**
  - All WR/TE/RB are eligible from snap to throw, including off-progression receivers and kept blockers who release.
  - The classic-camera chip de-overlap no longer oscillates and stacks chips on top of each other.
  - Every eligible receiver gets a 3D target ring.
  - Test: `tests/playwright-v10-receivers.cjs`.
- **Defensive fronts and personnel** (`js/defense.js`, research in `docs/defense-research.md`).
  - 22 alignments in 4 families:
    - 4-down: Over, Under, 4-3 Over/Under, Wide-9, Even, Dime, NASCAR.
    - 3-down: Tite, Okie, Stack, 3-3-5, Okie-drop, Penny, Dollar, Quarter.
    - Heavy: Bear 46, 5-2 Eagle, Goal line.
    - Sub: Double-mug, Psycho/Amoeba, Tilt.
  - Personnel ranges from 4-3-4 to 0-5-6, and stance differs between hands-down and stand-up players.
  - The front is picked from the offensive personnel and the situation.
  - New optional **FRONT** picker in the Coverage panel, graded +2 for the family and +1 for the exact front.
  - The result shows the front with its personnel and tell.
  - Film Room has a **Front quiz** tab and front coach cards.
  - Front × protection sack-time table: `docs/v10-front-sack.txt`. Coaching point: slide toward a stand-up edge, because BOB/MAN leaves him free.
- **Audibles change every rep.**
  - Each rep offers 4–5 options from 18 concepts, including the new Mesh, Flood, Dagger, Curl-flat, Drive, Bubble and Y-cross.
  - Every menu has at least one strong option and at least one bad one, scored by baked engine EV. Each option carries a one-line description.
  - Test: `tests/playwright-v10-audibles.cjs`.
- **Post-rep score ring is upright.**
  - Root cause: the v9 home-hero CSS `.pi-ring{rotate(-90deg)}` also matched the rep ring.
  - It now uses its own class, is compact, and sits in a grid column so it never covers other text.
  - Test: `tests/playwright-v10-ring.cjs` (4 viewports).
- **Front × protection table:** `docs/v10-front-sack.txt` (summarised in `docs/defense-research.md` §5). Odd and light-box fronts beat BOB/MAN with a free stand-up edge, so slide to him. Bear/Eagle beat half-slide.
- **Stats:** `docs/v10-bake-reads-*.txt`, `docs/v10-int-stats-fronts.txt`, `docs/v10-sack-matrix.txt`. With fronts off, the default numbers are unchanged from v9.
- **Screenshots:** `screenshots/v10-*.png` (not included in the zip).

## v11 — Coverage-first IDs, tighter deep coverage, simpler result panel, realistic routes

- **Fronts out of the prediction bubble.** Identifying the front was too slow/hard in the rep flow. The Coverage bubble is coverage (+ variant) only again; fronts still *align* the defense every snap and remain in Film Room (quiz + coach cards).
- **Deep routes no longer cruise open.** Defender AI: DBs match WR speed (7.55 vs WR 7.4), deep zones stay on top of verticals (outside thirds prefer #1, middle helps posts), man trail/press, clear-outs still covered. Posts 75%→0% open; man shells much tighter. Tables: `docs/v11-deep-open.md`.
- **Simpler post-rep panel.** Headline + one-line why, upright SIM ring, three short sections (What you saw / Best read / Coverage ID), everything else behind **More details**.
- **Route audit.** Stick fixed (#2 stick @ 5–6 with sit, #1 clear, flat stretch). Flood/curl-flat/mesh templates corrected. Full notes: `docs/route-audit.md`.
- **Tests / screenshots.** `playwright-v11-panel.cjs`, `tests/v11-stick-deep.cjs` (Stick + deep-open targets), updated v10 fronts/ring/freeze. Screenshots: `screenshots/v11-*.png`.
- **Known gaps.** Cover-3 seams / clear-out gos stay intentionally open (beaters). Boot protection paths and pulling OL remain abstracted. Classic camera framing assist can pull FOV to ~80° on wide concepts.

## v12 — Pre-v11 analysis overlay, Crucible-style reads, feel, Call it / Just read, menu

- **Analysis coverage overlay restored.** Result/replay shapes again use authored zone landmarks + pre-snap man/rush lines (`job0` / `sx0`), not live-mutated jobs after the throw. Live v11 defender AI unchanged. See `docs/v12-progress.md`.
- **Correct read like Crucible (original names).** Contour closed/open/man + concept tables + read keys in `js/reads.js`; hot still overrides; probe is fallback. Sources/gaps: `docs/crucible-reads.md`.
- **Feel.** Snappier WR/DB speeds, accel, man lag, ball — `docs/v12-feel.md`.
- **Game types.** **Call it** (predict coverage/pressure, full grade) and **Just read** (no prediction bubbles; grade read/timing/result only; coverage revealed after). Persisted as `pocketiq3d.gameType`.
- **Menu.** Hero → Game type → Mode/Level → Session/Stadium → tiles. Screenshots: `screenshots/v12-menu-*.png`.
- **Tests.** `v12-reads`, `v12-overlay`, `playwright-v12-modes`, `playwright-v12-overlay`.

