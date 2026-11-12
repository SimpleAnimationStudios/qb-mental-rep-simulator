// v14 route art (ROUTES overlay geometry) — every premade play + custom specs. node tests/routeart-unit.cjs
const D = require('../js/data.js'); require('../js/playbook.js');
const E = require('../js/engine.js'), A = require('../js/routeart.js');
let fails = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, c || i === undefined ? '' : JSON.stringify(i).slice(0, 300)); if (!c) fails++; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const turn = (a, b, c) => { const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x); let t = Math.abs(v - u); if (t > Math.PI) t = 2 * Math.PI - t; return t; };
let lines = 0, arrows = 0, tbars = 0, authored = 0, traced = 0, errs = [], jitter = 0, far = 0, curvedOn = 0, start = 0;
const customs = [
  { X: { base: 'sluggo' }, H: { base: 'wheel' }, Y: { base: 'out', depth: 1.2 }, Z: { base: 'dig', flip: true }, RB: 'flat' },
  { X: { pts: [[0, 8], [6, 8], [6, 20]], name: 'Drawn route' }, H: { base: 'stick', flip: true }, Y: 'stalk', Z: { base: 'hitchGo', depth: 0.8 }, RB: 'rbScreen' },
];
const plays = D.PLAYS.concat(customs.map((routes, i) => ({ ...D.PLAYS.find((p) => p.id === 'smash_c2'), id: 'cust' + i, custom: true, routes, progression: ['X', 'H', 'RB'] })));
for (const play of plays) for (const seed of [0.5, 0.2]) {
  let sim; try { sim = E.createSim(play, () => seed); } catch (e) { errs.push(play.id + ':' + e.message); continue; }
  for (const p of sim.offense) {
    let r; try { r = A.art(p); } catch (e) { errs.push(play.id + '/' + p.id + ':' + e.message); continue; }
    if (!r) { if (!(p.route && p.route.block)) { const a = p.posAt(0), b = p.posAt(5); if (dist(a, b) > 0.5) errs.push(`${play.id}/${p.id}: moving player has no art`); } continue; }
    lines++; r.end === 'arrow' ? arrows++ : tbars++; r.source === 'authored' ? authored++ : traced++; if (r.curved) curvedOn++;
    if (r.pts.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y))) errs.push(play.id + '/' + p.id + ' NaN');
    // no wobble: on straight (non-curved) routes no zig-zag of sub-yard segments
    if (!r.curved) for (let i = 1; i < r.pts.length - 1; i++) if (turn(r.pts[i - 1], r.pts[i], r.pts[i + 1]) > 0.35 && Math.min(dist(r.pts[i - 1], r.pts[i]), dist(r.pts[i], r.pts[i + 1])) < 0.7) jitter++;
    // every point stays near the path the engine actually runs (display only — mechanics untouched)
    const run = []; for (let t = 0; t <= 6; t += 0.05) run.push(p.posAt(t));
    const near = (q) => Math.min(...run.map((s) => dist(s, q)));
    if (r.pts.some((q) => near(q) > (r.curved ? 3.2 : 1.1))) far++;
    if (dist(r.pts[0], p.posAt(0)) > 0.75) start++;
  }
}
console.log({ lines, arrows, tbars, authored, traced, curvedOn });
ok('route art builds for every play + custom plays without errors', !errs.length, errs.slice(0, 5));
ok('every pass play draws at least 2 routes with arrowheads (PA Shot is a 2-man route)', plays.filter((p) => p.type !== 'run').every((pl) => E.createSim(pl, () => 0.5).offense.map(A.art).filter((r) => r && r.end === 'arrow').length >= 2));
ok('run plays draw stalk blocks as T bars', D.PLAYS.filter((p) => p.type === 'run').some((pl) => E.createSim(pl, () => 0.5).offense.map(A.art).some((r) => r && r.end === 'tbar')));
ok(`>= 95% of lines use authored break points (${authored}/${lines})`, authored / lines >= 0.95);
ok('no wobble: no sharp break with a sub-0.7 yd leg on straight routes', jitter === 0, jitter);
ok('art stays on the engine path (straight <=1.1 yd, curved <=3.2 yd)', far === 0, far);
ok('lines begin at the receiver (<=0.75 yd from the feet)', start === 0, start);
{ // crisp breaks: a slant / corner / dig keep exactly their authored corners
  const sim = E.createSim(D.PLAYS.find((p) => p.id === 'smash_c2'), () => 0.5), H = sim.offense.find((p) => p.id === 'H'), r = A.art(H);
  ok('corner route = 3 points with one sharp break (no fillet)', r.pts.length === 3 && turn(r.pts[0], r.pts[1], r.pts[2]) > 0.6, r.pts);
  const X = sim.offense.find((p) => p.id === 'X'), h = A.art(X);
  ok('hitch keeps a visible >=1 yd comeback hook', h.pts.length === 3 && dist(h.pts[1], h.pts[2]) >= 0.99 && turn(h.pts[0], h.pts[1], h.pts[2]) > 2, h.pts);
  const wsim = E.createSim(D.PLAYS.find((p) => p.id === 'postwheel_c1'), () => 0.5), wh = A.art(wsim.offense.find((p) => p.id === 'H'));
  ok('wheel is drawn with rounded arcs', wh.curved && wh.pts.length > 8, wh.pts.length);
}
ok('route mechanics untouched: engine posAt still the plain waypoint path', A.waypoints(E.createSim(D.PLAYS[0], () => 0.5).offense.find((p) => p.route && !p.route.block)) !== null);
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS'); process.exit(fails ? 1 : 0);
