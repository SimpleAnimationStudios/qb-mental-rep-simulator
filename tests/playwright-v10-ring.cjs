// v10: post-rep SIM score ring — arc starts at 12 o'clock & fills clockwise, upright text, compact, no overlap with
// other result-panel content, inside the viewport. Pass / run / INT / sack, in 4 viewports.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
const VPS = [['1280x800', 1280, 800, false], ['1920x1080', 1920, 1080, false], ['844x390', 844, 390, true], ['390x844', 390, 844, true]];
(async () => {
  for (const [nm, w, h, touch] of VPS) {
    const { b, p, errors, Q } = await L.open({ viewport: { width: w, height: h }, touch, mobile: touch, ls: { 'pocketiq3d.mode': 'normal' } });
    for (const kind of ['complete', 'interception', 'sack', 'run']) {
      await Q((kind) => { const q = window.__qb3d; const pool = q.M.pool('normal'); const pl = kind === 'run' ? pool.find((x) => x.type === 'run') : pool.find((x) => x.type !== 'run');
        q.startPlay(pl); q.doSnap(); const s = q.state.sim; s.rng = () => (kind === 'complete' ? 0.5 : kind === 'interception' ? 0 : 0.9999); window.__timeScale = 4;
        if (kind === 'sack') s.defense.forEach((d) => { d.rushSpeed = 12; });
        if (kind === 'complete' || kind === 'interception') setTimeout(() => q.throwTo(s.play.progression[0]), 300); }, kind);
      try { await p.waitForFunction(() => { const x = document.getElementById('res-extra'); return x && x.offsetParent && x.querySelector('svg'); }, null, { timeout: 60000 }); } catch (e) { ok(`[${nm}] ${kind}: ring shown`, false); continue; }
      await p.waitForTimeout(300);
      const r = await Q(() => {
        const R = (e) => { const c = e.getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height }; };
        const svg = document.querySelector('#res-extra svg'), panel = document.getElementById('result'), seen = document.querySelector('#res-extra .seen');
        const arc = svg.querySelectorAll('circle')[1], txt = svg.querySelector('text');
        const ov = (a, c) => a.x < c.x + c.w - 1 && c.x < a.x + a.w - 1 && a.y < c.y + c.h - 1 && c.y < a.y + a.h - 1;
        const rr = R(svg); const others = [document.querySelector('#result .ph'), seen, document.getElementById('bars'), document.getElementById('res-list'), document.getElementById('res-coach'), document.querySelector('#result .row')].filter((e) => e && e.offsetParent && R(e).h > 0);
        const hits = others.filter((e) => ov(rr, R(e))).map((e) => e.id || e.className);
        const pr = R(panel), tb = txt.getBBox();
        return { rr, hits, svgT: getComputedStyle(svg).transform, arcT: arc.getAttribute('transform'), upright: getComputedStyle(svg).transform === 'none' && !txt.getAttribute('transform') && getComputedStyle(txt).transform === 'none', tw: [tb.width, tb.height, txt.textContent], inPanel: rr.x >= pr.x - 1 && rr.x + rr.w <= pr.x + pr.w + 1, inVp: rr.x >= 0 && rr.y >= 0 && rr.x + rr.w <= innerWidth && rr.y + rr.h <= innerHeight + 400, out: document.getElementById('res-outcome').textContent };
      });
      ok(`[${nm}] ${kind}: arc from 12 o'clock clockwise`, /rotate\(-90/.test(r.arcT || ''), r.arcT);
      ok(`[${nm}] ${kind}: svg not rotated, text upright`, r.upright, r.svgT + ' ' + JSON.stringify(r.tw));
      ok(`[${nm}] ${kind}: compact (≤84px)`, r.rr.w <= 84 && r.rr.h <= 84, JSON.stringify(r.rr));
      ok(`[${nm}] ${kind}: no overlap with panel content`, r.hits.length === 0, r.hits.join(','));
      ok(`[${nm}] ${kind}: inside panel/viewport`, r.inPanel && r.inVp, r.out);
      await Q(() => { const x = document.getElementById('res-extra'); if (x) x.scrollIntoView({ block: 'nearest' }); }); await p.waitForTimeout(2400);
      await p.screenshot({ path: SS + `v10-ring-${nm}-${kind}.png` });
      await Q(() => { const x = document.getElementById('res-extra'); if (x) x.innerHTML = ''; window.__timeScale = 1; });
    }
    ok(`[${nm}] no JS errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await Promise.race([b.close(), new Promise((r) => setTimeout(r, 5000))]);
  }
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
