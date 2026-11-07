// v10: every eligible receiver (WR/TE/RB, progression or not, kept blockers too) is targetable from the snap to the throw,
// on every pass/RPO-pass play in Passing + Normal, both cameras. Real clicks at each receiver's badge register a throw.
const L = require('./v9-lib.cjs'); const { ok, SS } = L;
(async () => {
  for (const cam of ['pulled', 'classic']) {
    const { b, p, errors, Q } = await L.open({ ls: { 'pocketiq3d.camera': cam } });
    const plays = await Q(() => { const q = window.__qb3d; const s = new Set(); const out = []; ['passing', 'normal'].forEach((m) => q.M.pool(m).forEach((x) => { if (x.type !== 'run' && !s.has(x.id)) { s.add(x.id); out.push(x.id); } })); return out; });
    let clicks = 0, hits = 0, playsOk = 0, shot = false;
    for (let i = 0; i < plays.length; i++) {
      const r = await Q((pid) => { const q = window.__qb3d; const pl = q.D.PLAYS.find((x) => x.id === pid) || q.M.pool('passing').find((x) => x.id === pid); q.startPlay(pl); q.doSnap(); window.__timeScale = 0; return q.state.sim.offense.map((o) => o.id); }, plays[i]);
      await p.waitForTimeout(80);
      const probe = () => Q(() => { const out = {}; document.querySelectorAll('.badge').forEach((e) => { if (!e.offsetParent) return; const rc = e.getBoundingClientRect(); out[e.dataset.id] = window.__hitTest(rc.x + rc.width / 2, rc.y + rc.height / 2, false); }); return out; });
      let tg = await probe(); if (r.some((id) => tg[id] !== id)) { await p.waitForTimeout(300); tg = await probe(); } // one settle retry (first frame after a rebuild)
      const n = r.filter((id) => tg[id] === id).length;
      ok(`[${cam}] ${plays[i]}: ${n}/${r.length} receivers targetable`, n === r.length, JSON.stringify(tg));
      if (n === r.length) playsOk++;
      if (!shot && cam === 'pulled' && r.length >= 5) { await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(150); await Q(() => { window.__timeScale = 0; }); await p.waitForTimeout(80); await p.screenshot({ path: SS + 'v10-all-receiver-targets.png' }); shot = true; }
      // real click on one receiver (rotating, includes non-progression / blockers) — stay paused so a sack can't race the pointer
      const id = r[i % r.length];
      const pt = await Q((id) => { const e = [...document.querySelectorAll('.badge')].find((x) => x.dataset.id === id); if (!e || !e.offsetParent) return null; const rc = e.getBoundingClientRect(); return [rc.x + rc.width / 2, rc.y + rc.height / 2]; }, id);
      await Q(() => { window.__timeScale = 0; });
      if (pt) {
        await p.mouse.click(pt[0], pt[1]); clicks++;
        let okHit = await Q((id) => (window.__qb3d.state.sim.throwInfo || {}).id === id, id);
        if (!okHit) { // one nudge retry (edge chips)
          await p.mouse.click(Math.max(8, Math.min(pt[0], 1092)), pt[1]);
          okHit = await Q((id) => (window.__qb3d.state.sim.throwInfo || {}).id === id, id);
        }
        if (okHit) hits++; else ok(`[${cam}] ${plays[i]}: click on ${id} registers`, false);
      }
      await Q(() => { window.__timeScale = 1; });
    }
    ok(`[${cam}] all receivers targetable on every play`, playsOk === plays.length, `${playsOk}/${plays.length}`);
    ok(`[${cam}] clicks registered ${hits}/${clicks}`, hits === clicks && clicks > 0);
    ok(`[${cam}] no JS errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await b.close();
  }
  console.log(L.fails() ? `FAILURES: ${L.fails()}` : 'ALL PASS'); process.exit(L.fails() ? 1 : 0);
})();
