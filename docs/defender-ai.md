# v9 Defender AI (js/engine.js `stepDefender`)

Goal: defenders that *process* (eyes, reaction time, rules) and *move* (finite acceleration) like Crucible-style AI, without changing how plays are graded.

## Processing
- **Reaction delay** – after the throw each defender "sees" it only after `react` (+ a per-player jitter scaled by `1.3 - disc`). Level tuning (game3d `DIFF`): youth 0.50/0.55, rookie 0.40/0.70, starter 0.30/0.82, pro 0.20/0.95 (`react`/`disc`).
- **QB eyes** – deep-zone defenders shade toward the QB's current progression read (×0.22×(1.3−disc), ≤3 yd). Undisciplined safeties get pulled more, so looking off a safety works.
- **LB sink** – hook/curl defenders (zone spot 5–11 yd) sink up to 2 yd as the QB holds the ball.
- **Match rules** – for Cover 3 Match / Quarters / Cover 4 / Cover 6 (`/MATCH|QTR|C6|C4/`) zone lag drops to 0.32 s and deep players carry verticals (>9 yd, gaining fast) with feed-forward, i.e. pattern-match.
- **Man** – trail lag `MAN_LAG×(1.15−0.3·disc)`, small trail cushion that shrinks over the route, velocity feed-forward (mirror) and a closing burst when >0.6 yd behind.

## Catch point / after catch
- On the throw, eligible defenders (the target's man defender, nearby man players ≤3 yd, zone players ≤9 yd that aren't underneath a throw over their head) break to a point just short of the catch spot. The covering defender breaks at full speed + 0.3; others at `DB_SPEED × 0.45 × (deep 0.7 | under 1.1)`. Weight ramps over 0.35 s.
- Pursuit after the catch is in the renderer's post-play plan (cosmetic, see README: YAC animation doesn't change the engine result).

## Movement
`drive()` – acceleration-limited steering (accel 15, decel 20 yd/s²) with arrive behaviour and optional velocity feed-forward. Receivers in the engine run routes at constant speed, so defenders keep sharp but finite acceleration.

## Debug ablation hooks (Node only, ignored in browser)
`V9X` env letters disable parts: B break, E eyes, S sink, M match, K old instant movement. `V9BV` overrides BREAK_V.

## Numbers (tests/int-stats.cjs, ontime-best comp / INT)
| level | v8 | v9 |
|---|---|---|
| rookie | 66.2% | 68.4% / 1.2% |
| starter | 65.1% | 67.8% / 2.1% |
| pro | – | 66.1% / 3.4% |
Late (+0.9 s) best: v9 42.8 / 40.6 / 38.1% with INT 8–18% → bad timing is punished. Authored plays' on-time best (/tmp/quick.cjs sample): ~92.7%. bake-reads: 29 ok / 10 DIFF (v8 30/9). sack-matrix unchanged.
Note: int-stats now passes each level's react/disc (previously the defaults).
