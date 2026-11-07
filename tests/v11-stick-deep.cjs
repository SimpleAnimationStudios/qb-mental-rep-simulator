// v11: Stick concept matches route-audit; deep-open rates within documented targets (engine, no browser).
global.QBData = require('../js/data.js');
require('../js/playbook.js');
global.QBProt = require('../js/protections.js');
global.QBRun = require('../js/runplay.js');
global.QBDefense = require('../js/defense.js');
const D = global.QBData, E = require('../js/engine.js'), M = require('../js/modes.js');
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };

// Stick route depth 5–6 with sit
const st = D.ROUTES.stick; const deepY = Math.max(...st.pts.map((p) => p[1]));
ok('stick stem 5–6 yd', deepY >= 5 && deepY <= 6.5, deepY);
ok('stick has a settle (last y <= stem)', st.pts.length >= 2 && st.pts[st.pts.length - 1][1] <= deepY + 0.01, JSON.stringify(st.pts));

// stick_c3: #2=H stick, #3=Y flat, #1=Z go
const p = D.PLAYS.find((x) => x.id === 'stick_c3');
ok('stick_c3 routes', p && p.routes.H === 'stick' && p.routes.Y === 'flat' && p.routes.Z === 'go', JSON.stringify(p && p.routes));
ok('stick_c3 progression reads stick then flat', p.progression[0] === 'H' && p.progression.includes('Y'), p.progression.join(','));

const T = M.TEMPLATES.STICK;
ok('STICK template: Y stick, RB flat, Z go', T.routes.Y === 'stick' && T.routes.RB === 'flat' && T.routes.Z === 'go', JSON.stringify(T.routes));

// Deep-open targets (N=16): man shells tight; posts covered; C3 outside go not free for progression reads
const DEEP = /^(go|post|corner|fade|dig|seam)$/;
function openRate(covFilter, routeFilter) {
  let n = 0, o = 0;
  for (const play of D.PLAYS) {
    if (play.type === 'run') continue;
    if (covFilter && !covFilter(play.coverage)) continue;
    for (const [id, rt] of Object.entries(play.routes || {})) {
      if (routeFilter && !routeFilter(rt, id, play)) continue;
      if (!DEEP.test(rt) && !((D.ROUTES[rt] || {}).pts || []).some((pt) => pt[1] >= 12)) continue;
      for (let i = 0; i < 16; i++) {
        const sim = E.createSim({ ...play }, () => 0.5, { seed: i + 3 }); E.snap(sim);
        const Tm = play.idealTime || 1.6;
        while (sim.t < Tm - 1e-6 && sim.phase === 'live') E.step(sim, 1 / 40);
        if (sim.phase !== 'live') continue;
        E.throwTo(sim, id); while (sim.phase === 'flight') E.step(sim, 1 / 40);
        const sep = sim.result ? sim.result.sepAtCatch : 0; n++; if (sep >= 2.4) o++;
      }
    }
  }
  return { n, o, r: n ? o / n : 0 };
}
const man = openRate((c) => /cover1|cover2man|cover0/.test(c));
ok('man deep open rate ≤ 40%', man.r <= 0.40, (100 * man.r).toFixed(1) + '% n=' + man.n);
const posts = openRate(null, (rt) => rt === 'post');
ok('post open rate ≤ 25%', posts.r <= 0.25, (100 * posts.r).toFixed(1) + '%');
const c3go = openRate((c) => c === 'cover3', (rt, id, play) => rt === 'go' && (play.progression || []).includes(id));
ok('Cover3 progression go open ≤ 70% (clear-outs excluded)', c3go.r <= 0.70, (100 * c3go.r).toFixed(1) + '% n=' + c3go.n);
const c1 = openRate((c) => c === 'cover1');
ok('Cover1 deep open ≤ 45%', c1.r <= 0.45, (100 * c1.r).toFixed(1) + '%');

console.log(fails ? `FAILURES: ${fails}` : 'ALL PASS');
process.exit(fails ? 1 : 0);
