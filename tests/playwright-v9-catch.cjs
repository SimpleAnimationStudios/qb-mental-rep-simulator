// v9: catch animation — hands to ball at the catch, cushion, YAC carry (cosmetic) then tackle/OOB, no freeze; drop/tip; early-throw outcome.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  const { b, p, errors, Q } = await L.open({ ls: { 'pocketiq3d.camera': 'pulled' } });
  const run = async (rngv) => {
    await Q(([rngv]) => { const q = window.__qb3d; const pl = q.M.pool('passing').find((x) => x.type !== 'run' && !x.screen); q.startPlay(pl); q.doSnap(); window.__timeScale = 1; }, [rngv]);
    await p.waitForFunction(() => window.__qb3d.state.sim.t > 1.2, null, { timeout: 8000 });
    return Q(([rngv]) => { const q = window.__qb3d, s = q.state.sim; s.rng = () => rngv; let best = s.play.progression[0], bs = -1; s.play.progression.forEach((id) => { const r = s.offense.find((o) => o.id === id); const d = Math.min(...s.defense.map((x) => Math.hypot(x.x - r.x, x.y - r.y))); if (d > bs) { bs = d; best = id; } }); q.throwTo ? q.throwTo(best) : window.QBEngine.throwTo(s, best); return best; }, [rngv]);
  };
  // complete: sample frames
  const id = await run(0.5);
  await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'done', null, { timeout: 10000 });
  const res = await Q(() => ({ type: window.__qb3d.state.sim.result.type, yards: window.__qb3d.state.sim.result.yards }));
  const frames = [], samples = [];
  for (let i = 0; i < 8; i++) {
    const s = await Q(() => { const q = window.__qb3d, s = q.state.sim, r = q.actors.find((a) => a.src.id === s.throwInfo.id); const rig = r.g.userData.rig; const bl = q.scene.getObjectByName('football').getWorldPosition(r.g.position.clone()); const hR = rig.haR.getWorldPosition(r.g.position.clone()), hL = rig.haL.getWorldPosition(r.g.position.clone()); return { pT: +((q.state.postT) || 0).toFixed(2), hand: +Math.min(hR.distanceTo(bl), hL.distanceTo(bl)).toFixed(2), z: +r.g.position.z.toFixed(2), x: +r.g.position.x.toFixed(2) }; });
    samples.push(s); const f = `/tmp/catch-${i}.png`; await p.screenshot({ path: f }); frames.push(f); await p.waitForTimeout(220);
  }
  console.log(res, JSON.stringify(samples));
  if (res.type === 'complete') {
    ok('hands at the ball at the catch (first frame)', samples[0].hand < 0.45, samples[0].hand);
    ok('ball stays in hands during the carry', samples.slice(1, 3).every((s) => s.hand < 0.5));
    ok('no freeze: carrier keeps moving after the catch', Math.hypot(samples[3].z - samples[0].z, samples[3].x - samples[0].x) > 0.5 || res.yards < 2);
    ok('post-play clock advances', samples[2].pT > samples[0].pT + 0.5); ok('auto-replay follows the carry', samples.slice(3).some((s) => s.hand > 1));
    ok('engine result unchanged by YAC (cosmetic)', await Q(([y]) => window.__qb3d.state.sim.result.yards === y, [res.yards]));
  } else ok('forced completion happened', false, res.type);
  require('fs').writeFileSync('/tmp/catch-frames.json', JSON.stringify(frames));
  // drop / tip animation: incomplete -> loose ball moves
  await run(0.9999); await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'done', null, { timeout: 10000 });
  const a = await Q(() => window.__qb3d.scene.getObjectByName('football').position.toArray()); await p.waitForTimeout(300);
  const c = await Q(() => window.__qb3d.scene.getObjectByName('football').position.toArray());
  ok('incomplete: loose ball animates (drop/tip/miss)', Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]) > 0.05, JSON.stringify([a, c]));
  await p.screenshot({ path: SS + 'v9-incomplete-loose-ball.png' });
  // early throw at 0.2 s: bad timing is allowed and shown
  await Q(() => { const q = window.__qb3d; q.startPlay(q.M.pool('passing')[0]); q.doSnap(); window.__timeScale = 1; });
  await p.waitForFunction(() => window.__qb3d.state.sim.t > 0.2, null, { timeout: 8000 });
  await Q(() => { const q = window.__qb3d, s = q.state.sim; const id = s.play.progression[0]; q.throwTo ? q.throwTo(id) : window.QBEngine.throwTo(s, id); });
  await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'done', null, { timeout: 10000 });
  await p.waitForTimeout(250); await p.screenshot({ path: SS + 'v9-early-throw-outcome.png' });
  ok('early throw resolves', (await Q(() => window.__qb3d.state.sim.result.type)) != null);
  ok('no JS errors', errors.length === 0, errors.join(' | '));
  await b.close(); console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
