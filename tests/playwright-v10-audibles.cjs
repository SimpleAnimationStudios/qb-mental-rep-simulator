// v10: per-rep audible menus — 4-5 options + Keep play, each with a concept description, mix of good/bad (baked engine EV),
// menu changes rep to rep, an audible is applied and graded. Screen: v10-audible-panel.png
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  const { b, p, errors, Q } = await L.open({ viewport: { width: 1280, height: 800 }, ls: { 'pocketiq3d.mode': 'normal' } });
  const menus = [];
  for (let i = 0; i < 8; i++) {
    const r = await Q((i) => { const q = window.__qb3d; const pool = q.M.pool('normal'); q.startPlay(pool[i % 3]);
      const bt = [...document.querySelectorAll('#aud-choices button')];
      return { pl: q.state.orig.id, ids: bt.map((x) => x.dataset.aud), descs: bt.map((x) => (x.querySelector('.ad') || {}).textContent || ''), menu: q.state.audMenu.map((m) => ({ id: m.id, type: m.type, fit: m.fit })) };
    }, i);
    menus.push(r);
    ok(`rep ${i}: Keep + 4-5 options`, r.ids[0] === 'keep' && r.ids.length >= 5 && r.ids.length <= 6, r.ids.join(','));
    ok(`rep ${i}: every option has a description`, r.descs.slice(1).every((d) => d.length > 12), r.descs.slice(1).map((d) => d.length).join(','));
    const fits = r.menu.map((m) => m.fit); ok(`rep ${i}: has a good and a bad choice`, Math.max(...fits) > 0 && Math.min(...fits) < 0, fits.map((x) => x.toFixed(2)).join(','));
  }
  for (let i = 3; i < 8; i++) { const a = menus[i], c = menus[i - 3]; ok(`same play rep ${i - 3}→${i}: menu changed`, a.pl !== c.pl || a.ids.join() !== c.ids.join(), a.ids.join()); }
  // apply + grade the best audible
  await Q(() => { const q = window.__qb3d; const pl = q.M.pool('normal').find((x) => x.type !== 'run'); q.startPlay(pl); });
  await p.click('#b-aud'); await p.waitForTimeout(300);
  await p.screenshot({ path: SS + 'v10-audible-panel.png' });
  const best = await Q(() => { const m = window.__qb3d.state.audMenu.slice().sort((a, b) => b.fit - a.fit)[0]; document.querySelector(`#aud-choices button[data-aud="${m.id}"]`).click(); return m; });
  const st = await Q(() => ({ a: window.__qb3d.state.audible, pid: window.__qb3d.state.sim.play.id }));
  ok('audible applied to the sim', st.a === best.id, JSON.stringify(st));
  await Q(() => { const q = window.__qb3d; q.doSnap(); const s = q.state.sim; s.rng = () => 0.5; window.__timeScale = 4; if (s.play.type !== 'run') setTimeout(() => q.throwTo(s.play.progression[0]), 300); });
  await p.waitForFunction(() => /udible/.test((document.getElementById('res-list') || {}).textContent || ''), null, { timeout: 60000 }).catch(() => {});
  const line = await Q(() => [...document.querySelectorAll('#res-list li')].map((x) => x.textContent).find((t) => /udible/.test(t)) || '');
  ok('audible graded in result', /udible/.test(line), line.slice(0, 160));
  await p.screenshot({ path: SS + 'v10-audible-result.png' });
  ok('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await Promise.race([b.close(), new Promise((r) => setTimeout(r, 5000))]);
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
