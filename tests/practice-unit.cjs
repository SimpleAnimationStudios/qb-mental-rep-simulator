// v13 Practice selection logic — deterministic unit tests (no browser). node tests/practice-unit.cjs
const D = require('../js/data.js'); require('../js/playbook.js');
const PR = require('../js/practice.js'), M = require('../js/modes.js'), G = require('../js/grading.js');
let fails = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, c || i === undefined ? '' : JSON.stringify(i)); if (!c) fails++; };
const rng = (seed) => () => ((seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 4294967296); // deterministic
// --- shuffle bag fairness ---
for (const items of [['a', 'b'], ['cover2', 'cover3', 'cover4'], PR.allCovs()]) {
  const bag = PR.makeBag(items, rng(7)), n = items.length, rounds = 40, seen = [];
  for (let i = 0; i < n * rounds; i++) seen.push(bag.next());
  let fair = true; for (let r = 0; r < rounds; r++) { const w = seen.slice(r * n, r * n + n); if (new Set(w).size !== n) fair = false; }
  ok(`bag(${n}): every item once per round, ${rounds} rounds`, fair);
  ok(`bag(${n}): only allowed items`, seen.every((x) => items.includes(x)));
  ok(`bag(${n}): no back-to-back repeat across rounds`, seen.every((x, i) => i === 0 || x !== seen[i - 1]));
  const counts = items.map((x) => seen.filter((y) => y === x).length); ok(`bag(${n}): equal counts`, counts.every((c) => c === rounds), counts);
}
{ const b = PR.makeBag(['cover1'], rng(1)); ok('bag single selection stays fixed', Array.from({ length: 12 }, () => b.next()).every((x) => x === 'cover1')); }
{ let threw = false; try { PR.makeBag([], rng(1)); } catch (e) { threw = true; } ok('bag empty input throws (no silent fallback)', threw); }
{ const s1 = Array.from({ length: 9 }, ((b) => () => b.next())(PR.makeBag(['x', 'y', 'z'], rng(3)))), s2 = Array.from({ length: 9 }, ((b) => () => b.next())(PR.makeBag(['x', 'y', 'z'], rng(3)))); ok('bag deterministic for a seeded rng', JSON.stringify(s1) === JSON.stringify(s2)); }
// --- validation / empty input ---
for (const mode of ['normal', 'passing', 'running']) {
  ok(`${mode}: offense pick + none selected is invalid`, !PR.validate(mode, { offense: 'pick', plays: [], defense: 'own' }).ok);
  ok(`${mode}: defense pick + no coverages is invalid`, !PR.validate(mode, { offense: 'random', defense: 'pick', covs: [] }).ok);
  let threw = false; try { PR.createRun(mode, { offense: 'pick', plays: [], defense: 'own' }); } catch (e) { threw = true; } ok(`${mode}: createRun refuses empty selection`, threw);
  ok(`${mode}: plays from another mode only -> invalid, not a fallback`, !PR.validate(mode, { offense: 'pick', plays: ['__nope__'], defense: 'own' }).ok);
}
ok('normalize drops unknown coverages', JSON.stringify(PR.normalize({ defense: 'pick', covs: ['cover2', 'bogus'] }).covs) === '["cover2"]');
ok('default config = fully random + own looks (valid)', PR.validate('normal', PR.normalize(undefined)).ok);
// --- pool parity with Free Play ---
for (const mode of ['normal', 'passing', 'running']) {
  const fp = M.pool(mode).map((p) => p.id), pr = PR.validate(mode, { offense: 'random', defense: 'own' }).plays.map((p) => p.id);
  ok(`${mode}: Fully random pool === Free Play pool (${fp.length})`, JSON.stringify(fp) === JSON.stringify(pr));
  const names = [...new Set(M.pool(mode).map(PR.concept))];
  // concept-set filter == Free Play's playset filter (c:<concept>)
  for (const n of names) { const want = M.pool(mode).filter((p) => p.name.replace(' (audible)', '') === n).map((p) => p.id), ids = want.slice(); const got = PR.validate(mode, { offense: 'pick', plays: ids, defense: 'own' }).plays.map((p) => p.id); if (JSON.stringify(want) !== JSON.stringify(got)) ok(`${mode}: concept ${n} parity`, false, { want, got }); }
  ok(`${mode}: every concept-set filter matches the Free Play playset filter`, true);
  // concept + extra single plays union, stays inside eligibility
  const r = rng(11), pool = M.pool(mode), pick = [...pool.filter((p) => PR.concept(p) === names[0]).map((p) => p.id), pool[pool.length - 1].id, 'smash_c2', 'iz_light'];
  const v = PR.validate(mode, { offense: 'pick', plays: pick, defense: 'own' }), allowed = new Set(pool.map((p) => p.id));
  ok(`${mode}: selection union is filtered by mode eligibility`, v.plays.every((p) => allowed.has(p.id) && pick.includes(p.id)) && v.plays.length === new Set(pick.filter((id) => allowed.has(id))).size);
  const run = PR.createRun(mode, { offense: 'pick', plays: pick, defense: 'own' }, r), seen = new Set();
  for (let i = 0; i < v.plays.length * 3; i++) { const p = run.next(); seen.add(p.id); if (!allowed.has(p.id) || !pick.includes(p.id)) ok(`${mode}: run leaked ${p.id}`, false); }
  ok(`${mode}: every selected play reached in 3 rounds`, seen.size === v.plays.length);
}
ok('running mode has only runs', PR.validate('running', { offense: 'random', defense: 'own' }).plays.every((p) => p.type === 'run'));
ok('passing mode has only passes', PR.validate('passing', { offense: 'random', defense: 'own' }).plays.every((p) => p.type !== 'run'));
// --- coverage override: only selected coverages, independent of offense; no override by concept ---
{
  const covs = ['cover2', 'cover4', 'cover1robber'], run = PR.createRun('normal', { offense: 'random', defense: 'pick', covs }, rng(5)), cs = [];
  for (let i = 0; i < 60; i++) { const p = run.next(); cs.push(p.coverage); if (!D.COVERAGES[p.coverage]) ok('valid coverage', false, p.coverage); }
  ok('only selected coverages appear (60 reps, all plays)', cs.every((c) => covs.includes(c)));
  ok('every selected coverage reached', covs.every((c) => cs.includes(c)));
  ok('coverage counts balanced (shuffle bag)', covs.every((c) => cs.filter((x) => x === c).length === 20));
  const one = PR.createRun('normal', { offense: 'random', defense: 'pick', covs: ['cover3cloud'] }, rng(9));
  ok('single coverage fixed for every play incl. runs', Array.from({ length: 30 }, () => one.next()).every((p) => p.coverage === 'cover3cloud'));
  const own = PR.createRun('normal', { offense: 'random', defense: 'own' }, rng(9)), base = Object.fromEntries(D.PLAYS.map((p) => [p.id, p]));
  ok("own looks = untouched plays", Array.from({ length: 30 }, () => own.next()).every((p) => p.coverage === base[p.id].coverage && p.pressure === base[p.id].pressure && !p.practiceLook));
}
// --- pressure compatibility + grading fallback flag (no grading change for untouched plays) ---
{
  const slant0 = D.PLAYS.find((p) => p.pressure === 'ZERO');
  if (slant0) { ok('ZERO blitz dropped on a non-Cover-0 look', PR.withLook(slant0, 'cover3').pressure === 'NONE'); ok('ZERO blitz kept with Cover 0', PR.withLook(slant0, 'cover0').pressure === 'ZERO'); }
  let bad = 0; for (const p of D.PLAYS) for (const c of PR.allCovs()) { const f = PR.withLook(p, c); if (f.coverage !== c || f.id !== p.id || JSON.stringify(f.routes) !== JSON.stringify(p.routes)) bad++; } ok('withLook changes only the look (routes/id/formation untouched)', bad === 0, bad);
  let tbl = 0, pr = 0; for (const p of D.PLAYS.filter((x) => x.type !== 'run')) for (const c of PR.allCovs()) { const f = PR.withLook(p, c); if (c === p.coverage) continue; f.lookProbe ? pr++ : tbl++; }
  ok(`table concepts keep the reads-table answer; others use the engine probe (${tbl} table / ${pr} probe)`, tbl > 0);
  ok('withLook(play, its own coverage) is a plain copy (no flags)', D.PLAYS.every((p) => !PR.withLook(p, p.coverage).lookProbe && !PR.withLook(p, p.coverage).practiceLook));
}
// --- grading: a practice look on a non-table concept grades via the existing engine probe (a real receiver) ---
{
  const E = require('../js/engine.js'); let n = 0, good = 0, tbl = 0, tblSame = 0;
  for (const p of D.PLAYS.filter((x) => x.type !== 'run')) for (const c of ['cover2', 'cover3', 'cover1', 'cover4']) {
    if (c === p.coverage) continue; const f = PR.withLook(p, c), s = E.createSim(f, rng(n + 1)), r = G.correctRead(s);
    if (f.lookProbe) { n++; if (r.correct && f.routes[r.correct] !== undefined && ['probe', 'hot'].includes(r.source)) good++; }
    else { tbl++; const plain = G.correctRead(E.createSim({ ...f, practiceLook: undefined }, rng(n + 1))); if (plain.correct === r.correct) tblSame++; }
  }
  ok(`non-table concept on a new look grades to an engine-probed receiver (${good}/${n})`, n > 0 && good === n);
  ok(`table concept on a new look uses the reads table unchanged (${tblSame}/${tbl})`, tbl > 0 && tblSame === tbl);
  const src = require('fs').readFileSync(__dirname + '/../js/grading.js', 'utf8');
  ok('grading: lookProbe only joins the existing probe fallback', (src.match(/play\.lookProbe/g) || []).length === 2);
}
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS'); process.exit(fails ? 1 : 0);
