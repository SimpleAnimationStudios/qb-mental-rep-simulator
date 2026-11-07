// v4 headless checks: node tests/playwright-v4.cjs (server on :8766, Playwright from /tmp/pwt).
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const S = 'screenshots/v4-'; const out = {}; let fails = 0;
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name, info !== undefined ? JSON.stringify(info) : ''); if (!cond) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8766/index.html'); await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForTimeout(2000);
  const Q = (f, a) => p.evaluate(f, a);
  const force = (id) => Q((id) => { const q = window.__qb3d; q.nextPlay(q.D.PLAYS.find((x) => x.id === id)); }, id);
  const finish = async (fn) => { await p.waitForFunction(() => window.__qb3d.state.graded, null, { timeout: 15000 }); await p.waitForTimeout(300); return (await p.textContent('#result')).replace(/\s+/g, ' '); };

  // 1. modes
  ok('default mode normal', (await p.inputValue('#mode-sel')) === 'normal');
  await p.click('#menu-btn'); await p.waitForTimeout(200); await p.screenshot({ path: S + '01-mode-menu.png' });
  await p.click('#menu-modes [data-mode="running"]'); await p.waitForTimeout(300);
  const runs = []; for (let i = 0; i < 6; i++) { runs.push(await Q(() => window.__qb3d.state.sim.play.type)); await Q(() => window.__qb3d.nextPlay()); }
  ok('running mode only runs', runs.every((t) => t === 'run'), runs);
  ok('mode persisted', (await Q(() => localStorage.getItem('pocketiq3d.mode'))) === 'running');
  const audR = await p.$$eval('#aud-choices button', (bs) => bs.map((x) => x.textContent)); ok('running audibles are runs', audR.length >= 3, audR);
  await p.selectOption('#mode-sel', 'passing'); await p.waitForTimeout(200);
  const pas = []; for (let i = 0; i < 6; i++) { pas.push(await Q(() => window.__qb3d.state.sim.play.type)); await Q(() => window.__qb3d.nextPlay()); }
  ok('passing mode only passes', pas.every((t) => t !== 'run'), pas);
  await p.selectOption('#mode-sel', 'normal');

  // 2. blitz pre-snap + protection dock + sack replay (MUG vs MAN = free rusher)
  const mug = await Q(() => (window.__qb3d.D.PLAYS.find((x) => x.pressure === 'MUG' && x.type !== 'run') || {}).id);
  await force(mug); await p.waitForTimeout(300);
  await p.click('#b-cov'); await p.click('#cov-choices button:nth-child(1)'); await p.click('#pres-choices button:nth-child(2)').catch(() => {});
  const prot = async (id) => { if (await p.isHidden('#pop-prot')) await p.click('#b-prot'); await p.click(`#prot-choices [data-id="${id}"]`); };
  await prot('MAN'); await p.click('#b-prot'); await p.waitForTimeout(300);
  await p.keyboard.down('KeyR'); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '02-blitz-presnap-protection-dock.png' }); await p.keyboard.up('KeyR');
  const pr = await Q(() => { const s = window.__qb3d.state.sim; return { prot: s.prot.id, sack: +s.sackTime.toFixed(2), free: s.prot.rows.filter((r) => r.kind === 'free').map((r) => r.rusher) }; });
  ok('MAN vs MUG leaves free rusher, short clock', pr.free.length > 0 && pr.sack < 2.2, pr);
  await prot('BOB'); await p.waitForTimeout(200);
  const pr2 = await Q(() => +window.__qb3d.state.sim.sackTime.toFixed(2)); ok('BOB vs MUG buys time', pr2 > pr.sack + 0.8, pr2);
  await prot('MAN'); await p.keyboard.press('Escape');
  await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(400);
  ok('prot chip shown', await Q(() => !document.getElementById('prot-chip').hidden), await p.textContent('#prot-chip'));
  await p.screenshot({ path: S + '03-blitz-live-prot-chip.png' });
  const sk = await finish(); ok('held ball = sack', /SACK/.test(sk), sk.slice(0, 220));
  await p.waitForTimeout(2200); await p.screenshot({ path: S + '04-sack-replay.png' });

  // 3. audible: iz into bear should check to a pass
  await force('iz_bear'); await p.waitForTimeout(300);
  await p.click('#b-aud'); const tree = await p.$$eval('#aud-choices button', (bs) => bs.map((x) => x.textContent)); out.tree = tree;
  await p.screenshot({ path: S + '05-audible-panel.png' });
  const best = await Q(() => { const q = window.__qb3d, s = q.state; const t = q.M.audibleTree(s.orig, s.mode); const ev = t.map((o) => ({ id: o.id, v: q.M.evalPlay(q.M.makeAudible(s.orig, o.id)).score })); ev.sort((a, b) => b.v - a.v); return ev[0]; });
  await p.keyboard.press('Escape'); await Q((id) => window.__qb3d.setAudible(id), best.id); await p.waitForTimeout(200);
  ok('audible applied', (await p.textContent('#concept')).includes('→'), await p.textContent('#concept'));
  await p.click('#b-cov'); await p.click('#cov-choices button:nth-child(1)').catch(() => {}); await p.click('#pres-choices button:nth-child(1)').catch(() => {}); await p.keyboard.press('Escape');
  await Q(() => window.__qb3d.doSnap());
  await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s.phase !== 'live' || s.t > 1.3; });
  await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase === 'live' && s.play.type !== 'run') q.throwTo(s.play.correct || s.play.progression[0]); });
  const ar = await finish(); ok('audible graded', /Audible/i.test(ar), ar.slice(0, 400));
  await p.screenshot({ path: S + '06-audible-result.png' });

  // 4. run play
  await force('power_odd'); await p.waitForTimeout(300).catch(() => {});
  if (!(await Q(() => window.__qb3d.state.sim.play.type === 'run'))) await Q(() => { const q = window.__qb3d; q.nextPlay(q.D.PLAYS.find((x) => x.type === 'run')); });
  await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(1300); await p.screenshot({ path: S + '07-run-play.png' });
  const rr = await finish(); ok('run graded', /Run decision/i.test(rr), rr.slice(0, 300));

  // 5. custom play: designer, save, run
  await p.click('#menu-btn'); await p.click('#menu-custom'); await p.waitForTimeout(300);
  await p.fill('#cd-name', 'Test Slant-Flat'); await p.selectOption('#cd-cov', 'cover3');
  const box = await p.locator('#cd-field').boundingBox();
  await p.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.35); // add a point for H
  await p.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.2);
  await p.screenshot({ path: S + '08-designer.png' });
  await p.click('#cd-save'); ok('custom saved', (await Q(() => JSON.parse(localStorage.getItem('pocketiq3d.customPlays.v1')).length)) === 1);
  await p.click('#cd-run'); await p.waitForTimeout(300);
  ok('custom play loaded', await Q(() => !!window.__qb3d.state.sim.play.custom), await Q(() => window.__qb3d.state.sim.play.name));
  await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(1200);
  await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase === 'live') q.throwTo('H'); });
  const cr = await finish(); ok('custom graded', cr.length > 50, cr.slice(0, 260));
  const exp = await Q(() => { const C = window.QBCustom; const j = localStorage.getItem(C.KEY); localStorage.setItem(C.KEY, '[]'); return C.importJSON(j); }); ok('export/import', /Imported 1/.test(exp), exp);

  // 6. INT celebration frames
  await p.selectOption('#difficulty', 'pro'); await p.selectOption('#mode-sel', 'passing'); await p.waitForTimeout(200);
  let got = false;
  for (let k = 0; k < 25 && !got; k++) {
    await Q(() => { const q = window.__qb3d; q.nextPlay(); q.doSnap(); });
    await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s.phase !== 'live' || s.t > (s.play.idealTime || 1.5) + 0.8; });
    await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase === 'live') q.throwTo(s.play.progression.find((x) => x !== s.play.correct) || s.play.progression[0]); });
    await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s.phase === 'done' || window.__qb3d.state.graded; }, null, { timeout: 9000 });
    if (await Q(() => window.__qb3d.state.sim.result.type === 'interception')) {
      got = true; const fr = [];
      for (let i = 0; i < 8; i++) { await p.waitForTimeout(450); fr.push(await Q(() => { const s = window.__qb3d.state; return { c: s.celebrate && +s.celebrate.c.toFixed(2), taunt: !document.getElementById('taunt').hidden && document.getElementById('taunt').textContent, hold: !!s.camHold, res: !document.getElementById('result').hidden }; })); await p.screenshot({ path: S + `09-int-celebration-${i}.png` }); }
      ok('INT celebration runs, taunt, cam hold, grade after ~2s', fr.some((f) => f.taunt) && fr.some((f) => f.hold) && /* v9: grade panel shows immediately (no INT gating) */ fr[0].res && fr.some((f) => f.c > 1.6), fr);
      await p.waitForSelector('#result:not([hidden])', { timeout: 15000 }); await p.screenshot({ path: S + '10-int-result.png' });
    } else await p.waitForFunction(() => window.__qb3d.state.graded, null, { timeout: 9000 });
  }
  ok('got an INT', got);

  // 7. stats by mode + history v2
  await p.click('#history-btn'); await p.waitForTimeout(200); await p.screenshot({ path: S + '11-progress-by-mode.png' });
  const hb = await p.textContent('#hist-body'); ok('by-mode stats', /Passing|Normal|Running/.test(hb), hb.slice(0, 200)); await p.click('#hist-close');
  ok('history v2', await Q(() => (JSON.parse(localStorage.getItem('pocketiq3d.history.v2') || '[]')).length > 3));
  // 8. phone landscape dock
  await p.setViewportSize({ width: 844, height: 390 }); await Q(() => window.__qb3d.nextPlay()); await p.waitForTimeout(600); await p.screenshot({ path: S + '12-phone-dock.png' });
  // fps idle
  await p.setViewportSize({ width: 1280, height: 800 }); await Q(() => { const q = window.__qb3d; q.nextPlay(); q.doSnap(); }); await p.waitForTimeout(3000);
  const fps = await Q(() => window.__fps); ok('fps >= 30 (software GL)', fps >= 30, fps);
  ok('no JS errors', errs.length === 0, errs);
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();
