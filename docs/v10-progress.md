# v10 progress (owner msg pt13u)
Backup of v9: /tmp/qb-v9-backup. v9 suites all passed before v10 started (v3–v8, nextrep 24 reps, v9-*).

## Step 1b — all receivers targetable (done)
- eligible(): every WR/TE/RB from snap to throw (runs: RPO target only). engine throwTo accepts off-read + kept blockers (blocker releases to flat). grading "not in progression" notes.
- Root cause of classic-camera misses: edge-chip de-overlap oscillated (direction recomputed per iteration, ±32 px flipped around h/2), leaving X/H chips stacked so H's chip covered X. Fixed: direction fixed once, 40 px step, clamped.
- tests/playwright-v10-receivers.cjs: ALL PASS both cameras (39 plays each).

## Step 5 — SIM score ring (done)
- Root cause: v9 home hero added `.pi-ring{transform:rotate(-90deg)}` (hub.js:94); the post-rep ring (hub.js `ring()`) reused class `pi-ring`, so the WHOLE svg incl. the number rotated -90° (sideways text, arc starting at 9 o'clock).
- Fix: rep/summary ring uses class `pi-sring` with transform:none; only the arc circle has rotate(-90) → starts 12 o'clock, fills clockwise. Compact 72px (56px on short landscape), grid `72px minmax(0,1fr)` so text never runs under it.
- Big result caption (SACKED/INTERCEPTED) is centred over the field area (left of the result panel) on narrow landscape screens.
- 3D target rings now shown under every eligible receiver (not just progression).
- tests/playwright-v10-ring.cjs: 4 viewports × pass/INT/sack/run: ALL PASS; screenshots v10-ring-*.png.

## Step 4 — dynamic audibles (in progress → see below)
- modes.js: 7 new concepts (Mesh, Flood, Dagger, Curl-flat, Drive, Bubble, Y-cross) + desc per concept; `audibleTree(play, mode, rep, avoid)` builds a 4–5 option menu per rep (1 strong fit, 1–2 poor fits, rest marginal, display order shuffled), seeded by play|mode|rep (own PRNG — never touches Math.random/sim rng, so daily/seeded quizzes are untouched), avoids the previous rep's menu.
- Fit = baked engine EV delta vs the called play (js/audible-ev.js, built by tests/bake-audibles.cjs — the heuristic matchup table only agreed with EV 7/17, so EV is baked) with heuristic fallback for custom plays.
- `M.audibleEvals` grades from the baked table instantly (worker still used for custom plays / protection table).
- UI: "Keep play" + options each with name + RUN/PASS · description.

## Step 4 — Dynamic audibles (DONE)
- js/audible-ev.js holds the engine EV baked for each template (tests/bake-audibles.cjs, 4 shards + merge, 50 plays). The menu fit is EV minus the original's EV, plus noise. Each menu has 1 good, 1–2 bad and the rest marginal options, seeded by play|mode|rep, with no immediate repeats.
- tests/playwright-v10-audibles.cjs: ALL PASS. Screenshots: v10-audible-panel.png, v10-audible-result.png.

## Step 3 — Fronts (DONE)
- js/defense.js has 22 fronts. The engine applies them (front first, then the blitz set). The Front picker sits in the Coverage panel and is graded (+2 family / +1 exact, total capped at 20).
- runplay shows the front name. hub.js has a Film Room "Front quiz" tab and front coach cards; the diagram draws down linemen as squares.
- 3D tells: down vs stand-up stance comes from `down`, and alignment from tech offsets.
- Fixed two syntax breaks in game3d.js from the integration edit (a swallowed `add()` call and the caption reset). The page had failed to load.
- tests/playwright-v10-fronts.cjs: ALL PASS. Screenshots: v10-front-{8 fronts}, picker, quiz, cards.
- docs/defense-research.md is written.

## Wrap-up (in progress, 4:25 PM ET)
- Stats refreshed (generated about 4:00 PM ET, after the fronts integration):
  - `docs/v10-bake-reads-default.txt`: 29 ok / 10 diff, identical to v9.
  - `v10-bake-reads-fronts.txt` (FRONT=auto): 27 / 12.
  - `v10-int-stats-fronts.txt`: on-time best 63.8% comp / 2.5% INT, vs v9 legacy 67.8 / 2.1.
  - `v10-sack-matrix.txt`: identical to v9 for the default alignment.
- Front-sack table added to defense-research.md §5 and to the README.
- v10-ring test: the "upright" check used a text-bbox aspect ratio that fails for a single-digit sack score. It now checks that the svg and text carry no transforms (a deliberate test change).
