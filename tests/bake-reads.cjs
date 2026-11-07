// Probe every pass play vs its authored defence: auto best read + time, compared with the authored one.
global.QBData = require('../js/data.js'); global.QBProt = require('../js/protections.js'); global.QBRun = require('../js/runplay.js');
require('../js/playbook.js'); const D = global.QBData, E = require('../js/engine.js');
for (const p of D.PLAYS) {
  if (p.type === 'run') { const s = E.createSim(p, Math.random, { seed: 3, front: process.env.FRONT }); console.log('RUN ', p.id.padEnd(16), 'ev', require('../js/runplay.js').expected(s).ev.toFixed(1), s.run.ex.note); continue; }
  const b = E.bestRead(p, { seed: 3, front: process.env.FRONT });
  const pk = b.pick || {};
  console.log((pk.id === p.correct ? 'ok  ' : 'DIFF'), p.id.padEnd(16), 'authored', p.correct, p.idealTime, '| probe', pk.id, pk.t, 'sep', pk.sep, 'sack', b.sackTime.toFixed(2), JSON.stringify(b.all.map((a) => a.id + ':' + a.t + '/' + a.sep)));
}
