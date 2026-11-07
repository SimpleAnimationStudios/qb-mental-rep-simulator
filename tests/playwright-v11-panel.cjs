// v11: simplified result panel — headline why, ring upright, 3 sections, more-details expander, no overlap
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
const VPS = [['1280x800', 1280, 800, false], ['844x390', 844, 390, true], ['390x844', 390, 844, true]];
(async () => {
  for (const [nm, w, h, touch] of VPS) {
    const { b, p, errors, Q } = await L.open({ viewport: { width: w, height: h }, touch, mobile: touch, ls: { 'pocketiq3d.mode': 'normal' } });
    await Q(() => { const q = window.__qb3d; const pl = q.M.pool('normal').find((x) => x.type !== 'run'); q.startPlay(pl); q.doSnap(); const s = q.state.sim; s.rng = () => 0.5; window.__timeScale = 4; setTimeout(() => q.throwTo(s.play.progression[0]), 300); });
    await p.waitForFunction(() => { const x = document.getElementById('res-extra'); return x && x.querySelector('svg'); }, null, { timeout: 60000 });
    await p.waitForTimeout(400);
    const r = await Q(() => {
      const sec = [...document.querySelectorAll('#res-sections .sec h4')].map((x) => x.textContent.trim());
      const why = (document.getElementById('res-why') || {}).textContent || '';
      const more = document.getElementById('res-more');
      const btn = document.getElementById('res-more-btn');
      const svg = document.querySelector('#res-extra svg');
      const front = /FRONT/i.test((document.getElementById('pop-cov') || {}).innerText || '') || !!document.getElementById('front-fam');
      return { sec, why, moreHidden: !more || more.hidden, hasBtn: !!btn, svgT: svg && getComputedStyle(svg).transform, front };
    });
    ok(`[${nm}] 3 sections`, r.sec.length === 3 && /What you saw|Best read|Coverage/i.test(r.sec.join('|')), r.sec.join(','));
    ok(`[${nm}] why line`, r.why.length > 8, r.why.slice(0, 80));
    ok(`[${nm}] more details collapsed`, r.moreHidden && r.hasBtn);
    ok(`[${nm}] ring not rotated`, r.svgT === 'none', r.svgT);
    ok(`[${nm}] no front in cov bubble`, !r.front);
    await Q(() => document.getElementById('res-more-btn').click());
    const open = await Q(() => !document.getElementById('res-more').hidden);
    ok(`[${nm}] more details expands`, open);
    await p.waitForTimeout(2000);
    await p.screenshot({ path: SS + `v11-panel-${nm}.png` });
    ok(`[${nm}] no JS errors`, errors.length === 0, errors.slice(0, 2).join('|'));
    await Promise.race([b.close(), new Promise((r) => setTimeout(r, 4000))]);
  }
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
