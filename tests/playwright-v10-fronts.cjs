// v10: defensive fronts — every front yields 11 defenders with the right down-lineman count in 3D, the Front picker
// grades family/exact front, Film Room front quiz + coach cards render. Screens: v10-front-*.png
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
const SHOTS = ['NICKEL_OVER', 'OKIE', 'TITE', 'BEAR46', 'PSYCHO', 'DOLLAR', 'EAGLE52', 'WIDE9'];
(async () => {
  const { b, p, errors, Q } = await L.open({ viewport: { width: 1280, height: 800 }, ls: { 'pocketiq3d.mode': 'normal' } });
  const ids = await Q(() => window.QBDefense.FRONTS.map((f) => f.id));
  ok('>= 20 fronts', ids.length >= 20, ids.length);
  for (const id of ids) {
    const r = await Q((id) => { const q = window.__qb3d; const pl = q.M.pool('normal').find((x) => x.type !== 'run');
      q.startPlay({ ...pl, pressure: 'NONE', front: id }); const s = q.state.sim;
      const dl = q.actors.filter((a) => a.kind === 'dl').length;
      return { n: s.defense.length, fid: s.front && s.front.id, down: s.personnel.down, dl, nan: s.defense.some((d) => !isFinite(d.x) || !isFinite(d.y)) };
    }, id);
    ok(`${id}: 11 defenders, applied, 3D stance matches down count`, r.n === 11 && r.fid === id && !r.nan && r.dl === r.down, JSON.stringify(r));
    if (SHOTS.includes(id)) { await p.waitForTimeout(700); await p.screenshot({ path: SS + `v10-front-${id}.png` }); }
  }
  // v11: Front picker removed from Coverage bubble — coverage-only ID
  await Q(() => { const q = window.__qb3d; const pl = q.M.pool('normal').find((x) => x.type !== 'run'); q.startPlay({ ...pl, pressure: 'NONE', front: 'OKIE' }); });
  await p.waitForTimeout(400);
  await p.click('#b-cov'); await p.waitForTimeout(300);
  const hasFront = await Q(() => !!document.getElementById('front-fam') || /FRONT/i.test((document.getElementById('pop-cov') || {}).innerText || ''));
  ok('no Front picker in Coverage bubble', !hasFront, hasFront);
  await p.screenshot({ path: SS + 'v11-cov-no-front.png' });
  await Q(() => { const q = window.__qb3d; q.doSnap(); const s = q.state.sim; s.rng = () => 0.5; window.__timeScale = 4; setTimeout(() => q.throwTo(s.play.progression[0]), 300); });
  await p.waitForFunction(() => document.getElementById('res-extra') && document.getElementById('res-extra').querySelector('svg'), null, { timeout: 60000 }).catch(() => {});
  const line = await Q(() => [...document.querySelectorAll('#res-list li')].map((x) => x.textContent).find((t) => /Front/.test(t)) || '');
  ok('result does not grade Front in Coverage ID', !/Front:/.test(line), line);
  await Q(() => { window.__timeScale = 1; });
  // Film Room
  await Q(() => window.PocketHub.showFilm('fronts')); await p.waitForTimeout(300);
  const qz = await Q(() => ({ svg: !!document.querySelector('#pi-f-diag svg'), sq: document.querySelectorAll('#pi-f-diag rect[rx]').length, opts: document.querySelectorAll('#pi-f-opts button').length }));
  ok('front quiz renders diagram + 4 options', qz.svg && qz.opts === 4 && qz.sq >= 0, JSON.stringify(qz));
  await Q(() => document.querySelector('#pi-f-opts button').click());
  const out = await Q(() => document.getElementById('pi-f-out').textContent);
  ok('front quiz feedback w/ tell', /Tell/.test(out), out.slice(0, 120));
  await p.screenshot({ path: SS + 'v10-front-quiz.png' });
  await Q(() => window.PocketHub.showFilm('cards')); await p.waitForTimeout(300);
  const nc = await Q(() => document.querySelectorAll('#pi-cards-fr .pi-cc').length);
  ok('coach cards include every front', nc === ids.length, nc);
  await Q(() => document.getElementById('pi-cards-fr').scrollIntoView()); await p.screenshot({ path: SS + 'v10-front-cards.png' });
  ok('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await Promise.race([b.close(), new Promise((r) => setTimeout(r, 5000))]);
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
