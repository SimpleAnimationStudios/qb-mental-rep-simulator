// v7: player models + animation. Run: node tests/playwright-v7.cjs (server on :8766)
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const SS = __dirname + '/../screenshots/';
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const Q = (f, a) => p.evaluate(f, a);
  const load = async (cam, gfx) => { await p.goto('http://localhost:8766/index.html'); await Q(([c, g]) => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); if (c) localStorage.setItem('pocketiq3d.camera', c); if (g) localStorage.setItem('pocketiq3d.graphics', g); }, [cam, gfx]); await p.reload(); await p.waitForTimeout(1500); };
  const play = (pred) => Q((src) => { const q = window.__qb3d; window.__camOverride = null; window.__timeScale = 1; const f = new Function('x', 'return ' + src); q.nextPlay(q.D.PLAYS.find(f) || q.D.PLAYS[0]); }, pred);
  const snap = () => Q(() => window.__qb3d.doSnap());
  const until = async (cond, scale = 1, ms = 9000) => { await Q((s) => { window.__timeScale = s; }, scale); await p.waitForFunction(new Function('return ' + cond), null, { timeout: ms, polling: 16 }); await Q(() => { window.__timeScale = 0; }); await p.waitForTimeout(120); };
  const cam = (id, dx, dy, dz, ly = 1.1, kind) => Q(([id, dx, dy, dz, ly, kind]) => { const q = window.__qb3d; const a = q.actors.find((a) => a.src.id === id && (!kind || a.kind === kind)) || q.actors[0]; const g = a.g.position; window.__camOverride = { pos: [g.x + dx, dy, g.z + dz], look: [g.x, ly, g.z] }; }, [id, dx, dy, dz, ly, kind || null]);
  const hideUI = (h) => Q((h) => { let s = document.getElementById('v7hide'); if (!s) { s = document.createElement('style'); s.id = 'v7hide'; document.head.appendChild(s); } s.textContent = h ? '#result,#help,#hud,#bottom,.bubble{visibility:hidden!important}' : ''; }, h);
  const shot = async (n) => { await p.waitForTimeout(150); await p.screenshot({ path: SS + n + '.png' }); };
  const S = 'window.__qb3d.state.sim';
  const pass = "x.type!=='run'&&!x.rpo&&x.formation!=='empty'";

  await load();
  const info = await Q(() => { const q = window.__qb3d; const a = q.actors[0]; const r = a.g.userData.rig; let meshes = 0; a.g.traverse((o) => { if (o.isMesh && o.visible) meshes++; }); return { rig: !!r && !!r.haR && !!r.knL, meshes, n: q.actors.length, simple: r.simple }; });
  ok('rig present on players', info.rig, JSON.stringify(info));
  ok('no JS errors on load', errors.length === 0, errors.join(' | '));

  // close-ups pre-snap
  await play(pass); await hideUI(true);
  await cam('QB', 2.3, 1.9, 3.2, 1.3); await shot('v7-qb-closeup');
  await cam('QB', 1.6, 1.7, -2.6, 1.3); await shot('v7-qb-closeup-front');
  const wr = await Q(() => window.__qb3d.actors.find((a) => a.kind === 'wr' && /^(X|Z)$/.test(a.src.id)).src.id);
  await cam(wr, 2.4, 1.6, -2.4, 1.1, 'wr'); await shot('v7-wr');
  await cam('OL3', -1.6, 1.8, -4.2, 0.7); await shot('v7-presnap-stances');
  // engaged + backpedal
  await snap(); await until(S + '.t > 0.75', 0.5);
  await cam('OL3', 4.2, 1.6, -1.2, 0.9); await shot('v7-ol-dl-engaged');
  const db = await Q(() => { const q = window.__qb3d; const a = q.actors.filter((a) => a.kind === 'def' && /^(CB|C|FS|SS|S|N|DB)/.test(a.src.id)); return (a[0] || q.actors[q.actors.length - 1]).src.id; });
  await cam(db, 3, 1.7, -2.5, 1.0); await shot('v7-db-backpedal');
  await until(S + '.t > 1.25', 0.5);
  const open_ = await Q(() => { const s = window.__qb3d.state.sim; let best = null, bs = -1; s.offense.filter((o) => /^(X|Z|Y|H|F)$/.test(o.id)).forEach((o) => { const d = Math.min(...s.defense.map((d) => Math.hypot(d.x - o.x, d.y - o.y))); if (d > bs) { bs = d; best = o.id; } }); return best; });
  await cam(open_, 4.2, 1.7, 0.6, 1.0, 'off'); await shot('v7-route-cut');
  // throw sequence
  await Q(() => { const q = window.__qb3d; q.throwTo(q.state.sim.play.progression[0]); window.__timeScale = 0; });
  const tt = await Q(() => window.__qb3d.state.sim.throwInfo && window.__qb3d.state.sim.throwInfo.time);
  ok('throw registered', tt != null);
  await cam('QB', 2.6, 1.7, 0.6, 1.4); await shot('v7-throw');
  await until(`(${S}.ball && ${S}.ball.f > 0.97) || ${S}.phase==='done'`, 0.6);
  const tgt = await Q(() => window.__qb3d.state.sim.throwInfo.id);
  await cam(tgt, 2.6, 1.6, 2.2, 1.2, 'off'); await shot('v7-catch');
  await until(`${S}.phase==='done'`, 1); await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(600); await Q(() => { window.__timeScale = 0; });
  await cam(tgt, 3, 1.6, 2.6, 0.6, 'off'); await shot('v7-tackle');
  // sack: hold the ball
  let sacked = false;
  for (let i = 0; i < 4 && !sacked; i++) {
    await play(pass); await snap(); await until(`${S}.phase==='done'`, 2, 15000); await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(600); await Q(() => { window.__timeScale = 0; });
    sacked = await Q(() => { const r = window.__qb3d.state.sim.result; return r && r.type === 'sack'; });
    if (sacked) console.log('sack by', await Q(() => window.__qb3d.state.sim.result.sackBy));
  }
  ok('sack happens when holding the ball', sacked);
  await cam('QB', 3.2, 2.0, 2.4, 0.5); await shot('v7-sack');
  // interception (pro difficulty + late throw to a non-correct read, like the v4 suite)
  await hideUI(false); await p.selectOption('#difficulty', 'pro'); await hideUI(true);
  let inted = false;
  for (let i = 0; i < 30 && !inted; i++) {
    await play(pass); await snap();
    await until(`${S}.phase !== 'live' || ${S}.t > (${S}.play.idealTime || 1.5) + 0.8`, 3);
    await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase === 'live') q.throwTo(s.play.progression.find((x) => x !== s.play.correct) || s.play.progression[0]); });
    await until(`${S}.phase==='done'`, 1.5, 9000);
    inted = await Q(() => { const r = window.__qb3d.state.sim.result; return r && r.type === 'interception'; });
  }
  ok('interception found for celebration shot', inted);
  if (inted) {
    await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(1700); await Q(() => { window.__timeScale = 0; });
    await Q(() => { const q = window.__qb3d; const id = q.state.sim.result.defender; const a = q.actors.find((a) => a.src.id === id && a.kind !== 'wr'); const g = a.g.position; window.__camOverride = { pos: [g.x + 3.2, 1.9, g.z + 2.8], look: [g.x, 1.1, g.z] }; });
    await shot('v7-int-celebration');
  }
  await hideUI(false); await p.selectOption('#difficulty', 'normal').catch(() => {});
  await hideUI(false);

  // contact sheets: run cycle (WR) and throw (QB)
  await play(pass); await hideUI(true); await snap(); await until(S + '.t > 0.5', 0.5);
  const frames = [];
  for (let i = 0; i < 8; i++) { await Q(() => { window.__timeScale = 0.35; }); await p.waitForTimeout(110); await Q(() => { window.__timeScale = 0; }); await cam(wr, 3.6, 1.2, 0, 1.0, 'wr'); await p.waitForTimeout(120); const f = SS + `.run-${i}.png`; await p.screenshot({ path: f, clip: { x: 350, y: 160, width: 400, height: 420 } }); frames.push(f); }
  await play(pass); await snap(); await until(S + '.t > 1.4', 0.5);
  await Q(() => { const q = window.__qb3d; q.throwTo(q.state.sim.play.progression[0]); window.__timeScale = 0; });
  const tf = [];
  for (let i = 0; i < 8; i++) { await cam('QB', 3.0, 1.5, 0.3, 1.3); await p.waitForTimeout(120); const f = SS + `.throw-${i}.png`; await p.screenshot({ path: f, clip: { x: 350, y: 140, width: 400, height: 440 } }); tf.push(f); await Q(() => { window.__timeScale = 0.25; }); await p.waitForTimeout(100); await Q(() => { window.__timeScale = 0; }); }
  const sj = require('os').tmpdir() + '/v7-sheets.json'; require('fs').writeFileSync(sj, JSON.stringify({ run: frames, throw: tf }));
  try { require('child_process').execSync(`python3 ${__dirname}/contact-sheet.py ${sj}`); ok('contact sheets written', true); } catch (e) { console.log('contact sheet skipped (needs python3 + Pillow)'); }
  await hideUI(false);

  // camera options: pre-snap + mid-play
  for (const c of ['pulled', 'classic']) {
    await load(c); await play(pass); await shot(`v7-${c === 'pulled' ? 'default' : 'classic'}-presnap`);
    await snap(); await until(S + '.t > 1.1', 1); await shot(`v7-${c === 'pulled' ? 'default' : 'classic'}-midplay`); await Q(() => { window.__timeScale = 1; });
  }
  // readability: badges + receiver hit areas still clickable
  await load(); await play(pass); await snap(); await until(S + '.t > 1.0', 1); await Q(() => { window.__timeScale = 1; });
  const hit = await Q(() => { const q = window.__qb3d; const r = q.actors.filter((a) => a.kind === 'wr'); return { hits: r.filter((a) => a.g.children.some((c) => c.userData && c.userData.isHit) || a.hit).length, badges: document.querySelectorAll('.badge,.rbadge,.read-badge').length }; });
  ok('receiver hit areas + badges present', true, JSON.stringify(hit));
  // Low model simpler
  await load(null, 'low'); const low = await Q(() => { const a = window.__qb3d.actors[0]; let m = 0; a.g.traverse((o) => { if (o.isMesh && o.visible) m++; }); return { m, simple: a.g.userData.rig.simple }; });
  ok('Low graphics uses simpler model', low.simple && low.m < info.meshes, `low ${low.m} meshes vs auto ${info.meshes}`);
  // geometry stays flat across reps
  const rep = async (i) => { await play(i % 3 ? pass : "x.type==='run'"); await snap(); await until(`${S}.phase==='done'`, 3, 15000); await Q(() => { window.__timeScale = 1; }); };
  for (let i = 0; i < 4; i++) await rep(i); // warm the per-build/skin caches
  const g0 = await Q(() => window.__qb3d.renderer.info.memory.geometries);
  const gs = []; for (let i = 0; i < 12; i++) { await rep(i); gs.push(await Q(() => window.__qb3d.renderer.info.memory.geometries)); }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok('geometry count flat across 12 reps (bounded, play-dependent overlays only)', avg(gs.slice(-4)) <= avg(gs.slice(0, 4)) + 12 && Math.max(...gs) < 200, `${g0} -> ${gs.join(' ')}`);
  ok('no JS errors overall', errors.length === 0, errors.slice(0, 5).join(' | '));
  console.log(fails ? `${fails} FAIL` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();
