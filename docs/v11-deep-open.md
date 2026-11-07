# v11 — Deep-route open rates (before → after defender AI)

Measured: share of deep receivers (go/post/corner/fade/dig/seam/…) with catch-point sep ≥ 2.4 yd when thrown at the play's idealTime (N=24, seed-stable).

Open clear-out gos and Cover-3 seams are *supposed* to be open (beaters / decoys). Man coverage and posts into help should not be.

| Coverage | Before open% | After open% | Before avgSep | After avgSep |
|---|---:|---:|---:|---:|
| cover2man | 100.0 | 0.0 | 2.53 | 1.85 |
| cover3buzz | 100.0 | 100.0 | 6.69 | 5.1 |
| tampa2 | 100.0 | 100.0 | 5.52 | 6.84 |
| cover3rot | 100.0 | 100.0 | 5.19 | 4.65 |
| palms | 100.0 | 100.0 | 6.19 | 5.27 |
| cover3 | 100.0 | 80.0 | 6.45 | 4.69 |
| cover2 | 100.0 | 40.0 | 6.12 | 2.87 |
| cover3cloud | 60.0 | 80.0 | 4.09 | 3.69 |
| cover4 | 58.3 | 58.3 | 3.61 | 3.03 |
| cover1 | 50.0 | 31.3 | 2.08 | 1.65 |
| cover6 | 50.0 | 50.0 | 2.32 | 3.11 |
| cover1robber | 50.0 | 0.0 | 1.92 | 1.57 |

## Route highlights
- Posts: 75% → **0%** open (FS/corner help).
- Man (cover1/2man/robber): much tighter (cover2man 100%→0%, cover1 50%→31%).
- Outside gos vs Cover 3: corners now stay on #1 instead of jumping seams.
- Cover 3 seams still often open — correct Four-Verts beater.
- avgSep on gos down from ~5–6 to ~3.3 (tighter windows).
