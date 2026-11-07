// v12: after-rep overlay circles use authored radii (deep blue / amber), not tiny rush stubs.
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ARGS });
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  await p.goto('http://localhost:8766/index.html');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); localStorage.setItem('pocketiq3d.gameType', 'call'); });
  await p.goto('http://localhost:8766/index.html');
  await p.waitForFunction(() => window.__qb3d && window.__qb3d.state.sim);
  await p.evaluate(() => { const q = window.__qb3d; const pl = q.M.pool('passing').find((x) => x.id === 'smash_c2') || q.state.sim.play; q.startPlay(pl); });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__qb3d.doSnap());
  await p.waitForTimeout(800);
  await p.evaluate(() => { const q = window.__qb3d; q.throwTo(q.state.sim.play.correct || q.state.sim.play.progression[0]); });
  await p.waitForSelector('#result:not([hidden])', { timeout: 12000 });
  await p.waitForTimeout(500);
  // force coach view so overlay is visible; drawCoverage already ran
  await p.evaluate(() => window.__qb3d.setView('coach'));
  await p.waitForTimeout(200);
  const info = await p.evaluate(() => {
    const q = window.__qb3d, s = q.state.sim;
    const jobs = s.defense.map((d) => { const j = d.job0 || d.job; return { id: d.id, t: j.type, r: j.r, deep: !!j.deep, liveT: d.job.type, liveR: d.job.r }; });
    return { jobs, overlayKids: q.scene.children.find((c) => c.name === 'overlay') ? q.scene.getObjectByName('overlay').children.length : -1 };
  });
  const zones = info.jobs.filter((j) => j.t === 'zone');
  ok('job0 zones r>=4', zones.every((j) => j.r >= 4), JSON.stringify(zones.map((j) => j.r)));
  ok('job0 still rush for DL', info.jobs.some((j) => j.t === 'rush' || j.t === 'blitz'));
  ok('live may have mutated rush→zone but job0 did not', info.jobs.some((j) => (j.t === 'rush' || j.t === 'blitz') && j.liveT === 'zone' && j.liveR <= 1) || info.jobs.some((j) => j.t === 'rush'));
  await p.screenshot({ path: 'screenshots/v12-overlay-coach.png' });
  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
