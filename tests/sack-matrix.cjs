// Average time-to-sack (s) for every blitz x protection, plus free rushers. node tests/sack-matrix.cjs
global.QBData = require('../js/data.js'); global.QBProt = require('../js/protections.js'); global.QBRun = require('../js/runplay.js');
const D = global.QBData, P = global.QBProt, E = require('../js/engine.js');
const base = D.PLAYS.find((p) => p.id === 'stick_c4');
const covFor = (b) => { const ids = Object.keys(D.BLITZES[b].set); const pref = b === 'ZERO' ? ['cover0'] : ['cover1', 'cover3', 'cover2man', 'cover3cloud', 'cover1robber', 'cover2', 'cover4'];
  return pref.find((c) => ids.every((id) => D.COVERAGES[c].defenders.some((d) => d.id === id))) || 'cover1'; };
const N = 40, rows = [];
const prots = P.PROTECTIONS.map((p) => p.id);
console.log('blitz'.padEnd(7), 'cov'.padEnd(13), prots.map((p) => p.padStart(8)).join(''));
for (const b of Object.keys(D.BLITZES)) {
  const cov = covFor(b); const play = { ...base, coverage: cov, pressure: b };
  const cells = prots.map((pid) => { let s = 0, fr = 0; for (let i = 0; i < N; i++) { const sim = E.createSim(play, Math.random, { protection: pid, seed: 1000 + i }); s += sim.sackTime; fr += sim.prot.free.length; } return { t: s / N, fr: fr / N }; });
  const best = Math.max(...cells.map((c) => c.t));
  console.log(b.padEnd(7), cov.padEnd(13), cells.map((c) => ((c.t === best ? '*' : '') + c.t.toFixed(2) + (c.fr >= 0.5 ? 'f' : ' ')).padStart(8)).join(''));
  rows.push({ b, cells });
}
console.log('\n* = longest pocket for that blitz, f = unblocked / late-picked-up rusher on average');
const base0 = Math.max(...rows[0].cells.map((c) => c.t));
const bad = rows.filter((r) => r.b !== 'NONE' && Math.min(...r.cells.map((c) => c.t)) > base0 - 0.3);
if (bad.length) { console.log('FAIL: blitz never shortens pocket:', bad.map((r) => r.b)); process.exit(1); }
