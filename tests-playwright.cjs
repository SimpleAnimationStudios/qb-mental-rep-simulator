// Headless smoke test: node tests-playwright.cjs (server on :8766). Uses Playwright from /tmp/pwt.
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const S = 'screenshots/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8766/index.html'); await p.waitForTimeout(1500);
  // Panel never covers the centre: check dock rect against the middle 50%x50% of the screen.
  const clear = async (tag) => { const r = await p.evaluate(() => { const e = document.getElementById('presnap'); const b = e.getBoundingClientRect(); const W = innerWidth, H = innerHeight;
      const cx0 = W * 0.25, cx1 = W * 0.75, cy0 = H * 0.2, cy1 = H * 0.75; const hit = !(b.right < cx0 || b.left > cx1 || b.bottom < cy0 || b.top > cy1);
      return { rect: [b.left, b.top, b.right, b.bottom].map(Math.round), coversCentre: hit, visible: getComputedStyle(e).display !== 'none' }; }); console.log('panel', tag, JSON.stringify(r)); return r; };
  const tapCorrect = () => p.evaluate(() => { const q = window.__qb3d, s = q.state.sim; const a = q.actors.find((a) => a.src.id === s.play.correct);
    const v = a.g.position.clone(); v.y = 1.2; v.project(q.camera); const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
    const c = document.querySelector('#stage canvas'); const o = { clientX: x, clientY: y, bubbles: true, pointerId: 7 };
    c.dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o)); return s.throwInfo && s.throwInfo.id; });
  const pan = async () => { const tx = await p.evaluate(() => { const s = window.__qb3d.state.sim, o = s.offense.find((o) => o.id === s.play.correct); return o.posAt(s.t + 0.6).x - 26.65; });
    for (let k = 0; k < Math.min(3, Math.round(Math.abs(tx) / 7)); k++) await p.keyboard.press(tx < 0 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(500); };

  await p.click('#b-cov'); await p.click('#cov-choices button:nth-child(3)'); await p.click('#pres-choices button:nth-child(1)'); await p.click('#b-cov');
  await clear('desktop-presnap');
  await p.screenshot({ path: S + '01-presnap-dock-desktop.png' });
  // hold ROUTES with pointer (pointerId 3) — and tap a receiver with another pointer meanwhile later
  const rb = await p.locator('#routes-btn').boundingBox();
  await p.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2); await p.mouse.down(); await p.waitForTimeout(400);
  console.log('routes visible while held:', await p.evaluate(() => document.getElementById('routes-btn').classList.contains('on')));
  await p.screenshot({ path: S + '02-routes-held-presnap.png' });
  await p.mouse.up(); await p.waitForTimeout(100);
  console.log('routes visible after release:', await p.evaluate(() => document.getElementById('routes-btn').classList.contains('on')));
  // pointercancel also hides
  await p.evaluate(() => { const b = document.getElementById('routes-btn'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true }));
    const on = b.classList.contains('on'); b.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 9, bubbles: true })); window.__rc = [on, b.classList.contains('on')]; });
  console.log('cancel test [on, afterCancel]:', await p.evaluate(() => window.__rc));

  await p.click('#snap-btn'); await clear('desktop-live');
  console.log('call chip:', await p.textContent('#call-chip'));
  await p.waitForTimeout(900);
  // multitouch: routes held via keyboard R + tap receiver
  await p.keyboard.down('KeyR'); await pan();
  await p.screenshot({ path: S + '03-midplay-routes-held.png' });
  console.log('thrown while routes held:', await tapCorrect());
  await p.keyboard.up('KeyR');
  await p.waitForTimeout(300); await p.screenshot({ path: S + '04-ball-in-air.png' });
  await p.waitForSelector('#result:not([hidden])', { timeout: 9000 });
  console.log('rep1', await p.textContent('#res-outcome'), 'SIM', await p.textContent('#sim-score'));
  await p.waitForTimeout(2500); await p.screenshot({ path: S + '05-result-coachview-replay.png' });

  // Force an INT: late throw to a covered (wrong) read at Pro until one happens.
  await p.selectOption('#difficulty', 'pro'); await p.waitForTimeout(300);
  let gotInt = false;
  for (let k = 0; k < 14 && !gotInt; k++) {
    await p.evaluate(() => { const q = window.__qb3d; window.__timeScale = 2; q.nextPlay(); q.doSnap(); });
    await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s && (s.phase !== 'live' || s.t > s.play.idealTime + 0.7); }, null, { timeout: 20000 });
    await p.evaluate(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase !== 'live') return; const id = (s.play.progression || []).find((x) => x !== s.play.correct) || s.play.correct; q.throwTo(id); });
    await p.waitForFunction(() => window.__qb3d.state.graded || (window.__qb3d.state.sim && window.__qb3d.state.sim.phase === 'done'), null, { timeout: 15000 });
    const out = await p.textContent('#res-outcome'); await p.waitForTimeout(150); console.log('force-late', k, out);
    if (out.startsWith('INTERCEPTED')) {
      gotInt = true; await p.screenshot({ path: S + '06-int-banner.png' });
      await p.waitForTimeout(2600); await p.screenshot({ path: S + '07-int-result-replay.png' });
      console.log('coach:', await p.textContent('#res-coach'));
    } else { await p.waitForSelector('#result:not([hidden])'); }
  }
  await p.click('#history-btn'); await p.waitForTimeout(200); console.log('progress:', (await p.textContent('#hist-body')).slice(0, 160));
  await p.click('#hist-close');
  // v3: unlimited pre-snap + detailed variant picker + variant grade
  await p.evaluate(() => { localStorage.setItem('pocketiq3d.unlimited', 'off'); localStorage.removeItem('pocketiq3d.detailed'); });
  await p.evaluate(() => window.__qb3d.nextPlay()); await p.waitForTimeout(300);
  await p.click('#q-unl'); console.log('unlimited stored:', await p.evaluate(() => localStorage.getItem('pocketiq3d.unlimited')));
  await p.evaluate(() => { const q = window.__qb3d; for (let i = 0; i < 80 && q.state.sim.play.id !== 'smash_c3c'; i++) q.nextPlay(); });
  console.log('play:', await p.evaluate(() => window.__qb3d.state.sim.play.id));
  await p.click('#b-cov'); await p.click('#cov-choices button:nth-child(4)'); await p.waitForTimeout(100);
  console.log('variant chips:', await p.$$eval('#var-choices button', (b) => b.map((x) => x.textContent)));
  await p.click('#var-choices button:nth-child(1)'); await p.click('#pres-choices button:nth-child(1)');
  await p.waitForTimeout(9000);
  console.log('after 9s phase:', await p.evaluate(() => window.__qb3d.state.sim.phase), 'timer:', await p.textContent('#presnap-timer'));
  await clear('desktop-variants'); await p.screenshot({ path: S + '10-variant-picker-unlimited.png' });
  await p.keyboard.press('Enter'); console.log('after Enter phase:', await p.evaluate(() => window.__qb3d.state.sim.phase));
  await p.waitForFunction(() => window.__qb3d.state.sim.t > window.__qb3d.state.sim.play.idealTime - 0.1);
  await p.evaluate(() => { const q = window.__qb3d; q.throwTo(q.state.sim.play.correct); });
  await p.waitForSelector('#result:not([hidden])', { timeout: 9000 }); await p.waitForTimeout(400);
  console.log('variant result:', (await p.textContent('#result')).replace(/\s+/g, ' ').slice(0, 700));
  await p.screenshot({ path: S + '11-variant-grade-result.png' });
  await p.click('#history-btn'); await p.waitForTimeout(200); await p.screenshot({ path: S + '12-progress-by-variant.png' });
  console.log('progress v3:', (await p.textContent('#hist-body')).slice(0, 400)); await p.click('#hist-close');
  // phone landscape
  await p.setViewportSize({ width: 844, height: 390 }); await p.evaluate(() => window.__qb3d.nextPlay()); await p.waitForTimeout(700);
  await p.click('#b-cov'); await p.click('#cov-choices button:nth-child(3)'); await p.click('#b-cov'); await clear('phone-presnap'); await p.screenshot({ path: S + '08-phone-landscape-rail.png' });
  await p.evaluate(() => window.__qb3d.doSnap()); await p.waitForTimeout(700); await clear('phone-live');
  await p.screenshot({ path: S + '09-phone-landscape-live.png' });
  console.log('fps', await p.evaluate(() => window.__fps));
  console.log('errors:', errs); await b.close();
})();
