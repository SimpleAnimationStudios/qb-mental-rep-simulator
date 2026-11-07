// v10: bake the engine EV of every audible concept vs every authored play's look (seed 1, starter opts) → js/audible-ev.js
// usage: node tests/bake-audibles.cjs [shard] [nshards]  (writes /tmp/audev-<shard>.json); node tests/bake-audibles.cjs merge
const fs = require('fs');
if (process.argv[2] === 'merge') {
  const out = {}; fs.readdirSync('/tmp').filter((f) => /^audev-\d+\.json$/.test(f)).forEach((f) => Object.assign(out, JSON.parse(fs.readFileSync('/tmp/' + f))));
  fs.writeFileSync(__dirname + '/../js/audible-ev.js', '/* v10 baked audible EV table (tests/bake-audibles.cjs): play id → { orig, TEMPLATE: score } */\n(function (root) { const EV = ' + JSON.stringify(out) + ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = EV; else root.QBAudibleEV = EV; })(typeof window !== \'undefined\' ? window : globalThis);\n');
  console.log('merged', Object.keys(out).length); process.exit(0);
}
const J = (f) => require(__dirname + '/../js/' + f); global.QBData = J('data.js'); J('playbook.js'); global.QBProt = J('protections.js'); global.QBRun = J('runplay.js'); global.QBEngine = J('engine.js'); global.QBModes = J('modes.js'); const D = global.QBData, M = global.QBModes; const sh = +process.argv[2] || 0, ns = +process.argv[3] || 1; const out = {};
D.PLAYS.forEach((pl, i) => { if (i % ns !== sh) return; const r = { orig: +M.evalPlay(pl, { seed: 1 }).score.toFixed(2) };
  Object.keys(M.TEMPLATES).forEach((id) => { r[id] = +M.evalPlay(M.makeAudible(pl, id), { seed: 1 }).score.toFixed(2); }); out[pl.id] = r; console.log(pl.id, JSON.stringify(r)); });
fs.writeFileSync(`/tmp/audev-${sh}.json`, JSON.stringify(out));
