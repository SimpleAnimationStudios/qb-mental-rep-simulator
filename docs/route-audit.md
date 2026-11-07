# v11 — Route / concept audit

Goal: every pass and run concept matches real football spacing, depths and reads. Sources mixed from coaching literature (Air Raid stick/mesh, West Coast curl-flat, Sail/Flood, Smash, Drive/Shallow Cross, Dagger, Y-Cross) and common college/NFL usage. Uncertain items flagged.

## Stick (fixed)
**Real concept:** Trips or 2×2. #2 (slot/TE) stems to **5–6 yards**, then sits/settles vs leverage. #1 outside **clears** (fade/go) or runs a speed-out. A third body (RB or #3) runs the **flat** to horizontally stretch the curl/flat defender. QB reads that defender: widens → stick; sits on stick → flat.
**Was:** `stick_c3` put the stick on Y (#3) and the flat on H (#2) — inverted. Stick route broke at 6 yd then stepped inside without a sit. Template put flat on the wrong side of the stick.
**Fix:** H = stick, Y = flat, Z/X = go clears; stick route `[[0,5.5],[1.2,5.5],[1.2,5.2]]`; template `Y stick + RB flat + Z go`. Doubles sticks use Y stick / RB flat / outside goes.
**Sources:** Air Raid "stick" (Leach/Mumme); AFCA / coaching clinics on stick-draw. ⚠ Exact stem depth varies 5–7 yd by system.

## Smash
**Real:** Outside hitch (~6) under a corner route (~10–12 break to 18) — hi-lo on a Cover-2 squat corner.
**In game:** hitch + corner on both sides — correct. Progression prefers the corner vs C2.
**Status:** OK. ⚠ Some systems use a speed-out instead of hitch.

## Four Verticals
**Real:** Four vertical stems; vs Cover 3 the seams put the middle safety in conflict; vs Cover 2 attack the hole / outside shoulder of the half safety.
**In game:** go/seam/seam/go — correct. Authored progression H,Y (seams) vs C3 is right.
**Status:** OK.

## Flood / Sail
**Real:** Three levels **to one side** — go (clear) / sail or corner (~12–14 out) / flat. Reads the flat/curl defender vertically.
**Was (template):** flat on H (left) while sail/go on the right — not same-side.
**Fix:** template now `Z go, Y sail, RB flat` (boundary flood). Playbook `flood_c3c` already had Y sail / H flat / Z go in trips — OK.
**Sources:** Sail concept (Air Raid); "flood" in many playbooks.

## Mesh
**Real:** Two shallow crossers from opposite sides that rub; a sit/option behind vs zone; often a corner/clear outside.
**Was:** H ran a curl (fine as sit) — renamed to explicit `sit` route for clarity.
**Status:** OK after sit route.

## Curl-flat
**Real:** Curl (~10–12) with a flat underneath — stretches the apex/curl-flat defender. Away side clears.
**Was:** three curls + flat — crowded.
**Fix:** X curl / H flat / Y stick / Z go.

## Drive / Shallow cross
**Real:** Shallow cross under a dig (~12) — high-low the hook; shallow runs from man.
**In game:** H shallow, X dig, Y seam clear — correct.
**Status:** OK.

## Dagger
**Real:** Seam clears the safety, dig behind the hook (Cover 4 / quarters beater).
**In game:** H seam, X dig — correct.
**Status:** OK.

## Y-Cross
**Real:** Deep crosser (~15) from the TE/slot, flat underneath, post/go clears.
**In game:** Y cross, H flat, X go, Z post — correct.
**Status:** OK.

## Bubble / screens
**Real:** Slot bubble with outside stalk blocks; RB screen with OL releasing.
**In game:** bubble + stalk; rbScreen — correct. ⚠ Blocking angles are simplified.

## Levels
**Real:** Two crossers at different depths (e.g. 6 and 12) to high-low a zone.
**In game:** present as dig/shallow variants — OK.

## Texas / choice vs man
**In game:** mesh-like / option routes vs man — OK for training purpose.

## Play-action / boot
**In game:** deepOver, bootlegs with PA bite on LBs — OK. ⚠ Boot protection path is simplified.

## Hot / quick game
Slants, quick outs vs pressure — OK.

## Runs (IZ, OZ, Power, Counter, Draw, Toss)
Alignments and box-count coaching lines are coarse but directionally right. ⚠ Pulling OL paths are abstracted in `runplay.js`.

## Spacing / depth notes applied engine-wide
- Stick stem 5.5 yd (was 6 with no sit).
- Corner still breaks ~10 → 18; dig ~12; curl ~11; seam vertical.
