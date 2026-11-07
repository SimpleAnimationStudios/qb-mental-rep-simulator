// v5 UI checks: bubbles + popovers + glow + top toggles + under-centre camera. node tests/playwright-v5.cjs
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const S = 'screenshots/v5-'; let fails = 0;
const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, i !== undefined ? JSON.stringify(i) : ''); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8766/index.html'); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); }); await p.reload(); await p.waitForTimeout(1800);
  const Q = (f, a) => p.evaluate(f, a);
  const force = (pred) => Q((src) => { const q = window.__qb3d; const f = eval(src); q.nextPlay(q.D.PLAYS.find(f)); }, pred);
  await force("(x) => x.type !== 'run' && x.formation === 'doubles'"); await p.waitForTimeout(500);
  const centre = () => Q(() => { const W = innerWidth, H = innerHeight; return [...document.querySelectorAll('#presnap .bubble, #presnap .pop')].filter((e) => e.offsetParent).some((e) => { const r = e.getBoundingClientRect(); return !(r.right < W * .25 || r.left > W * .75 || r.bottom < H * .2 || r.top > H * .75); }); });
  const glow = () => Q(() => Object.fromEntries(['b-cov', 'b-prot', 'b-aud'].map((id) => { const e = document.getElementById(id); return [id, (e.classList.contains('ans') ? (e.classList.contains('full') ? 'full' : 'glow') : 'none') + '|' + e.querySelector('small').textContent]; })));
  ok('bubbles present, no dock bar', await Q(() => ['b-cov', 'b-prot', 'b-aud', 'snap-btn'].every((i) => document.getElementById(i).offsetParent) && !document.querySelector('.dock')));
  ok('toggles in top HUD', await Q(() => !!document.querySelector('#hud-top #q-det') && !!document.querySelector('#hud-top #q-unl')));
  ok('nothing glows initially', Object.values(await glow()).every((v) => v.startsWith('none')), await glow());
  ok('closed bubbles clear of centre', !(await centre()));
  await p.screenshot({ path: S + '01-presnap-bubbles-closed.png' });
  // coverage panel
  await p.click('#b-cov'); ok('coverage pop open', await p.isVisible('#pop-cov'));
  await p.click('#cov-choices button:nth-child(3)'); await p.click('#var-choices button:nth-child(1)');
  await p.waitForTimeout(150); ok('coverage-only = soft glow', (await glow())['b-cov'].startsWith('glow'), await glow());
  await p.click('#pres-choices button:nth-child(3)'); await p.click('#pvar-choices button:nth-child(1)').catch(() => {});
  await p.waitForTimeout(150); ok('coverage + pressure = full glow', (await glow())['b-cov'].startsWith('full'), await glow());
  await p.screenshot({ path: S + '02-coverage-panel.png' });
  // only one at a time
  await p.click('#b-prot'); ok('one panel at a time', (await p.isVisible('#pop-prot')) && !(await p.isVisible('#pop-cov')));
  await p.click('#prot-choices [data-id="SLIDE_L"]'); await p.waitForTimeout(150);
  ok('protection glow', (await glow())['b-prot'].startsWith('glow'), await glow());
  await p.screenshot({ path: S + '03-protection-panel.png' });
  await p.click('#b-prot'); ok('tap bubble again closes', !(await p.isVisible('#pop-prot')));
  await p.click('#b-aud'); await p.waitForTimeout(100); await p.screenshot({ path: S + '04-audible-panel.png' });
  const aud = await p.$$eval('#aud-choices button', (x) => x.map((e) => e.textContent)); ok('audible options', aud.length >= 3, aud);
  await p.click('#aud-choices button:nth-child(2)'); await p.waitForTimeout(150);
  ok('audible glow', (await glow())['b-aud'].startsWith('glow'), await glow());
  await p.keyboard.press('Escape'); ok('Esc closes', !(await p.isVisible('#pop-aud')));
  await p.click('#b-cov'); await p.mouse.click(640, 300); ok('outside tap closes', !(await p.isVisible('#pop-cov')));
  await p.screenshot({ path: S + '05-glow-answered.png' });
  await p.click('#b-aud'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('snap (Enter) closes panels + minimal', (await Q(() => window.__qb3d.state.sim.phase)) === 'live' && !(await p.isVisible('#pop-aud')) && (await Q(() => document.getElementById('presnap').classList.contains('live'))));
  ok('call chip kept', await p.isVisible('#call-chip'), await p.textContent('#call-chip'));
  ok('routes button kept', await p.isVisible('#routes-btn'));
  await p.waitForTimeout(500); await p.screenshot({ path: S + '06-postsnap-minimal.png' });
  // camera: under centre vs shotgun same framing
  const cam = async (pred, name) => { await force(pred); await p.waitForTimeout(1500); await p.keyboard.down('KeyR'); await p.waitForTimeout(150); await p.screenshot({ path: S + name }); await p.keyboard.up('KeyR');
    return Q(() => { const q = window.__qb3d; return { form: q.state.sim.play.formation, qbY: q.state.sim.qb.y, cam: q.camera.position.toArray().map((v) => +v.toFixed(2)) }; }); };
  const gun = await cam("(x) => x.type !== 'run' && x.formation === 'doubles'", '07-camera-shotgun.png');
  const uc = await cam("(x) => x.type !== 'run' && (x.formation === 'iform' || x.formation === 'aceTwoTE')", '08-camera-under-center.png');
  ok('under-centre camera = shotgun spot', Math.abs(gun.cam[2] - uc.cam[2]) < 0.15 && Math.abs(gun.cam[1] - uc.cam[1]) < 0.15, { gun, uc });
  const vis = await Q(() => { const q = window.__qb3d; return q.actors.filter((a) => a.kind === 'wr').map((a) => { const v = a.g.position.clone(); v.y = 1; v.project(q.camera); return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; }); });
  ok('all receivers in frame (under centre)', vis.every(Boolean), vis);
  // phone landscape + portrait
  await p.setViewportSize({ width: 844, height: 390 }); await Q(() => window.__qb3d.nextPlay()); await p.waitForTimeout(600);
  await p.screenshot({ path: S + '09-phone-landscape.png' });
  await p.click('#b-aud'); await p.waitForTimeout(100);
  const ov = await Q(() => { const a = document.getElementById('pop-aud').getBoundingClientRect(), s = document.getElementById('snap-btn').getBoundingClientRect(); return { overlap: !(a.bottom <= s.top || a.top >= s.bottom || a.right <= s.left || a.left >= s.right), inView: a.top >= 0 }; });
  ok('phone: snap does not cover audible panel', !ov.overlap && ov.inView, ov);
  await p.screenshot({ path: S + '10-phone-landscape-audible.png' }); await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400); await p.screenshot({ path: S + '11-phone-portrait.png' });
  ok('portrait bubbles in view', await Q(() => ['b-cov', 'b-aud', 'snap-btn'].every((i) => { const r = document.getElementById(i).getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.bottom <= innerHeight; })));
  ok('no JS errors', errs.length === 0, errs);
  console.log(fails ? fails + ' FAILED' : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})();
