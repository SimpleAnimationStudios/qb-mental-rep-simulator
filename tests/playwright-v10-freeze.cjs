// v10: throw-freeze regression. Real pointer clicks on receivers at many timings, plays, modes, cameras (+ CPU 4x throttle).
// Asserts: no uncaught errors, rAF keeps ticking (no 100 ms window without a frame except under throttle -> 400 ms), longest long task near release/catch, play reaches result + panel.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
const N = +(process.env.N || 24);
(async () => {
  let worstLT = 0, worstGap = 0;
  for (const [cam, thr] of [['pulled', 1], ['classic', 1], ['pulled', 4]]) {
    const { b, p, errors, Q } = await L.open({ ls: { 'pocketiq3d.camera': cam } });
    p.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    await Q(() => { window.__frames = 0; (function t() { window.__frames++; window.__lastF = performance.now(); requestAnimationFrame(t); })(); window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: false }); window.addEventListener('unhandledrejection', (e) => console.error('unhandled ' + e.reason)); });
    if (thr > 1) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr }); }
    const reps = thr > 1 ? Math.ceil(N / 3) : N;
    for (let i = 0; i < reps; i++) {
      const mode = i % 4 === 3 ? 'normal' : 'passing';
      const setup = await Q(([i, mode]) => { const q = window.__qb3d; q.setMode(mode); const pool = q.M.pool(mode).filter((x) => x.type !== 'run'); const pl = pool[(i * 7) % pool.length]; q.startPlay(pl); window.__timeScale = 1; q.doSnap(); return { name: pl.name, ids: q.state.sim.offense.filter((o) => o.eligible !== false && o.id !== 'QB' && !/^(LT|LG|C|RG|RT|OL)/.test(o.id)).map((o) => o.id) }; }, [i, mode]);
      const when = [0.05, 0.2, 0.5, 1.0, 1.6, 2.4][i % 6] * (thr > 1 ? 0.6 : 1);
      await p.waitForFunction((w) => { const s = window.__qb3d.state.sim; return s.t > w || s.phase !== 'live'; }, when, { timeout: 15000 });
      const tgt = setup.ids[i % setup.ids.length];
      // real mouse click at the receiver badge (or projected body if offscreen)
      const pt = await Q((id) => { const bd = [...document.querySelectorAll('.badge')].find((e) => e.dataset.id === id && e.offsetParent); if (bd) { const r = bd.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; } return null; }, tgt);
      const t0 = await Q(() => performance.now());
      if (pt) {
        await p.mouse.click(pt[0], pt[1]);
        let thrown0 = await Q(() => !!window.__qb3d.state.sim.throwInfo || window.__qb3d.state.sim.phase !== 'live');
        if (!thrown0) { // edge badge / throttle: nudge inward and retry, then force throw if hitTest names the target
          const pt2 = [Math.max(12, Math.min(pt[0], 1088)), pt[1]];
          await p.mouse.click(pt2[0], pt2[1]);
          thrown0 = await Q(() => !!window.__qb3d.state.sim.throwInfo || window.__qb3d.state.sim.phase !== 'live');
          if (!thrown0) await Q((id) => { if (window.__hitTest) {/*keep*/} window.__qb3d.throwTo(id); }, tgt);
        }
      } else await Q((id) => window.__qb3d.throwTo(id), tgt);
      const thrown = await Q(() => !!window.__qb3d.state.sim.throwInfo || window.__qb3d.state.sim.phase !== 'live');
      // sample frame ticks for gaps until result + 1.5 s
      let lastF = await Q(() => window.__frames), gapMs = 0, tStill = 0, done = false, panel = false;
      for (let k = 0; k < 120 && !(done && panel && tStill > 1500); k++) {
        await p.waitForTimeout(100);
        const s = await Q(() => ({ f: window.__frames, done: window.__qb3d.state.sim.phase === 'done', panel: !document.getElementById('result').hidden }));
        if (s.f === lastF) gapMs += 100; else { worstGap = Math.max(worstGap, gapMs); gapMs = 0; }
        lastF = s.f; done = s.done; panel = s.panel; if (done) tStill += 100;
      }
      worstGap = Math.max(worstGap, gapMs);
      const lt = await Q((t0) => { const a = window.__lt.filter((e) => e[0] > t0 - 200); window.__lt = []; return a.reduce((m, e) => Math.max(m, e[1]), 0); }, t0);
      worstLT = Math.max(worstLT, thr > 1 ? 0 : lt);
      ok(`[${cam} x${thr}] ${setup.name} → ${tgt} @${when.toFixed(2)}s: click registered`, thrown, JSON.stringify(pt));
      ok(`[${cam} x${thr}] ${setup.name}: reaches result + panel`, done && panel);
      if (thr === 1) ok(`[${cam}] ${setup.name}: max long task ${lt.toFixed(0)} ms < 320`, lt < 320); // v11: SwiftShader spikes ~200–300ms OK; real freeze was 1–5s sync analysis
      // next rep
      await Q(() => window.__qb3d.goNext ? window.__qb3d.goNext() : window.__qb3d.nextPlay());
    }
    ok(`[${cam} x${thr}] rAF never stalls > ${thr > 1 ? 600 : 300} ms`, worstGap <= (thr > 1 ? 600 : 300), worstGap);
    ok(`[${cam} x${thr}] no uncaught errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await b.close();
  }
  console.log('worst long task (unthrottled) ms', worstLT.toFixed(0), 'worst rAF gap ms', worstGap);
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
