// v6 checks: Camera setting (pulled-back default / classic), Graphics setting, perf counters. node tests/playwright-v6.cjs
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const S = 'screenshots/v6-'; let fails = 0;
const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, i !== undefined ? JSON.stringify(i) : ''); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const Q = (f, a) => p.evaluate(f, a);
  const load = async (cam, gfx) => { await p.goto('http://localhost:8766/index.html'); await Q(([c, g]) => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); if (c) localStorage.setItem('pocketiq3d.camera', c); if (g) localStorage.setItem('pocketiq3d.graphics', g); }, [cam, gfx]); await p.reload(); await p.waitForTimeout(1500); };
  const force = (pred) => Q((src) => { const q = window.__qb3d; q.nextPlay(q.D.PLAYS.find(eval(src))); }, pred);
  const rel = () => Q(() => { const q = window.__qb3d, c = q.camera.position, g = q.actors[0].g.position; return { dx: +(c.x - g.x).toFixed(2), dy: +c.y.toFixed(2), dz: +(c.z - g.z).toFixed(2), fov: q.camera.fov }; });
  for (const [cam, tag, form] of [['pulled', 'default', 'doubles'], ['classic', 'classic', 'doubles'], ['classic', 'classic-uc', 'iform']]) {
    await load(cam === 'pulled' ? null : cam);
    ok(tag + ': camera setting read', (await Q(() => window.__quality().camera)) === cam);
    await force(`(x) => x.type !== 'run' && x.formation === '${form}'`) ; await p.waitForTimeout(1500);
    const pre = await rel();
    if (tag !== 'classic-uc') await p.screenshot({ path: S + tag + '-presnap.png' });
    await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(250); const early = await rel();
    await p.waitForTimeout(700); const mid = await rel();
    if (tag !== 'classic-uc') await p.screenshot({ path: S + tag + '-midplay.png' });
    console.log(tag, { pre, early, mid });
    if (cam === 'classic') {
      // v9: snap framing assist widens FOV / dollies back so sideline routes stay in frame (brief item 4) — behind the QB, not the fixed v6 offset
      ok(tag + ': behind QB pre-snap (v9 framing assist)', Math.abs(pre.dx) < 1.5 && pre.dz > 5.9 && pre.dz < 18 && pre.dy > 4.2 && pre.dy < 10 && pre.fov >= 62 && pre.fov <= 80.5, pre);
      ok(tag + ': no zoom/ease at snap (offset constant)', Math.abs(early.dz - pre.dz) < 0.8 && Math.abs(early.dy - pre.dy) < 0.2 && Math.abs(early.fov - pre.fov) < 2, { pre, early });
      ok(tag + ': still behind QB mid-play', mid.dz > 5.3 && mid.dz < 18 && mid.dy > 4.2 && mid.dy < 10 && mid.fov >= 62, mid); // v11: framing assist may keep a wider/pulled frame
    } else ok('default: pulled-back pre-snap then eases in', pre.dy > 10 && mid.dy < 6, { pre, mid });
    // look-around + coach view in both modes
    const y0 = await Q(() => window.__qb3d.state.yawTarget); await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(400); await p.keyboard.up('ArrowLeft');
    ok(tag + ': arrow look-around', (await Q(() => window.__qb3d.state.yawTarget)) !== y0);
    await Q(() => window.__qb3d.setView('coach')); await p.waitForTimeout(1200);
    ok(tag + ': coach view', (await Q(() => window.__qb3d.camera.position.y)) > 30); await Q(() => window.__qb3d.setView('qb'));
  }
  // menu settings
  await load();
  await p.click('#menu-btn'); await p.waitForTimeout(200);
  ok('settings visible in menu', await p.isVisible('#cam-sel') && await p.isVisible('#gfx-sel'));
  await p.selectOption('#cam-sel', 'classic'); ok('camera persisted', (await Q(() => localStorage.getItem('pocketiq3d.camera'))) === 'classic');
  ok('camera applies live', (await Q(() => window.__quality().camera)) === 'classic');
  await p.screenshot({ path: S + 'graphics-setting.png' });
  await Promise.all([p.waitForNavigation(), p.selectOption('#gfx-sel', 'low')]); await p.waitForTimeout(1500);
  const q = await Q(() => window.__quality()); ok('graphics persisted + applied after reload', q.gfx === 'low' && q.light, q);
  await Q(() => localStorage.setItem('pocketiq3d.graphics', 'high')); await p.reload(); await p.waitForTimeout(1500);
  const qh = await Q(() => window.__quality()); ok('high = DPR-capped, full shadows', qh.gfx === 'high' && !qh.light && qh.renderScale <= 2, qh);
  // pooling / leaks
  // v8: warm up first — the first reps lazily build one-off geometries (per-build caches, badges, overlays); growth is bounded (measured flat from ~rep 15 to rep 60), not a leak
  for (let i = 0; i < 18; i++) { await Q(() => window.__qb3d.nextPlay()); await p.waitForTimeout(200); }
  const g0 = await Q(() => window.__qb3d.renderer.info.memory.geometries);
  for (let i = 0; i < 6; i++) { await Q(() => window.__qb3d.nextPlay()); await p.waitForTimeout(200); }
  const g1 = await Q(() => window.__qb3d.renderer.info.memory.geometries);
  ok('no geometry growth across reps', g1 - g0 < 10, { g0, g1 }); // v9: post-play props (loose ball, trail, caption) make the count fluctuate 155–163 over 60 full reps — bounded, no leak
  ok('no JS errors', errs.length === 0, errs);
  console.log(fails ? `${fails} FAIL` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();
