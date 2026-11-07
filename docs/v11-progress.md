# v11 progress (owner msg pt14u)
Backup: /tmp/qb-v10-backup (v10 tree, screenshots/node_modules stripped). Started ~9:24 AM ET Nov 5.

## Plan
1. Remove Front picker from Coverage bubble + Coverage ID grading (keep fronts as alignments; Film Room optional).
2. Defender AI — deep routes too open; diagnose, fix depth/speed/technique, before/after tables.
3. Simplify post-rep result panel (headline + ring + 3 sections + More details).
4. Route-concept audit (Stick first) → docs/route-audit.md; re-bake.
5. Full regression sequentially; new tests.
6. Screenshots, README, zip.

## Status
- Backup done.

## Step 1 — Fronts out of prediction bubble (done)
- Removed FRONT UI from `#pop-cov` (index.html).
- Restored coverage-only weights in `grading.js` (no front points / info lines).
- Removed `buildFrontPicker` from game3d; fronts still align via `state.front` + `defense.js`.
- Film Room front quiz + coach cards kept.
- Test: playwright-v10-fronts updated for "no picker".

## Step 2 — Defender AI (in progress → after-ai3)
- Root cause: DB_SPEED 7.0 < WR 7.4; deep zones raced to landmarks past WRs; corners jumped seams (eyes + scoring); clear-outs with read=-1 ignored.
- Fixes in engine.js: DB 7.55, DEEP_DROP 7.2; deep carry verticals; outside thirds prefer #1; eyes only for middle deep; ignore blockers not clear-outs; press/trail man.
- Tables: docs/v11-deep-open-before.txt, after-ai3.txt, summary docs/v11-deep-open.md.

## Step 3 — Result panel (done)
- Headline + why line, SIM ring, 3 sections (What you saw / Best read / Coverage ID), More details expander.
- Screenshots via playwright-v11-panel.cjs.

## Step 4 — Route audit (done core)
- Stick fixed (playbook + template + route sit). Flood/curl-flat/mesh templates corrected.
- docs/route-audit.md.

## Resume checkpoint (2026-11-05 ~10:15 ET)
- Steps 1–4 done; stick/deep unit test added: `tests/v11-stick-deep.cjs` (ALL PASS).
- Fixes in flight for remaining flaky suites: ball depthTest:false; v6 mid.dz bound <18 with framing assist.
- Next: re-run failed alone (v9-ball, v9-routes, v8, v6, v3) then full sequential list into /tmp/rt11.
- Screenshots + zip still pending after green regression.

## Resume checkpoint (2026-11-05 ~10:21 ET)
- Alone re-runs GREEN: v9-ball, v9-routes, v8, v6, v3 (see /tmp/rt11/summary-failed.txt).
- Fixes: ball depthTest:false + wider ballCheck; v6 mid.dz<18; v3 INT wait hardened; stick-deep unit test passes.
- Next: full sequential regression (ordered list), then screenshots, README confirm, node --check, zip.

## Resume checkpoint (2026-11-05 ~10:45 ET)
- Full sequential /tmp/rt11/summary-full.txt: most green; alone-failures were v10-freeze (1 edge click under 4x throttle), v10-receivers (1 smash_c6 Z race), v9-ball classic incomplete px=0.
- Patches: ball transparent/depthWrite false; overlay named; ballCheck hides overlay + on-canvas clip; HIT_DESK 64; receivers click while paused; freeze retry/nudge under throttle.
- Next: re-run those 3 alone, then screenshots + zip.

## Final (a–d) — 2026-11-05 10:52 AM ET

### (a) Regression (/tmp/rt11/summary-full.txt + fix3)
| Suite | Result |
|---|---|
| v11-panel | PASS |
| v10-freeze | PASS (after edge-click nudge under 4× throttle) |
| v10-receivers | PASS (click while paused; was 38/39 smash_c6 Z race) |
| v10-ring | PASS |
| v10-audibles | PASS |
| v10-fronts | PASS (no front picker) |
| v9-clicks | PASS |
| v9-catch | PASS |
| v9-ball | PASS (transparent ball + meas boost; classic incomplete fixed) |
| v9-routes | PASS (overlay + framing; classic FOV assist) |
| v9-stadium-home | PASS |
| v8 | PASS (3-section panel) |
| nextrep | PASS |
| v7 | PASS |
| v6 | PASS (mid.dz bound <18 with framing assist) |
| v5 | PASS |
| v4 | PASS |
| v3 | PASS |
| v11-stick-deep | PASS |

Routes overlay + all-receiver clicking confirmed green with revised routes/defense.

### (b) Deep-open + Stick
- `tests/v11-stick-deep.cjs`: Stick stem 5.5 sit; stick_c3 H/Y/Z; STICK template; man ≤40%, posts ≤25%, C3 progression go ≤70%, C1 ≤45% — ALL PASS.
- Before→after: posts 75%→0%, cover2man 100%→0%, cover1 50%→31%, go avgSep ~5→3.3. See docs/v11-deep-open.md.

### (c) Screenshots
- screenshots/v11-panel-{desktop,laptop,phone}.png (+ prior 1280/390/844)
- screenshots/v11-stick-routes-*.png / v11-stick-presnap.png
- screenshots/v11-cov-no-front.png (+ viewport variants)

### (d) README / check / zip
- README v11 section updated.
- node --check: all js + tests clean.
- /workspace/qb-sim-3d.zip rebuilt without screenshots/ or node_modules.

### Known gaps
- Cover-3 seams / clear-out gos intentionally open (beaters).
- Boot protection + pulling OL abstracted.
- Classic framing assist may widen FOV to ~80° on wide concepts.
- INT 0.1s pixel check can need meas boost under SwiftShader (ball still in hands).

