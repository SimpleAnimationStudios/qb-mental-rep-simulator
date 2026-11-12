// v14: pre-snap is ALWAYS unlimited (every mode / game type / session kind), no ∞ chip or time control anywhere,
// old pocketiq3d.unlimited='off' ignored; plus the ROUTES overlay builds for every play and paints.
// Needs a static server on :8766. node tests/playwright-unlimited.cjs  (env SIMSEC=180)
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const SIMSEC = +(process.env.SIMSEC || 180); let fails = 0;
const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, c || i === undefined ? '' : JSON.stringify(i).slice(0, 400)); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const vp of [{ width: 1280, height: 800, tag: 'desktop' }, { width: 390, height: 844, tag: 'phone', mobile: true }, { width: 844, height: 390, tag: 'landscape', mobile: true }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.mobile, isMobile: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
    const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const Q = (f, a) => p.evaluate(f, a);
    await p.goto('http://localhost:8766/index.html');
    await Q(() => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'off'); localStorage.setItem('pocketiq3d.diff', 'pro'); }); // old setting that used to bring the clock back
    await p.reload(); await p.waitForFunction(() => window.PocketHub && window.PocketHub.startSession && window.__qb3d);
    ok(`${vp.tag}: old pocketiq3d.unlimited='off' removed on load`, await Q(() => localStorage.getItem('pocketiq3d.unlimited') === null));
    const dom = await Q(() => ({ q: !!document.getElementById('q-unl'), opt: !!document.getElementById('opt-unlimited'), tmr: !!document.getElementById('presnap-timer'), inf: document.body.innerHTML.includes('∞'), unl: /unlimited pre-snap/i.test(document.body.innerText) }));
    ok(`${vp.tag}: no ∞ chip, no pre-snap time setting or countdown in the DOM`, !dom.q && !dom.opt && !dom.tmr && !dom.inf && !dom.unl, dom);
    ok(`${vp.tag}: difficulty table has no pre-snap seconds`, await Q(() => Object.values(window.__qb3d.DIFF).every((d) => d.presnap === undefined)));
    // wait far beyond the old limits (5–15 s) in every context
    const cases = [
      ['free play normal', () => { window.PocketHub.showHome(); document.querySelector('[data-go="free"]').click(); window.__qb3d.setMode('normal'); }],
      ['free play passing', () => window.__qb3d.setMode('passing')],
      ['free play running', () => window.__qb3d.setMode('running')],
      ['scored session (Call it)', () => { window.__qb3d.setMode('normal'); const P = window.PocketHub.P(); P.prefs.gameType = 'call'; window.PocketHub.startSession({ scored: true }); }],
      ['session (Just read)', () => { window.PocketHub.endSession(); const P = window.PocketHub.P(); P.prefs.gameType = 'read'; window.PocketHub.startSession({ scored: false }); }],
      ['practice (2 coverages)', () => { window.PocketHub.endSession(); window.PocketHub.P().prefs.gameType = 'call'; window.PocketHub.startSession({ practice: { cfg: { offense: 'random', plays: [], defense: 'pick', covs: ['cover2', 'cover0'] }, concept: 'test' } }); }],
    ];
    for (const [name, fn] of cases) {
      await Q(fn); await p.waitForTimeout(300);
      const id0 = await Q(() => (window.__qb3d.state.sim.__uid = Math.random()));
      await Q(() => (window.__timeScale = 60)); // 1 s of game time per frame
      const t0 = Date.now(); await p.waitForTimeout(Math.ceil(SIMSEC / 60 / 0.016)); // ~ SIMSEC game-seconds of frames
      const st = await Q(() => ({ ph: window.__qb3d.state.sim.phase, t: window.__qb3d.state.sim.t, same: window.__qb3d.state.sim.__uid, snapDis: document.getElementById('snap-btn').disabled, fps: window.__fps }));
      await Q(() => (window.__timeScale = 1));
      ok(`${vp.tag} ${name}: still pre-snap after ~${SIMSEC}s of game time (no auto-snap)`, st.ph === 'presnap' && st.t === 0 && st.same === id0 && !st.snapDis, { ...st, waited: Date.now() - t0 });
    }
    // answers can still be entered after the long wait, then a manual snap grades with no pre-snap time component
    const g = await Q(async () => {
      window.PocketHub.endSession(); window.__qb3d.setMode('passing'); window.__qb3d.nextPlay(window.__qb3d.D.PLAYS.find((x) => x.id === 'smash_c2'));
      window.__timeScale = 60; await new Promise((r) => setTimeout(r, 1500)); window.__timeScale = 1;
      const q = window.__qb3d, ch = document.querySelector('#presnap .choice[data-key], #presnap .pop .choice'); if (ch) ch.click();
      const ans = Object.keys(q.state.answers).length; const ph = q.state.sim.phase; q.doSnap();
      await new Promise((r) => setTimeout(r, 200)); q.throwTo(q.state.sim.play.correct || 'X');
      for (let i = 0; i < 150 && document.getElementById('result').hidden; i++) await new Promise((r) => setTimeout(r, 100));
      const last = (q.state.session && q.state.session.history || []).slice(-1)[0] || {};
      return { ph, ans, shown: !document.getElementById('result').hidden, txt: document.getElementById('result').innerText.slice(0, 2000) };
    });
    ok(`${vp.tag}: answers accepted after a long pre-snap wait; manual snap grades`, g.ph === 'presnap' && g.ans >= 1 && g.shown, { ph: g.ph, ans: g.ans, shown: g.shown });
    ok(`${vp.tag}: result has no pre-snap-time penalty line`, !/pre-?snap (time|clock)|too slow pre|ran out of time|clock ran/i.test(g.txt));
    // Daily / Film Room have no timer controls either
    await Q(() => { window.PocketHub.showFilm('daily'); }); await p.waitForTimeout(200);
    ok(`${vp.tag}: Daily/Film Room show no ∞ or pre-snap time control`, await Q(() => !document.body.innerHTML.includes('∞') && !document.getElementById('q-unl')));
    await Q(() => window.PocketHub.showHome()); await p.waitForTimeout(200);
    // layout where the chip was: no overflow, HUD controls do not overlap
    await Q(() => { document.querySelector('[data-go="free"]').click(); window.__qb3d.nextPlay(); }); await p.waitForTimeout(500);
    const L = await Q(() => { const vw = innerWidth, els = [...document.querySelectorAll('#hud-top .right > *')].filter((e) => e.offsetParent && getComputedStyle(e).display !== 'none'); const rs = els.map((e) => e.getBoundingClientRect()); let ov = 0;
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], c = rs[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) ov++; }
      return { over: document.documentElement.scrollWidth - vw, ov, out: rs.filter((r) => r.right > vw + 1 || r.left < -1).length }; });
    ok(`${vp.tag}: HUD has no overflow/overlap after removing the chip`, L.over <= 0 && L.ov === 0 && L.out === 0, L);
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/unlimited-${vp.tag}.png` });
    // ROUTES overlay: every play builds and paints; counts
    const R = await Q(() => { const q = window.__qb3d, D = q.D, out = { plays: 0, lines: 0, arrows: 0, tbars: 0, empty: [], unpainted: [] };
      const cv = document.getElementById('route-cv');
      const all = D.PLAYS.concat([{ ...D.PLAYS.find((x) => x.id === 'smash_c2'), id: 'cust_t', custom: true, routes: { X: { base: 'sluggo' }, H: { base: 'wheel' }, Y: { base: 'out', depth: 1.2 }, Z: { base: 'dig', flip: true }, RB: 'flat' } }]);
      for (const pl of all) {
        q.nextPlay(pl); q.routeGroup.visible = true; q.drawRouteOverlay(); out.plays++;
        const L = q.routeLines; out.lines += L.length; out.arrows += L.filter((r) => r.end === 'arrow').length; out.tbars += L.filter((r) => r.end === 'tbar').length;
        if (!L.length) out.empty.push(pl.id);
        const c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i]) n++; const vis = L.some((r) => r.pts.some((v) => { const c2 = v.clone().project(q.camera); return Math.abs(c2.x) < 0.95 && Math.abs(c2.y) < 0.95 && c2.z < 1; })); if (vis && !n) out.unpainted.push(pl.id); if (!vis) out.offscreen = (out.offscreen || 0) + 1;
        q.routeGroup.visible = false; q.drawRouteOverlay();
      }
      out.meshes = q.routeGroup.children.length; return out; });
    console.log(vp.tag, 'routes', JSON.stringify(R));
    ok(`${vp.tag}: ROUTES overlay builds and paints for all ${R.plays} plays (+custom)`, !R.empty.length && !R.unpainted.length && R.arrows > R.plays * 2 && R.tbars > 0, R);
    ok(`${vp.tag}: no 3D route meshes (no z-fighting)`, R.meshes === 0, R.meshes);
    ok(`${vp.tag}: no JS errors`, !errs.length, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
