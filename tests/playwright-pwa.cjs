// PWA offline test (Chromium): node tests/playwright-pwa.cjs
// Serves the app twice — at the site root (:8766/) and under a nested sub-path (:8767/nested/pocket-iq/) — and for each:
// service worker activates with the right scope, every precached file is in the versioned cache (and nothing else),
// then the browser goes OFFLINE: reload + ?query navigation work, a full rep (snap → throw → graded result) plays,
// and the analysis Web Worker (with its importScripts) loads offline. A never-visited browser is NOT expected to work offline.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const R = path.join(__dirname, '..'); let fails = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x !== '' ? ' — ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ASSETS = JSON.parse('[' + fs.readFileSync(path.join(R, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].replace(/'/g, '"') + ']');
const CACHE = 'pocketiq3d-shell-' + fs.readFileSync(path.join(R, 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];

(async () => {
  const nest = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-nest-')); fs.mkdirSync(path.join(nest, 'nested'));
  fs.symlinkSync(R, path.join(nest, 'nested', 'pocket-iq'));
  const servers = [spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: R, stdio: 'ignore' }),
    spawn('python3', ['-m', 'http.server', '8767', '--bind', '127.0.0.1'], { cwd: nest, stdio: 'ignore' })];
  await sleep(1200);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const base of ['http://localhost:8766/', 'http://localhost:8767/nested/pocket-iq/']) {
      const tag = base.includes('nested') ? 'nested' : 'root';
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      const ready = () => p.waitForFunction(() => window.__qb3d && window.__qb3d.state && window.__qb3d.state.sim, null, { timeout: 30000 });
      await p.goto(base); await ready();
      await p.evaluate(() => { localStorage.setItem('pocketiq3d.unlimited', 'on'); });
      const reg = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready;
        if (r.active.state !== 'activated') await new Promise((res) => { r.active.addEventListener('statechange', () => r.active.state === 'activated' && res()); setTimeout(res, 10000); });
        return { scope: r.scope, active: r.active && r.active.state, uvc: r.updateViaCache }; });
      ok(`${tag}: service worker active, scope = app folder`, reg.active === 'activated' && reg.scope === base, reg);
      ok(`${tag}: sw.js fetched with updateViaCache none`, reg.uvc === 'none');
      await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
      ok(`${tag}: page controlled by service worker (clients.claim)`, await p.evaluate(() => !!navigator.serviceWorker.controller));
      const cache = await p.evaluate(async (name) => { const keys = await caches.keys(); const c = await caches.open(name); const reqs = await c.keys(); return { keys, urls: reqs.map((r) => r.url) }; }, CACHE);
      const want = ASSETS.map((a) => new URL(a, base).href);
      ok(`${tag}: cache '${CACHE}' holds all ${want.length} shell files`, want.every((u) => cache.urls.includes(u)), want.filter((u) => !cache.urls.includes(u)));
      ok(`${tag}: nothing outside the shell list cached`, cache.urls.length === want.length && cache.keys.every((k) => k.startsWith('pocketiq3d-shell-')), cache);
      const mime = await p.evaluate(async (u) => { const r = await (await caches.open(u[0])).match(u[1]); return r && r.headers.get('content-type'); }, [CACHE, new URL('js/game3d.js', base).href]);
      ok(`${tag}: cached module keeps JS MIME type`, /javascript/.test(mime || ''), mime);

      // ---- offline ----
      await ctx.setOffline(true);
      const net = await p.evaluate(() => fetch('https://example.com/', { mode: 'no-cors' }).then(() => 'online', () => 'offline'));
      ok(`${tag}: browser really offline`, net === 'offline', net);
      errs.length = 0;
      await p.reload(); await ready();
      ok(`${tag}: offline reload boots the game (3D scene + sim)`, await p.evaluate(() => !!(window.__qb3d.renderer && window.__qb3d.state.sim)));
      await p.goto(base + 'index.html?home=1'); await ready();
      ok(`${tag}: offline navigation with query string served`, true);
      await p.goto(base); await ready();
      // play a full rep offline
      await p.evaluate(() => window.__qb3d.doSnap()); await p.waitForTimeout(400);
      await p.evaluate(() => { const q = window.__qb3d, s = q.state.sim; q.throwTo(s.play.correct || s.play.progression[0]); });
      let graded = true; try { await p.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 30000 }); } catch { graded = false; }
      ok(`${tag}: offline rep plays to a graded result`, graded, graded ? await p.evaluate(() => document.getElementById('res-outcome').textContent) : '');
      // analysis worker + its importScripts offline
      const wk = await p.evaluate(() => new Promise((res) => { const w = new Worker('js/analysis-worker.js');
        const t = setTimeout(() => res('timeout'), 10000);
        w.onmessage = (e) => { clearTimeout(t); res('message:' + (typeof e.data.id)); w.terminate(); };
        w.onerror = (e) => { clearTimeout(t); res('error:' + e.message); };
        w.postMessage({ id: 1, base: null, play: { type: 'run' }, opts: {}, mode: 'normal' }); }));
      ok(`${tag}: analysis worker + importScripts load offline`, wk === 'message:number', wk);
      ok(`${tag}: no page errors while offline`, errs.length === 0, errs.slice(0, 3));
      await ctx.setOffline(false); await ctx.close();
    }
    // Chrome's own installability verdict (CDP Page.getInstallabilityErrors) on the nested sub-path
    { const ctx = await b.newContext(); const p = await ctx.newPage(); await p.goto('http://localhost:8767/nested/pocket-iq/');
      await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(500);
      const cdp = await ctx.newCDPSession(p); const r = await cdp.send('Page.getInstallabilityErrors').catch((e) => ({ err: String(e) }));
      const man = await cdp.send('Page.getAppManifest').catch(() => ({}));
      ok('Chrome installability: no errors', r.installabilityErrors && r.installabilityErrors.length === 0, r);
      ok('Chrome parsed manifest without errors', man.url && man.errors && man.errors.length === 0, { url: man.url, errors: man.errors });
      await ctx.close(); }
    // update flow: a changed sw.js installs in the background, waits, shows "Update ready", never reloads by itself
    { const up = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-up-'));
      for (const f of ['index.html', 'style.css', 'manifest.json', 'pwa.js', 'sw.js']) fs.copyFileSync(path.join(R, f), path.join(up, f));
      for (const d of ['js', 'vendor', 'icons']) fs.cpSync(path.join(R, d), path.join(up, d), { recursive: true });
      const srv = spawn('python3', ['-m', 'http.server', '8768', '--bind', '127.0.0.1'], { cwd: up, stdio: 'ignore' }); await sleep(900);
      const ctx = await b.newContext({ viewport: { width: 844, height: 390 } }); const p = await ctx.newPage();
      const ready = () => p.waitForFunction(() => window.__qb3d && window.__qb3d.state && window.__qb3d.state.sim, null, { timeout: 30000 });
      await p.goto('http://localhost:8768/'); await ready(); await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
      await p.evaluate(() => localStorage.setItem('pocketiq3d.history.v2', '[{"probe":1}]'));
      fs.writeFileSync(path.join(up, 'sw.js'), fs.readFileSync(path.join(up, 'sw.js'), 'utf8').replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-next'"));
      await p.evaluate(() => { window.__marker = 'same-page'; return window.__pwa.registration.update(); });
      await p.waitForSelector('#pwa-update', { timeout: 20000 }).catch(() => {});
      const st = await p.evaluate(async () => ({ btn: !!document.getElementById('pwa-update'), marker: window.__marker, keys: await caches.keys(), waiting: !!window.__pwa.registration.waiting }));
      ok('update: new version waits, button shown, page NOT reloaded, old cache still serving', st.btn && st.waiting && st.marker === 'same-page' && st.keys.length === 2, st);
      await Promise.all([p.waitForNavigation({ timeout: 20000 }), p.click('#pwa-update')]); await ready();
      const after = await p.evaluate(async () => ({ marker: window.__marker || null, keys: await caches.keys(), hist: localStorage.getItem('pocketiq3d.history.v2') }));
      ok('update: tap → reload into new version, old cache removed, saved progress kept', after.marker === null && after.keys.length === 1 && after.keys[0].endsWith('-next') && after.hist === '[{"probe":1}]', after);
      await ctx.close(); srv.kill(); fs.rmSync(up, { recursive: true, force: true }); }
    // a browser that never loaded the app gets nothing offline (honest limitation, not a bug)
    const fresh = await b.newContext(); const fp = await fresh.newPage(); await fresh.setOffline(true);
    let loaded = true; try { await fp.goto('http://localhost:8766/', { timeout: 8000 }); } catch { loaded = false; }
    ok('fresh never-visited browser offline: not available (expected)', !loaded); await fresh.close();
  } finally { await b.close(); servers.forEach((s) => s.kill()); fs.rmSync(nest, { recursive: true, force: true }); }
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
