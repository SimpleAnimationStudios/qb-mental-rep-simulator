# v8 progress
- [x] research (docs/crucible-research.md)  - [ ] scale audit - [ ] home - [ ] session - [ ] levels - [ ] learn - [ ] practice - [ ] leaderboard - [ ] feedback - [ ] polish - [ ] debug overlay - [ ] tests/zip
Backup of v7: /tmp/qb-v7-backup
- [x] scale step 1 (game3d): boxMap lateral compression, field lines/hash/numbers/border, goalposts, ball true size; rig per-position height (rig.body scale), big/mid widths
- [x] debug overlay K / Shift+K (setScaleDebug/updateScaleDebug in game3d.js)
- [x] eye camera option ('eye') — QB head/torso hidden in that mode
NOTE: Read tool caches images by path; use new filenames for re-shots
- [x] docs/scale-audit.md
- [x] hub.js: home, sessions(10), summary+traits+chart+rating, levels+unlock, achievements+day streak, Film Room (cov quiz, concept quiz, daily seeded, coach cards), practice, local bests, rep feedback ring/saw-missed/timing bar
- [x] DIFF.youth added; labels HS/College; engine untouched
- [x] stadium polish: crowd texture (not on Low/light), LED ribbon
- [x] tests/playwright-v8.cjs ALL PASS
- [x] all suites pass; v6 geometry test warm-up raised to 18 (bounded lazy caches); perf auto presnap ~23ms live 27ms; zip rebuilt
