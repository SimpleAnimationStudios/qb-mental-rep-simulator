# v12 progress (owner msg pt15u)
Backup: /tmp/qb-v11-backup (v11 tree, screenshots/node_modules stripped). Started ~1:06 PM ET Nov 5.

## Plan
1. Revert analysis/replay coverage overlay to pre-v11 look (authored landmarks; keep live v11 AI).
2. Crucible-style correct-read (contour + read-key / concept×coverage table); docs/crucible-reads.md.
3. Gameplay feel tunables → docs/v12-feel.md.
4. Two game types: "Call it" (predict) + "Just read" (no prediction); hub + grading.
5. Main menu reorganization (keep all controls).
6. Tests, sequential regression, screenshots, README, zip.

## Status
- Backup done.

## Step 1 — Overlay restore (done)
- Root cause: drawCoverage used live `d.job` / `d.sx` after throw (rush→tiny zone r=1, man lines from throw-time spots, resolved read jobs). v11 AI made end positions diverge → overlay looked wrong even though drawCoverage source matched v10.
- Fix: snapshot `job0` at createSim; drawCoverage uses `job0` + `sx0`/`sy0` for analysis/replay only. Live AI unchanged.
- Doc: this section + README v12.

## Step 2 — Reads (done core)
- `js/reads.js` + grading `correctRead`; docs/crucible-reads.md.

## Step 3 — Feel (done)
- docs/v12-feel.md; engine FEEL constants.

## Step 4 — Game types (done core)
- Call it / Just read in hub; localStorage `pocketiq3d.gameType`; grading skips cov ID in justRead; bubbles hidden via `#presnap.just-read`.

## Step 5 — Menu (done core)
- Hub v12 layout: hero → game type → mode/level → session/stadium → tiles.

## Next
- Tests v12-*, screenshots, regression, README, zip.

## Resume (~1:15 PM ET)
- Core 1–5 implemented; unit tests green; playwright modes/overlay green.
- Full sequential regression running → /tmp/rt12/summary-full.txt.
- After green: node --check, zip <25MB, final report.

## Final (a–e) — 2026-11-05 ~1:40 PM ET

### Overlay restore
- Cause: post-throw `d.job` / `d.sx` (rush→r=1 zone, man lines from throw spots).
- Fix: `job0` + `sx0`/`sy0` for analysis drawCoverage only.

### Reads
- `js/reads.js` contour + CONCEPTS; grading prefers table/read-key; hot/probe fallback.
- docs/crucible-reads.md

### Feel
- docs/v12-feel.md (WR 7.85, DB 8.0, MAN_LAG 0.22, ACC 22/28, …)

### Modes
- Call it / Just read; hub + grading + `#presnap.just-read`

### Menu
- v12 layout; screenshots v12-menu-before-v11.png / v12-menu-after.png

### Regression (/tmp/rt12/summary-full.txt)
All PASS except v9-ball flake fixed alone (force render in ballCheck) → PASS.

### Zip
/workspace/qb-sim-3d.zip without screenshots/node_modules.

