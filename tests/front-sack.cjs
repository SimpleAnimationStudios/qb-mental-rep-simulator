// v10: average time-to-sack (s) for every FRONT x protection (base 4-man call: stick vs Cover 4, no blitz) + rushers + free.
// node tests/front-sack.cjs
global.QBData = require('../js/data.js'); global.QBProt = require('../js/protections.js'); global.QBRun = require('../js/runplay.js');
const D = global.QBData, P = global.QBProt, E = require('../js/engine.js'), F = require('../js/defense.js');
const base = D.PLAYS.find((p) => p.id === 'stick_c4'), N = +process.env.N || 30, prots = P.PROTECTIONS.map((p) => p.id);
console.log('front'.padEnd(13), 'pers'.padEnd(6), 'rush', prots.map((p) => p.padStart(8)).join(''));
let fail = 0;
for (const f of F.FRONTS) {
  let rush = 0, pers = '';
  const cells = prots.map((pid) => { let s = 0, fr = 0; for (let i = 0; i < N; i++) { const sim = E.createSim(base, Math.random, { protection: pid, seed: 1000 + i, front: f.id }); s += sim.sackTime; fr += sim.prot.free.length; rush = sim.prot.rushers; const q = sim.personnel; pers = `${q.DL}-${q.LB}-${q.DB}`; if (sim.defense.length !== 11) fail++; } return { t: s / N, fr: fr / N }; });
  const best = Math.max(...cells.map((c) => c.t));
  console.log(f.id.padEnd(13), pers.padEnd(6), String(rush).padStart(4), cells.map((c) => ((c.t === best ? '*' : '') + c.t.toFixed(2) + (c.fr >= 0.5 ? 'f' : ' ')).padStart(8)).join(''));
}
console.log('\n* = longest pocket for that front, f = unblocked / late-picked-up rusher on average');
if (fail) { console.log('FAIL: not 11 defenders', fail); process.exit(1); }
