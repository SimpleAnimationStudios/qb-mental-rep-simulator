# v9 progress
backup: /tmp/qb-v8-backup

## Step 1 — ball (done)
Root cause: v8 scale-fix comment `// v8: true size ...` was on the same line as `ballMesh.castShadow = true; ball.add(ballMesh);`, so the mesh was never parented → invisible in all phases.
Fix: re-added; readability scale 1.25 held / 1.5 in flight / 1.45 carried; white laces + stripes; 14-pt flight trail; bigger shadow; camera near 0.05.
Test: tests/playwright-v9-ball.cjs (projection + hide/show pixel diff) both cameras.

## Step 2 — instant result caption + post-play (done)
#caption pops in grade() (same frame as sim done). Result panel shown immediately (INT too); evals/protection table precomputed 60 ms after snap (state.pre).
Auto replay starts after the post-play anim (YAC dur + 0.9 s) / INT celebration (3.0 s) — never gates the panel.
Post-play (render-only): YAC run to LOS+res.yards, pursuit angles, tackle/out of bounds; loose-ball physics for tipped/dropped/overthrown.

## Step 3 — clicks (done)
Root causes + fix documented at the input block in js/game3d.js. Window pointerdown, segment hit test 56/72 px (scaled), badges clickable, faint .tgt rings = exact hit area, .hov ring on hover. Decorative overlays pointer-events:none.
tests/playwright-v9-clicks.cjs: desktop 41/41, phone touch 54/54 incl. 0.0 / 0.2 s throws.

## Step 4 — routes (done)
Screen-space overlay canvas (#route-cv) with outline+glow+arrowheads+read labels, constant px width; 3D ribbons lifted.
Framing assist: FOV 62→≤80 + adaptive dolly so eligible receivers' first 1.2 s of route are framed at the snap (both cams).
Edge chips for off-screen receivers (clickable). tests/playwright-v9-routes.cjs.

## Step 5 – Defender AI (done)
See docs/defender-ai.md. int-stats starter ontime-best 67.8% (v8 65.1%), late 40.6%; bake 29/10; sack-matrix identical. Logs: /tmp/v9-int-c.txt, /tmp/v9-bake-c.txt, /tmp/v9-sack-c.txt.

## Step 6 – Stadiums (done)
`setStadium(key)` in game3d.js builds bowl / dome / hs surroundings into a `stadium-*` group inside fieldGroup; turf, apron, borders, goal posts untouched (test compares field children before/after). Instanced boxes/cones; Graphics Low drops crowd textures and lowers counts; old group fully disposed (geometries, materials, textures). Key `pocketiq3d.stadium`. Selectors: home (`[data-stadium]`) and settings (`#set-stadium`). Test: tests/playwright-v9-stadium-home.cjs (geometry/texture counts flat over 40 switches+reps).

## Step 7 – Home screen (done)
Hero (rating ring + big PLAY + summary line + trend chart) → setup panel (mode cards, numbered level ladder with locks, Scored/Practice, playbook, stadium) → tiles (Film Room, Practice, Progress, Custom plays, Settings, Daily, Bests, Achievements, Free play). All old IDs/data-attributes kept (`#pi-play`, `[data-mode]`, `[data-lv]`, `[data-sc]`, `#pi-playset`, `[data-go]`), so v8/nextrep selectors needed no change; new: `.pi-ring`, `.pi-rung`, `.pi-mcard`, `[data-stadium]`, `data-go=progress|custom|settings` (open menu/designer/history above the home via `.pi-overhome`).

## Step 8 – Catch test (done)
tests/playwright-v9-catch.cjs + screenshots/v9-contact-catch.png, v9-incomplete-loose-ball.png, v9-early-throw-outcome.png.
