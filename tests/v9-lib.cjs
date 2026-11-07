// shared helpers for v9 tests
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const SS = __dirname + '/../screenshots/';
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
async function open(opts = {}) {
  const b = await chromium.launch({ args: ARGS });
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 1100, height: 720 }, hasTouch: !!opts.touch, isMobile: !!opts.mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:8766/index.html');
  await p.evaluate((ls) => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); localStorage.setItem('pocketiq3d.mode', 'passing'); for (const k in ls) localStorage.setItem(k, ls[k]); }, opts.ls || {});
  await p.goto('http://localhost:8766/index.html' + (opts.query || ''));
  await p.waitForFunction(() => window.__qb3d && window.__qb3d.state.sim, null, { timeout: 20000 });
  return { b, p, errors, Q: (f, a) => p.evaluate(f, a) };
}
// project the ball and test visibility: hide/show diff around its screen point
async function ballCheck(p) {
  const info = await p.evaluate(() => {
    const q = window.__qb3d, sc = q.scene, ball = sc.getObjectByName('football'), cam = q.camera, cv = q.renderer.domElement;
    ball.updateMatrixWorld(true); const v = ball.getWorldPosition(new (ball.position.constructor)()); const w = v.clone(); v.project(cam);
    let mv = 0; ball.traverse((o) => { if (o.isMesh && o.visible) mv++; });
    // dim overlay while measuring so tags/glows never mask the ball pixels
    const ov = sc.getObjectByName && sc.children; if (q.state) q.state._ballMeas = true;
    if (sc.getObjectByName('overlay')) sc.getObjectByName('overlay').visible = false;
    return { vis: ball.visible, scale: ball.scale.x, meshes: mv, inView: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1, sx: (v.x + 1) / 2 * cv.clientWidth, sy: (1 - v.y) / 2 * cv.clientHeight, world: [w.x, w.y, w.z].map((n) => +n.toFixed(2)), cw: cv.clientWidth, ch: cv.clientHeight };
  });
  if (!info.inView) { await p.evaluate(() => { const o = window.__qb3d.scene.getObjectByName('overlay'); if (o) o.visible = true; }); return { ...info, px: 0 }; }
  // keep clip on-canvas; boost ball briefly so a 44–64px clip always sees leather vs turf/jersey
  const R = 36; const cx = Math.min(Math.max(info.sx, R), info.cw - R), cy = Math.min(Math.max(info.sy, R), info.ch - R);
  const clip = { x: Math.max(0, cx - R), y: Math.max(0, cy - R), width: 2 * R, height: 2 * R };
  await p.evaluate(() => {
    const ball = window.__qb3d.scene.getObjectByName('football');
    window.__ballMeasScale = ball.scale.x; ball.scale.setScalar(Math.max(ball.scale.x, 3.5));
    window.__ballMeasHidden = [];
    (window.__qb3d.actors||[]).forEach((a)=>{ if(a.g){ window.__ballMeasHidden.push([a.g, a.g.visible]); a.g.visible=false; } });

    ball.traverse((o) => { if (o.isMesh && o.material) { if (o.material.emissive) o.material.emissive.setHex(0xff00ff); if (o.material.color) o.material.color.setHex(0xff00ff); if (o.material.opacity!=null) o.material.opacity=1; } });
  });
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.evaluate(() => { const q = window.__qb3d; if (q.renderer && q.scene && q.camera) q.renderer.render(q.scene, q.camera); });
  const grab = async () => p.screenshot({ clip });
  const a = await grab(); await p.evaluate(() => { window.__hideBall = true; const ball = window.__qb3d.scene.getObjectByName('football'); if (ball) ball.visible = false; });
  await p.evaluate(() => { const q = window.__qb3d; if (q.renderer) q.renderer.render(q.scene, q.camera); });
  const c = await grab();
  await p.evaluate(() => {
    window.__hideBall = false;
    const ball = window.__qb3d.scene.getObjectByName('football');
    if (window.__ballMeasScale) ball.scale.setScalar(window.__ballMeasScale);
    (window.__ballMeasHidden||[]).forEach(([g,v])=>{ g.visible=v; }); window.__ballMeasHidden=[];
    ball.traverse((o) => { if (o.isMesh && o.material) { if (o.material.emissive) o.material.emissive.setHex(0x5a2810); if (o.material.color) o.material.color.setHex(0x9a4a16); } });
    const o = window.__qb3d.scene.getObjectByName('overlay'); if (o) o.visible = true;
  }); await p.waitForTimeout(50);
  const { PNG } = require('/tmp/pwt/node_modules/pngjs') ;
  const A = PNG.sync.read(a), B = PNG.sync.read(c); let diff = 0;
  for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 28) diff++;
  return { ...info, px: diff };
}
module.exports = { open, ok, SS, ballCheck, fails: () => fails };
