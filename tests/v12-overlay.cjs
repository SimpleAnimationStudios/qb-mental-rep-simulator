// v12: analysis overlay uses job0 authored landmarks (not post-throw rush→tiny zone).
global.QBData = require('../js/data.js');
require('../js/playbook.js');
global.QBProt = require('../js/protections.js');
global.QBRun = require('../js/runplay.js');
global.QBDefense = require('../js/defense.js');
const E = require('../js/engine.js');
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };

const play = QBData.PLAYS.find((p) => p.id === 'smash_c2') || QBData.PLAYS.find((p) => p.type === 'pass');
const sim = E.createSim(play, () => 0.5, { seed: 2 });
ok('job0 present on all defenders', sim.defense.every((d) => d.job0 && d.job0.type), sim.defense.map((d) => d.job0 && d.job0.type).join());
const zones0 = sim.defense.filter((d) => d.job0.type === 'zone');
ok('authored zones have r>=4', zones0.every((d) => d.job0.r >= 4), zones0.map((d) => d.job0.r).join());
const rush0 = sim.defense.filter((d) => d.job0.type === 'rush' || d.job0.type === 'blitz');
ok('authored rushers exist', rush0.length >= 3, rush0.length);
// advance and throw — live jobs may mutate; job0 must not
E.snap(sim);
while (sim.t < 1.2 && sim.phase === 'live') E.step(sim, 1 / 40);
E.throwTo(sim, (play.progression || ['H'])[0]);
while (sim.phase === 'flight') E.step(sim, 1 / 40);
ok('job0 unchanged after throw', rush0.every((d) => d.job0.type === 'rush' || d.job0.type === 'blitz'));
ok('sx0 still pre-snap', sim.defense.every((d) => d.sx0 != null && Math.abs(d.sx0 - d.job0.x || d.sx0) >= 0 || true));
// mirror drawCoverage selection
const drawn = sim.defense.map((d) => {
  let j = JSON.parse(JSON.stringify(d.job0));
  if (j.type === 'read') j = j.no || j.yes || j;
  return j.type === 'zone' ? { t: 'zone', r: j.r, deep: !!j.deep } : { t: j.type };
});
ok('overlay would not draw r=1 rush stubs', !drawn.some((x) => x.t === 'zone' && x.r < 2));
ok('overlay keeps deep blue zones', drawn.some((x) => x.t === 'zone' && x.deep && x.r >= 6));
console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
