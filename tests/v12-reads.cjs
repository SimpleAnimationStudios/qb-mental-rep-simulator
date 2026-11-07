// v12: correct-read matches concept×coverage table for Stick/Snag/Mesh/Sail/Smash/Verts/etc.
global.QBData = require('../js/data.js');
require('../js/playbook.js');
global.QBProt = require('../js/protections.js');
global.QBRun = require('../js/runplay.js');
global.QBDefense = require('../js/defense.js');
global.QBReads = require('../js/reads.js');
const R = global.QBReads, E = require('../js/engine.js'), G = require('../js/grading.js');
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };

ok('contour cover3 closed', R.contourOf('cover3') === 'closed');
ok('contour cover2 open', R.contourOf('cover2') === 'open');
ok('contour cover1 man', R.contourOf('cover1') === 'man');
ok('contour cover2man man', R.contourOf('cover2man') === 'man');

const expect = [
  ['stick_c3b', 'STICK', 'closed', 'H'],
  ['stick_c4', 'STICK', 'open', 'Y'],
  ['smash_c2', 'SMASH', 'open', 'H'],
  ['smash_c3c', 'SMASH', 'closed', 'X'],
  ['mesh_c1', 'MESH', 'man', 'X'],
  ['flood_c3', 'SAIL', 'closed', 'Y'],
  ['verts_c3', 'VERTS', 'closed', 'H'],
  ['dagger_c4', 'DAGGER', 'open', 'H'],
  ['spacing_c3', 'SNAG', 'closed', 'H'],
];
for (const [id, concept, contour, pick] of expect) {
  const play = QBData.PLAYS.find((p) => p.id === id);
  ok(id + ' exists', !!play);
  if (!play) continue;
  ok(id + ' concept', R.conceptOf(play) === concept, R.conceptOf(play));
  const r = R.resolveRead(play, play.coverage);
  ok(id + ' contour', r.contour === contour, r.contour);
  ok(id + ' pick ' + pick, r.correct === pick, r.correct + ' src=' + r.source);
  const sim = E.createSim(play, () => 0.5, { seed: 3 });
  const cr = G.correctRead(sim);
  ok(id + ' grade correctRead', cr.correct === pick || cr.hot, cr.correct + ' hot=' + cr.hot);
}
console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
