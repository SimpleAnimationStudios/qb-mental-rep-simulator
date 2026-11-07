# Crucible-style reads (v12) — sources, mapping, gaps

Pocket IQ uses **original names** and does not copy Crucible assets. This doc records public research and how we map it.

## Sources (public web only — iOS app not run)
- https://www.crucibletech.com/learn/qb-progressions/ (QB Progressions Explained; updated ~2026-10)
- FAQ on that page: progression = ordered reads tied to the drop; half-field vs full-field; **read key** = one defender whose move picks the throw; young QBs start with **MFC / MFO / man**, then contour picks the side, then a fixed order.
- Concept pages paraphrased publicly: Stick (horizontal stretch on flat defender), Snag (low-high on CB), Mesh (man→crosser, zone→settled), Sail (high-to-low three levels).
- Prior notes: `docs/crucible-research.md` (home/product pages, AFCA/Fitzpatrick interview).

⚠ We cannot run the Crucible iOS/Android app, so exact in-app correct-read tables are **unknown**. Our tables are coaching-faithful reconstructions, not reverse-engineered dumps.

## Contour helper (`js/reads.js` → `contourOf`)
| Contour | Meaning (our terms) | Coverages |
|---|---|---|
| **closed** | One-high / MFC | Cover 3 family (sky, cloud, buzz, rot) |
| **open** | Two-high / MFO | Cover 2 zone, Tampa 2, Cover 4, Palms, Cover 6, dime C2 |
| **man** | Man / zero | Cover 0, Cover 1 / robber, Cover 2 man |

## Concept × contour table (summary)
Implemented in `QBReads.CONCEPTS`. Examples:

| Concept | Read key | closed pick | open pick | man pick |
|---|---|---|---|---|
| STICK | flat / apex | H (stick) | Y (flat) | H |
| SNAG / Spacing | CB | H (flat) | Y (spot) | Y |
| MESH | rat / trail | H (sit) | H | X (crosser) |
| SAIL / Flood | flat | Y (sail) | H (flat) | Y |
| SMASH | CB | X (hitch) | H (corner) | H |
| VERTS | FS | H (seam) | X (outside) | H |
| DAGGER | safety | Y (dig) | H (seam) | Y |

Full rules live in code. Stick also runs a **read-key nudge**: if the nearest underneath zone landmark is wider than the stick receiver → stick; else → flat.

## Grading integration
1. `resolveRead` / `applyReadKey` set the coaching answer.
2. If a free rusher beats protection → **hot** via `bestRead` (unchanged).
3. Custom / probed plays without a concept → `bestRead` fallback.
4. Authored `play.correct` is **not** preferred over the table when a concept matches (table is the teaching answer).

## Gaps / uncertainty
- Exact Crucible contour labels (MFC/MFO) and side-picking for trips vs 2×2 are paraphrased; we fold “side” into formation-authored progression order.
- Read-key leverage is landmark-based, not a full eyes-of-QB simulation of defender hips.
- Some play names (e.g. Flat-Curl) map to STICK by keyword — ⚠ may be coarse.
