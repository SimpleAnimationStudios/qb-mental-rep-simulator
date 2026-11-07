// v9: click/tap throws at 0.0 / 0.2 / 0.5 s, mid and late, every eligible receiver; desktop mouse + phone touch.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
const TIMES = [0, 0.2, 0.5, 1.2, 2.2];
async function run(label, opts, tap) {
  const { b, p, errors, Q } = await L.open(opts);
  const plays = await Q(() => window.__qb3d.M.pool('passing').filter((x) => x.type !== 'run').slice(0, 3).map((x) => x.id));
  let tried = 0, hit = 0; const outcomes = {}; const byT = {};
  for (const pid of plays) for (const T of TIMES) {
    const ids = await Q((pid) => { const q = window.__qb3d; const pl = q.M.pool('passing').find((x) => x.id === pid); q.startPlay(pl); return q.state.sim.offense.filter((o) => o.read >= 0).map((o) => o.id); }, pid);
    for (const id of ids) {
      await Q((pid) => { const q = window.__qb3d; const pl = q.M.pool('passing').find((x) => x.id === pid); q.startPlay(pl); window.__timeScale = 1; }, pid);
      await p.waitForTimeout(120);
      await Q(() => { window.__qb3d.doSnap(); window.__timeScale = 0; });
      await Q((T) => { window.__timeScale = 1; window.__stopAt = T; }, T);
      if (T > 0) await p.waitForFunction((T) => { const s = window.__qb3d.state.sim; if (s.t >= T || s.phase !== 'live') { window.__timeScale = 0; return true; } return false; }, T, { timeout: 8000, polling: 'raf' });
      else await Q(() => { window.__timeScale = 0; });
      await p.waitForTimeout(80);
      const pt = await Q((id) => { const q = window.__qb3d, a = q.actors.find((x) => x.kind === 'wr' && x.src.id === id); window.__hitTest(-1e4, -1e4, false); return a && a._hitP ? { x: a._hitP.x, y: a._hitP.y, r: a._hitR, phase: q.state.sim.phase } : null; }, id);
      if (!pt || pt.phase !== 'live') continue;
      const vw = p.viewportSize();
      if (pt.x < 0 || pt.y < 0 || pt.x > vw.width || pt.y > vw.height) { byT[T] = byT[T] || [0, 0, 0]; byT[T][2]++; continue; } // off-screen at this moment (edge chip covers it)
      tried++; byT[T] = byT[T] || [0, 0, 0]; byT[T][0]++;
      // click ~45% of the radius off-centre (a sloppy tap)
      const cx = pt.x + pt.r * 0.45, cy = pt.y + pt.r * 0.2;
      await tap(p, cx, cy);
      await p.waitForTimeout(60);
      const th = await Q(() => { const s = window.__qb3d.state.sim; return s.throwInfo ? s.throwInfo.id : null; });
      const pick = th === id || (th && th !== id); // nearest wins; record mismatch separately
      if (th === id) { hit++; byT[T][1]++; }
      else if (!th) console.log(`  miss: ${label} ${pid} t=${T} ${id} at`, pt);
      else console.log(`  picked ${th} instead of ${id} (${pid} t=${T}) — overlapping receivers`);
      void pick;
      await Q(() => { window.__timeScale = 6; });
      await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'done', null, { timeout: 12000 }).catch(() => {});
      const r = await Q(() => window.__qb3d.state.sim.result && window.__qb3d.state.sim.result.type);
      const k = `${T}`; outcomes[k] = outcomes[k] || {}; outcomes[k][r] = (outcomes[k][r] || 0) + 1;
      if (label === 'desktop' && T === 0 && !(await Q(() => window.__earlyShot))) { await Q(() => { window.__earlyShot = 1; }); }
    }
  }
  ok(`[${label}] throw registers on the intended receiver`, hit / Math.max(1, tried) >= 0.9 && tried > 20, `${hit}/${tried}`);
  ok(`[${label}] throws at 0.0 s and 0.2 s register`, (byT[0] || [0, 0])[1] > 0 && (byT[0.2] || [0, 0])[1] > 0, JSON.stringify(byT));
  console.log(`  [${label}] outcomes by throw time:`, JSON.stringify(outcomes));
  ok(`[${label}] no JS errors`, errors.length === 0, errors.join(' | '));
  await b.close(); return outcomes;
}
(async () => {
  await run('desktop', {}, (p, x, y) => p.mouse.click(x, y));
  await run('phone-touch', { viewport: { width: 844, height: 390 }, touch: true, mobile: true }, (p, x, y) => p.touchscreen.tap(x, y));
  console.log(L.fails() ? `FAILED ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
