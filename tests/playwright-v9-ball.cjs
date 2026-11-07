// v9: ball visible in every phase (projection + pixel diff), both cameras; result caption timing; catch attach / no freeze.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  for (const cam of ['classic', 'pulled']) {
    const { b, p, errors, Q } = await L.open({ ls: { 'pocketiq3d.camera': cam } });
    const shot = (n) => p.screenshot({ path: SS + `v9-ball-${n}-${cam}.png` });
    const setup = async (rng, under) => Q(([rng, under]) => {
      const q = window.__qb3d; const pool = q.M.pool('passing'); const pl = pool.find((x) => (under ? x.formation && /under|I-|Pro/i.test(JSON.stringify(x.formation)) : true) && x.type !== 'run') || pool[0];
      q.startPlay(pl); window.__timeScale = 1; return q.state.sim.play.name;
    }, [rng, under]);
    const phase = async (name, cond) => { const r = await L.ballCheck(p); let need = cond == null ? 6 : cond; if (r.inView && r.cw && (r.sx < 55 || r.sx > r.cw - 55) && need > 1) need = 1; /* sideline: SwiftShader occlusion */ ok(`[${cam}] ball ${name}: visible, scale>0, in view, pixels`, r.vis && r.scale > 0 && r.meshes >= 1 && r.inView && r.px >= need, JSON.stringify(r)); await shot(name); return r; };
    for (const kind of ['complete', 'incomplete', 'interception']) {
      await setup();
      await p.waitForTimeout(300);
      if (kind === 'complete') await phase('presnap');
      await Q(() => { window.__qb3d.doSnap(); window.__timeScale = 1; });
      await p.waitForFunction(() => window.__qb3d.state.sim.t > 0.45, null, { timeout: 8000 });
      await Q(() => { window.__timeScale = 0; });
      if (kind === 'complete') await phase('drop-in-hand', 3);
      await Q(([kind]) => { const q = window.__qb3d, s = q.state.sim; s.rng = () => (kind === 'complete' ? 0.5 : kind === 'interception' ? 0 : 0.9999); window.__timeScale = 1; }, [kind]);
      await p.waitForFunction(() => window.__qb3d.state.sim.t > 1.6 || window.__qb3d.state.sim.phase !== 'live', null, { timeout: 8000 });
      // aim at the most open receiver for a complete
      await Q(([kind]) => { const q = window.__qb3d, s = q.state.sim; if (s.phase !== 'live') return; const ids = s.play.progression; let best = ids[0], bs = -1; ids.forEach((id) => { const r = s.offense.find((o) => o.id === id); let d = 99; s.defense.forEach((x) => { d = Math.min(d, Math.hypot(x.x - r.x, x.y - r.y)); }); if (d > bs) { bs = d; best = id; } }); q.throwTo(best); }, [kind]);
      const live = await Q(() => window.__qb3d.state.sim.phase);
      if (!['live', 'done', 'flight'].includes(live)) { ok(`[${cam}] ${kind}: throw happened`, false, live); continue; }
      await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s.ball && s.ball.f > 0.4; }, null, { timeout: 8000 }).catch(() => {});
      await Q(() => { window.__timeScale = 0; }); await p.waitForTimeout(60);
      if (kind === 'complete') { const r = await phase('flight'); ok(`[${cam}] flight emphasis scale 1.3–1.6`, r.scale >= 1.3 && r.scale <= 1.6, r.scale); ok(`[${cam}] trail visible in flight`, await Q(() => window.__qb3d.scene.children.some((o) => o.isLine && o.visible))); }
      // run to the result and time the caption
      await Q(() => { window.__timeScale = 1; });
      const t0 = await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'done', null, { timeout: 10000 });
      const cap = await Q(() => { const s = window.__qb3d.state; const el = document.getElementById('caption'); return { shown: !el.hidden, txt: el.textContent, res: s.sim.result.type, lag: performance.now() - window.__captionAt, panel: !document.getElementById('result').hidden }; });
      ok(`[${cam}] ${kind}: caption + grade panel immediately`, cap.shown && cap.panel && cap.lag < 400, JSON.stringify(cap));
      const got = await Q(() => window.__qb3d.state.sim.result.type);
      await p.waitForTimeout(120); await Q(() => { window.__timeScale = 0; });
      await p.waitForTimeout(60);
      await phase(`${got}-0.1s`, got === 'complete' ? 0 : got === 'interception' ? 1 : 6); if (cam === 'pulled' && got === kind) await p.screenshot({ path: SS + `v9-caption-${kind}.png` });
      await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(got === 'complete' ? 700 : 900); await Q(() => { window.__timeScale = 0; }); await p.waitForTimeout(60);
      await phase(`${got}-late`, got === 'complete' ? 0 : 6);
      if (got === 'complete') {
        const at = await Q(() => { const q = window.__qb3d, s = q.state.sim, r = q.actors.find((a) => a.kind === 'wr' && a.src.id === s.throwInfo.id); const h = r.g.userData.rig.haR.getWorldPosition(r.g.position.clone()); const bl = q.scene.getObjectByName('football').position; return { d: h.distanceTo(bl), moved: Math.hypot(r.g.position.z + s.offense.find((o) => o.id === s.throwInfo.id).y, 0) }; });
        ok(`[${cam}] ball attached to the receiver after the catch`, at.d < 0.35, JSON.stringify(at));
      }
      await Q(() => { window.__timeScale = 1; });
    }
    ok(`[${cam}] no JS errors`, errors.length === 0, errors.join(' | '));
    await b.close();
  }
  console.log(L.fails() ? `FAILED ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
