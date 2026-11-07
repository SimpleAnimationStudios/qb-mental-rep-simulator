# v10 — Defensive fronts, personnel & schemes (research notes)

These notes are the basis for `js/defense.js` (22 fronts in 4 families), the in-game Front picker, the Film Room front quiz and coach cards, and the front × protection sack table (`docs/v10-front-sack.txt`).

## 1. Vocabulary
- **Personnel** is written DL-LB-DB: 4-3 (base), 4-2-5 nickel, 4-1-6 / 3-2-6 dime ("dollar"), 3-1-7 quarter, 3-3-5, and 5-2/6-1 heavy. A 3-4 has three down linemen and four linebackers, and the two outside linebackers usually stand up on the edge. *Sources: viqtorysports.com/football-defenses-explained/ , viqtorysports.com/what-is-the-3-4-defense-in-football/ , cfbtrack.com/football-formations/defense*
- **Front vs. personnel:** the same 11 players can align in different fronts. For example, nickel personnel can play Over, Under, Wide-9, Tite or Mug. A front is the alignment of the box: the techniques of the down linemen and where the linebackers stack. *Source: coachtube.com/course_lesson/the-football-handbook/understanding-defensive-fronts/12602741*
- **Technique numbering (Bear Bryant system):**
  - 0 is head-up on the center, 1 is the center–guard shade, 2i is the inside eye of the guard, 2 is head-up on the guard, and 3 is the outside shade of the guard.
  - 4i, 4, 5, 6 (head-up on the TE), 7 and 9 continue outward, with 9 the wide shade of the TE.
  - *Sources: gbmwolverine.com/2008/02/27/coaches-corner-defensive-fronts-and-techniques/ , little-fog-6742.bss.design/DLINE%20ALIGNMENTS.html , espn.com/ncf/columns/davie/1460709.html*
  - ⚠ The numbering varies by school. Some staffs swap 4/4i or 6/7. The game uses one consistent table (`TECH` in defense.js).
- **Strength:** Over and Under are set to the offensive strength (the TE side, or the side with more receivers) or away from it. `strengthOf()` implements this, and `slot()` mirrors the front when strength is to the left.

## 2. Fronts modeled
| id | family | front | pkg |
|---|---|---|---|
|NICKEL_OVER|EVEN|4-2-5 Nickel Over|Nickel|
|NICKEL_UNDER|EVEN|4-2-5 Nickel Under|Nickel|
|OVER43|EVEN|4-3 Over (base)|Base 4-3|
|UNDER43|EVEN|4-3 Under (Sam on the line)|Base 4-3|
|WIDE9|EVEN|4-2-5 Wide-9|Nickel|
|EVEN_G|EVEN|4-3 Even (2i–3)|Nickel|
|DIME416|EVEN|Dime 4-1-6|Dime|
|NASCAR|EVEN|NASCAR (four edge rushers)|Dime|
|TITE|ODD|Tite / Mint (4i-0-4i)|Nickel (3-3-5)|
|OKIE|ODD|3-4 Okie (5-0-5)|Base 3-4|
|STACK404|ODD|3-4 Stack (4-0-4)|Base 3-4|
|ODD335|ODD|3-3-5 Odd Stack|Nickel (3-3-5)|
|OKIE_DROP|ODD|3-4 Okie, drop the OLB|Base 3-4|
|PENNY|ODD|Penny (5-1, Fangio)|Penny (3-3-5)|
|DOLLAR|ODD|Dollar 3-2-6|Dollar|
|QUARTER317|ODD|Quarter / prevent (3-1-7)|Quarter|
|BEAR46|HEAVY|46 / Bear (3-0-3 covered)|Base (46)|
|EAGLE52|HEAVY|5-2 Eagle|Heavy 5-2|
|GOAL62|HEAVY|Goal line 6-1 (jumbo)|Goal line|
|MUG245|SUB|2-4-5 Double-mug|Nickel (2-4-5)|
|PSYCHO|SUB|Psycho / Amoeba (0 down)|Dime (amoeba)|
|NICKEL_TILT|SUB|3-3-5 Tilt (tilted nose)|Nickel (3-3-5)|

Key facts behind each family:
- **EVEN (4 down):**
  - Over and Under (the 3-tech goes to or away from strength).
  - Wide-9: the ends are wide to speed-rush and the backers are the run fit.
  - Even/G (2i–3).
  - NASCAR: four edge rushers on passing downs.
  - *Sources: viqtorysports, espn Davie column, bigblueview.com (Giants' Wide-9 and NASCAR usage)*
- **ODD (3 down):**
  - Okie (5-0-5).
  - Tite/Mint (4i-0-4i), the modern answer to spread runs.
  - Stack 4-0-4.
  - 3-3-5 Odd Stack with stacked pressures. *Source: xandolabs.com (odd-stack pressures)*
  - Fangio-style light boxes. The Penny/Dollar fronts have two high safeties and a 5-man light box; the Eagles under Fangio played light boxes on roughly 73.5% of snaps. *Sources: readoptional.com/p/the-book-of-fangio-part-i-the-philosophy , inquirer.com Eagles/Fangio coverage, reddit r/cowboys Fangio personnel breakdown, nytimes.com/athletic/3311028*
- **HEAVY:**
  - 46/Bear: the 3-0-3 "covers" the center and both guards so slide protection can't double. *Sources: espn Davie, sportmentary.com*
  - 5-2 Eagle.
  - Goal line (jumbo).
- **SUB/exotic:**
  - Double-mug 2-4-5 (A-gap linebackers that show pressure). *Source: 247sports Muschamp breakdown*
  - Psycho/Amoeba: 0–1 down linemen with everyone standing and milling, the 9-up look. *Source: xandolabs.com*
  - Tilted-nose 3-3-5.

## 3. What the QB should read (implemented as `tell` / `why`, coach cards, grading)
- **Count the box:** with 5 in the box against 6 blockers, run it. With 7 or more, throw it or check to the quick game.
- **Find the stand-up edge:** a stand-up OLB may rush or drop. In the engine a stand-up edge is not treated as a DL by BOB/MAN rules (protections.js `isDL` uses `role`), so the right call is **slide to the stand-up edge**. The sack table shows BOB/MAN leaving a free rusher against wide stand-up edges (about 2.0–2.5 s), while slide or half-slide holds best.
- **Covered vs. uncovered guards:** Bear and Tite cover the center and both guards, which removes the double teams. Check to quick game or a gap scheme.
- **Mug or Psycho:** these alignments disguise who rushes. Hot routes and quick game beat them, and a full slide protection holds best.

## 4. Simplifications / uncertain points (flagged)
- GOAL62 is modeled as 6-1-4. Real goal-line packages vary (6-2-3, 6-3-2).
- Bear here rushes 5 by default. Many Bear calls rush 4 or 6.
- The offense-personnel to defense-front pairing (`PAIR` table plus `candidates()`) is a simplification of real call sheets. It adds goal-line fronts on short yardage and prevent on long yardage, and it excludes the drop, Psycho and goal-line fronts when a blitz is called.
- The front changes alignment, stance (`down`), role and rush. Coverage and blitz still come from the existing coverage and pressure tables, and a blitz `set` wins for pre-snap and job.
- The audible EVs (js/audible-ev.js) were baked against the default (legacy) alignment, not against every front.

## 5. Front × protection sack-time table
Generated by `node tests/front-sack.cjs` (mean time-to-pressure in seconds, base rush, no blitz). Full file: `docs/v10-front-sack.txt`.

```
front         pers   rush      BOB SLIDE_L SLIDE_R  HALF_L     MAN     SIX     MAX     HOT    CHIP
NICKEL_OVER   4-2-5     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
NICKEL_UNDER  4-2-5     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
OVER43        4-3-4     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
UNDER43       4-3-4     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
WIDE9         4-2-5     4    3.75    2.49    2.53    3.75    3.75    3.75    3.75    3.75   *3.89 
EVEN_G        4-2-5     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
DIME416       4-1-6     4    3.75    3.75    3.75    3.75    3.75    3.75    3.75    3.75   *3.89 
NASCAR        4-1-6     4    3.75    2.49    2.53    3.75    3.75    3.75    3.75    3.75   *3.89 
TITE          3-3-5     4    2.47f  *3.75    3.31   *3.75    2.02f   2.47f   3.31    2.02f   2.47f
OKIE          3-4-4     4    2.47f  *3.75   *3.75   *3.75    2.02f   2.47f   3.31    2.02f   2.47f
STACK404      3-4-4     4    2.47f  *3.75   *3.75   *3.75    2.02f   2.47f   3.31    2.02f   2.47f
ODD335        3-3-5     3    3.93    3.93    3.93    3.93    3.93    3.97    3.97    3.93   *4.15 
OKIE_DROP     3-4-4     3    3.93    3.93    3.93    3.93    3.93    3.97    3.97    3.93   *4.15 
PENNY         3-3-5     4    2.45f  *3.75    3.31   *3.75    2.00f   2.45f   3.31    2.00f   2.45f
DOLLAR        3-2-6     4    2.47f  *3.75    3.31   *3.75    2.02f   2.47f   3.31    2.02f   2.47f
QUARTER317    3-1-7     3    3.79    3.79    3.79    3.79    3.79    3.80    3.80    3.79   *3.93 
BEAR46        4-3-4     5    3.72    3.41    3.72    2.14f   3.72    3.72    3.72    3.72   *3.75 
EAGLE52       5-2-4     5    3.74    2.61    3.74    1.81f   3.74    3.74    3.74    3.74   *3.75 
GOAL62        6-1-4     6    2.16f   2.24f   2.24f   2.16f   2.16f   2.24f  *2.46f   2.16f   2.24f
MUG245        2-4-5     4    3.75    3.75    3.75    3.75    2.18f   3.75    3.75    3.75   *3.89 
PSYCHO        0-5-6     3    3.73    3.73    3.73    3.73    3.73    3.80    3.80    3.73   *3.82 
NICKEL_TILT   3-3-5     4    3.75    3.75    3.31    3.75    3.75    3.75    3.75    3.75   *3.89 

* = longest pocket for that front, f = unblocked / late-picked-up rusher on average
```

Takeaways:
- Odd and light-box fronts (Tite, Okie, Stack, Penny, Dollar) beat BOB, MAN and HOT with a free stand-up edge (≈2.0–2.5 s). Slide or half-slide toward him (≈3.75 s).
- Wide-9 and NASCAR punish sliding away from the wide rusher (≈2.5 s).
- Bear and Eagle beat half-slide (≈1.8–2.1 s); goal line is short against everything.
- Mug beats MAN (2.18 s).
