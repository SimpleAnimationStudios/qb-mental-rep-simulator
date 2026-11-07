// Monte-Carlo check of the INT model: node tests/int-stats.cjs
const D = require('../js/data.js'); global.QBData = D; require('../js/playbook.js'); global.QBProt = require('../js/protections.js'); global.QBRun = require('../js/runplay.js'); const E = require('../js/engine.js');
const MUL = { rookie: 0.6, starter: 1, pro: 1.4 };
const LV = { rookie: { react: 0.4, disc: 0.7 }, starter: { react: 0.3, disc: 0.82 }, pro: { react: 0.2, disc: 0.95 } }; // v9 defender AI levels (same as game DIFF)
const lvOf = (mul) => LV[Object.keys(MUL).find((k) => MUL[k] === mul)] || {};
function run(play, id, at, mul) {
  const s = E.createSim(play, Math.random, { intMul: mul, ...lvOf(mul), front: process.env.FRONT }); E.snap(s);
  while (s.t < at && s.phase === 'live') E.step(s, 1 / 120);
  if (s.phase !== 'live') return { type: 'sack' };
  E.throwTo(s, id); while (s.phase === 'flight') E.step(s, 1 / 120);
  return { ...s.result, risk: E.intRisk(s) };
}
const N = +process.env.N || 200;
for (const [lvl, mul] of Object.entries(MUL)) {
  const agg = {}; const add = (k, r) => { const a = (agg[k] = agg[k] || { n: 0, c: 0, i: 0, s: 0, causes: {} }); a.n++; if (r.type === 'complete') a.c++; if (r.type === 'interception') { a.i++; a.causes[r.cause] = (a.causes[r.cause] || 0) + 1; } if (r.type === 'sack') a.s++; };
  for (const play of D.PLAYS) for (let k = 0; k < N; k++) {
    add('ontime-best', run(play, play.correct, play.idealTime, mul));
    add('late+0.9-best', run(play, play.correct, play.idealTime + 0.9, mul));
    const wrong = play.progression.find((p) => p !== play.correct);
    add('ontime-wrong', run(play, wrong, play.idealTime, mul));
    add('late+0.9-wrong', run(play, wrong, play.idealTime + 0.9, mul));
  }
  console.log(`\n${lvl} (intMul ${mul})`);
  for (const [k, a] of Object.entries(agg)) console.log(`  ${k.padEnd(16)} comp ${(100 * a.c / a.n).toFixed(1)}%  INT ${(100 * a.i / a.n).toFixed(1)}%  sack ${(100 * a.s / a.n).toFixed(1)}%  causes ${JSON.stringify(a.causes)}`);
}
// per-play on-time best (starter)
console.log('\nper-play on-time best read @starter:');
for (const play of D.PLAYS) { let c = 0, i = 0; for (let k = 0; k < N; k++) { const r = run(play, play.correct, play.idealTime, 1); if (r.type === 'complete') c++; if (r.type === 'interception') i++; } console.log(`  ${play.id.padEnd(10)} comp ${(100 * c / N).toFixed(0)}% INT ${(100 * i / N).toFixed(1)}%`); }
