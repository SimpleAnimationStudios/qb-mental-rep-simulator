// v6.1 regression: "Next rep" must always advance to a fresh pre-snap. Real mouse clicks at the button centre (so any
// overlay that steals the click fails the test), across modes/cameras/viewports/moments, plus CPU-throttled reps and leak checks.
// node tests/playwright-nextrep.cjs   (env REPS=40 THROTTLE=4)
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const REPS = +(process.env.REPS || 40), THR = +(process.env.THROTTLE || 4); let fails = 0;
const ok = (n, c, i) => { if (!c || process.env.V) console.log((c ? 'PASS ' : 'FAIL ') + n, i !== undefined ? JSON.stringify(i) : ''); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const vp of [{ width: 1280, height: 800, tag: 'desktop' }, { width: 390, height: 844, tag: 'phone', mobile: true }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.mobile });
    const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    const errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const Q = (f, a) => p.evaluate(f, a);
    await p.goto('http://localhost:8766/index.html'); await Q(() => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); }); await p.reload(); await p.waitForTimeout(1500);
    const moments = ['immediate', 'replay', 'int', 'sack', 'run', 'audible', 'panel', 'routes', 'keyN', 'space', 'double', 'custom'];
    let base = null, slow = 0, done = 0;
    for (let i = 0; i < REPS; i++) {
      const m = moments[i % moments.length], throttled = i >= REPS / 2;
      if (i === Math.floor(REPS / 2)) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR });
      if (i % 7 === 3) await Q((c) => localStorage.setItem('pocketiq3d.camera', c), i % 2 ? 'classic' : 'pulled');
      if (i % 9 === 4) await Q((md) => window.__qb3d.setMode(md), ['normal', 'passing', 'running'][i % 3]);
      // set up a rep that ends in the wanted way
      await Q((m) => { const q = window.__qb3d, P = q.D.PLAYS;
        if (m === 'run') q.nextPlay(P.find((x) => x.type === 'run'));
        else if (m === 'custom') { const pl = P.find((x) => x.type !== 'run'); q.nextPlay({ ...pl, id: 'cust_t', name: 'Custom test', custom: true }); }
        else if (m === 'int') q.nextPlay(P.find((x) => x.id === 'curlflat_c3') || P.find((x) => x.type !== 'run'));
        else if (m !== 'immediate') q.nextPlay(P.find((x) => x.type !== 'run' && x.formation !== 'iform') ); }, m);
      if (m === 'audible') await Q(() => { const bt = document.querySelector('#aud-choices button:nth-child(2)'); bt && bt.click(); });
      const name0 = await Q(() => window.__qb3d.state.sim.play.name), sim0 = await Q(() => (window.__simId = (window.__simId || 0) + 1, window.__qb3d.state.sim.__id = window.__simId));
      await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(250);
      if (m === 'routes') await p.keyboard.down('KeyR');
      if (m !== 'sack' && m !== 'run') await Q((m) => { const q = window.__qb3d, s = q.state.sim; q.throwTo(m === 'int' ? s.play.progression[s.play.progression.length - 1] : s.play.correct || s.play.progression[0]); }, m);
      try { await p.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 30000 }); } catch { ok(`${vp.tag} rep ${i} ${m}: result shown`, false); continue; }
      if (m === 'routes') await p.keyboard.up('KeyR');
      if (m === 'replay') await p.waitForTimeout(1600);
      if (m === 'panel') await Q(() => { document.getElementById('menu').hidden = true; });
      const t0 = Date.now();
      const box = await p.$eval('#next-btn', (e) => { e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: top && (top.closest('#next-btn') ? 'next-btn' : top.id || top.className) }; });
      ok(`${vp.tag} rep ${i} ${m}: Next rep is topmost`, box.top === 'next-btn', box);
      if (m === 'keyN') await p.keyboard.press('KeyN');
      else if (m === 'space') await p.keyboard.press('Space');
      else if (vp.mobile) await p.touchscreen.tap(box.x, box.y);
      else if (m === 'double') await p.mouse.dblclick(box.x, box.y);
      else await p.mouse.click(box.x, box.y);
      try { await p.waitForFunction((id) => { const s = window.__qb3d.state; return s.sim.__id !== id && s.sim.phase === 'presnap' && document.getElementById('result').hidden && !s.replay && s.view === 'qb' && !document.getElementById('presnap').hidden; }, sim0, { timeout: 8000 }); done++; }
      catch { ok(`${vp.tag} rep ${i} ${m}: advanced to fresh pre-snap`, false, await Q(() => ({ ph: window.__qb3d.state.sim.phase, res: document.getElementById('result').hidden, rep: !!window.__qb3d.state.replay, view: window.__qb3d.state.view }))); }
      const lat = Date.now() - t0; if (lat > 2500) slow++;
      // a stale replay timer must not hijack the new rep
      await p.waitForTimeout(1100);
      ok(`${vp.tag} rep ${i} ${m}: no stale replay/timer after advance`, await Q(() => window.__qb3d.state.sim.phase === 'presnap' && !window.__qb3d.state.replay && document.getElementById('result').hidden));
      if (m === 'double' || m === 'space') ok(`${vp.tag} rep ${i} ${m}: no double-advance`, await Q((n) => window.__qb3d.state.sim.phase === 'presnap', name0));
      if (i === 5) base = await Q(() => ({ geo: window.__qb3d.renderer.info.memory.geometries, tex: window.__qb3d.renderer.info.memory.textures, dom: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, objs: window.__qb3d.scene.children.length }));
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const end = await Q(() => ({ geo: window.__qb3d.renderer.info.memory.geometries, tex: window.__qb3d.renderer.info.memory.textures, dom: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, objs: window.__qb3d.scene.children.length }));
    console.log(vp.tag, 'advanced', done, '/', REPS, 'slow(>2.5s)', slow, 'rep6', base, 'end', end);
    ok(vp.tag + ': all reps advanced', done === REPS, done);
    ok(vp.tag + ': no geometry/texture leak', end.geo - base.geo < 15 && end.tex - base.tex < 10, { base, end });
    ok(vp.tag + ': no DOM/scene growth', end.dom - base.dom < 60 && end.objs - base.objs < 5, { base, end });
    ok(vp.tag + ': no JS errors', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  console.log(fails ? `${fails} FAIL` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();
