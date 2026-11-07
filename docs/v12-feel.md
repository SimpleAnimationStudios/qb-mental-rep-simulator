# v12 gameplay feel tunables

Goal: snappier, more “game-sim” movement (Crucible public notes mention progressive game-speed; we cannot inspect the app). Live v11 coverage AI rules kept; speeds/accel retuned.

## Constants (`js/engine.js` → `QBEngine.FEEL`)

| Tunable | v11 | v12 | Intent |
|---|---:|---:|---|
| WR_SPEED | 7.4 | 7.85 | Faster stems / sells clear-outs |
| DB_SPEED | 7.55 | 8.0 | Crisp close; still ≥ WR |
| ZONE_SPEED | 6.5 | 7.0 | Underneath drops arrive sooner |
| DEEP_DROP | 7.2 | 7.6 | Deeper pedal without floating |
| MAN_LAG | 0.32 | 0.22 | Tighter trail reaction to breaks |
| BALL_SPEED | 20 | 22 | Snappier flight |
| RELEASE | 0.15 | 0.12 | Quicker release |
| ACC_UP / ACC_DN | 15 / 20 | 22 / 28 | Less floaty accel/brake |
| BREAK_V | 0.45 | 0.55 | Harder break-on-ball |

## Before / after feel notes
- **Before (v11):** correct deep coverage, but zone drops and man trail felt a beat soft; routes a touch floaty at Youth/HS.
- **After (v12):** receivers get downfield sooner; DBs plant and drive more sharply; ball arrives quicker so on-time windows stay fair if the read is right.
- Balance check: deep-open targets from v11 stick-deep test should still hold (man ≤40%, posts ≤25%). Re-run after feel change.

## Not claimed
We do **not** claim pixel-identical Crucible physics — only public “game speed / progressive difficulty” guidance informed these knobs.
