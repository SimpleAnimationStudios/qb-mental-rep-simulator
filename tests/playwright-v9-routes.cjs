// v9: route visibility (flat/out/swing plays), framing assist and edge chips, both cameras.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  for (const cam of ['classic', 'pulled']) {
    const { b, p, errors, Q } = await L.open({ ls: { 'pocketiq3d.camera': cam } });
    const plays = await Q(() => window.__qb3d.M.pool('passing').filter((x) => x.type !== 'run' && /flat|swing|out|arrow|shoot/i.test(JSON.stringify(x.routes || x))).slice(0, 3).map((x) => x.id));
    ok(`[${cam}] found flat/out/swing plays`, plays.length > 0, plays.join());
    for (const [i, pid] of plays.entries()) {
      await Q((pid) => { const q = window.__qb3d; q.startPlay(q.M.pool('passing').find((x) => x.id === pid)); window.__timeScale = 1; }, pid);
      await p.waitForTimeout(700);
      await p.keyboard.down('KeyR'); await p.waitForTimeout(200);
      const r = await Q(() => { const q = window.__qb3d, s = q.state.sim, w = innerWidth, h = innerHeight; const cv = document.getElementById('route-cv');
        const inView = s.offense.filter((o) => o.read >= 0).map((o) => { const a = q.actors.find((x) => x.kind === 'wr' && x.src.id === o.id); const v = a.g.position.clone(); v.y = 1; v.project(q.camera); return v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1; });
        const ctx = cv.getContext('2d'), d = ctx.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let k = 3; k < d.length; k += 16) if (d[k] > 200) n++;
        return { fov: +q.camera.fov.toFixed(1), inView, drawn: n, edges: document.querySelectorAll('.badge.edge').length };
      });
      ok(`[${cam}] ${pid}: overlay routes drawn, eligible receivers in frame (fov ${r.fov})`, r.drawn > 500 && r.inView.every(Boolean), JSON.stringify(r));
      await p.screenshot({ path: SS + `v9-routes-${cam}-${i}.png` });
      await p.keyboard.up('KeyR');
    }
    // edge chips: yaw hard to one side after the snap
    await Q(() => { const q = window.__qb3d; q.doSnap(); q.state.yawTarget = 0.95; });
    await p.waitForTimeout(900); await Q(() => { window.__timeScale = 0; }); await p.waitForTimeout(100);
    const e = await Q(() => [...document.querySelectorAll('.badge.edge')].map((x) => x.dataset.id));
    ok(`[${cam}] off-screen receivers shown as edge chips`, e.length > 0, e.join());
    // the chip itself is clickable → throw
    if (e.length) { const bb = await p.locator(`.badge.edge[data-id="${e[0]}"]`).boundingBox(); await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(80);
      ok(`[${cam}] clicking an edge chip throws to that receiver`, (await Q(() => window.__qb3d.state.sim.throwInfo && window.__qb3d.state.sim.throwInfo.id)) === e[0]); }
    await p.screenshot({ path: SS + `v9-edge-chips-${cam}.png` });
    ok(`[${cam}] no JS errors`, errors.length === 0, errors.join(' | '));
    await b.close();
  }
  console.log(L.fails() ? `FAILED ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
