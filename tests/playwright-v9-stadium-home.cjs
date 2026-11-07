// v9: stadium switching (live, persisted, field unchanged, no geometry leak over 40 reps) + home screen layout desktop/phone.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  // ---- stadiums ----
  {
    const { b, p, errors, Q } = await L.open();
    const fieldSig = () => Q(() => { const q = window.__qb3d; const f = q.scene.children.find((o) => o.isGroup && o.children.some((c) => c.name && c.name.startsWith('stadium-'))); return f.children.filter((c) => !(c.name || '').startsWith('stadium-')).map((c) => c.type + ':' + (c.geometry ? c.geometry.type : '') + ':' + c.position.toArray().map((n) => n.toFixed(2))).join('|'); });
    const base = await fieldSig();
    ok('default stadium bowl', (await Q(() => window.__stadium())) === 'bowl');
    for (const cam of ['classic', 'pulled']) {
      for (const k of ['dome', 'hs', 'bowl']) {
        await Q(([k, cam]) => { localStorage.setItem('pocketiq3d.camera', cam); window.__setStadium(k); }, [k, cam]);
        await p.reload(); await p.waitForFunction(() => window.__qb3d && window.__qb3d.state.sim, null, { timeout: 20000 });
        ok(`[${cam}] ${k} persisted across reload`, (await Q(() => window.__stadium())) === k && (await Q(() => localStorage.getItem('pocketiq3d.stadium'))) === k);
        ok(`[${cam}] ${k}: field objects unchanged`, (await fieldSig()) === base);
        await p.waitForTimeout(400); await p.screenshot({ path: SS + `v9-stadium-${k}-${cam}.png` });
      }
    }
    // live switching + leak check
    const g0 = await Q(() => window.__gfxInfo());
    const keys = ['dome', 'hs', 'bowl'];
    for (let i = 0; i < 40; i++) {
      await Q(([k]) => { window.__setStadium(k); const q = window.__qb3d; q.startPlay(q.M.pool('passing')[0]); q.doSnap(); }, [keys[i % 3]]);
      await p.waitForTimeout(60);
    }
    await Q(() => window.__setStadium('bowl')); await p.waitForTimeout(300);
    const g1 = await Q(() => window.__gfxInfo());
    ok('geometry count flat over 40 switches/reps', g1.geometries <= g0.geometries + 4, JSON.stringify([g0, g1]));
    ok('texture count flat', g1.textures <= g0.textures + 2, JSON.stringify([g0, g1]));
    await Q(() => { document.getElementById('set-stadium').value = 'dome'; document.getElementById('set-stadium').dispatchEvent(new Event('change')); });
    ok('settings selector switches live', (await Q(() => window.__stadium())) === 'dome');
    // Graphics Low respected
    await Q(() => { localStorage.setItem('pocketiq3d.graphics', 'low'); }); await p.reload(); await p.waitForFunction(() => window.__qb3d && window.__qb3d.state.sim, null, { timeout: 20000 });
    const low = await Q(() => { let n = 0, tex = 0; window.__qb3d.scene.traverse((o) => { if ((o.parent && (o.parent.name || '').startsWith('stadium-')) && o.isMesh) { n++; if (o.material.map) tex++; } }); return { n, tex }; });
    ok('Graphics Low: stadium without crowd textures (ribbons only)', low.tex <= 4, JSON.stringify(low));
    ok('no JS errors (stadium)', errors.length === 0, errors.join(' | '));
    await b.close();
  }
  // ---- home ----
  for (const [name, vp, touch] of [['desktop', { width: 1280, height: 800 }, false], ['phone', { width: 390, height: 844 }, true]]) {
    const { b, p, errors, Q } = await L.open({ viewport: vp, touch, mobile: touch, query: '?home=1' });
    await p.waitForSelector('#pi-play', { timeout: 15000 });
    ok(`[${name}] hero PLAY + rating ring`, await p.isVisible('#pi-play') && await p.isVisible('.pi-ring'));
    for (const sel of ['[data-mode]', '[data-lv]', '[data-sc]', '#pi-playset', '[data-stadium]', '[data-go="film"]', '[data-go="practice"]', '[data-go="progress"]', '[data-go="custom"]', '[data-go="settings"]', '[data-go="daily"]', '[data-go="board"]', '[data-go="ach"]', '[data-go="free"]'])
      ok(`[${name}] has ${sel}`, (await p.$$(sel)).length > 0);
    ok(`[${name}] locked rungs show lock`, await Q(() => [...document.querySelectorAll('.pi-rung.locked')].every((e) => e.disabled && /🔒/.test(e.textContent))));
    ok(`[${name}] no horizontal overflow`, await Q(() => document.getElementById('pi-home').scrollWidth <= window.innerWidth + 1));
    await p.screenshot({ path: SS + `v9-home-${name}.png`, fullPage: false });
    await p.click('[data-stadium="hs"]'); ok(`[${name}] stadium pick from home`, (await Q(() => window.__stadium())) === 'hs');
    await p.click('[data-go="settings"]'); ok(`[${name}] settings opens over home`, await p.isVisible('#menu')); await Q(() => (document.getElementById('menu').hidden = true));
    await p.click('[data-lv="youth"]'); await p.click('#pi-play');
    ok(`[${name}] PLAY starts session`, await Q(() => document.getElementById('pi-home').hidden));
    ok(`[${name}] no JS errors`, errors.length === 0, errors.join(' | '));
    await b.close();
  }
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
