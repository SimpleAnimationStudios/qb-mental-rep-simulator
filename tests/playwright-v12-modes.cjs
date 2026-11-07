// v12: Call it / Just read on menu; Just read skips prediction and grades without Coverage ID.
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ARGS });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:8766/index.html');
  await p.evaluate(() => localStorage.clear());
  await p.goto('http://localhost:8766/index.html?home=1');
  await p.waitForFunction(() => window.PocketHub && document.getElementById('pi-home'));
  // menu has both game types + prior tiles
  const menu = await p.evaluate(() => {
    const h = document.getElementById('pi-home');
    const txt = h.innerText;
    return {
      call: !!h.querySelector('[data-gt="call"]'),
      read: !!h.querySelector('[data-gt="read"]'),
      film: txt.includes('Film Room'),
      practice: txt.includes('Practice'),
      daily: txt.includes('Daily'),
      board: txt.includes('Bests'),
      ach: txt.includes('Achievements'),
      progress: txt.includes('Progress'),
      custom: txt.includes('Custom'),
      settings: txt.includes('Settings'),
      free: txt.includes('Free play'),
      play: !!document.getElementById('pi-play'),
      modes: h.querySelectorAll('[data-mode]').length,
      levels: h.querySelectorAll('[data-lv]').length,
    };
  });
  ok('menu Call it', menu.call);
  ok('menu Just read', menu.read);
  ok('menu PLAY', menu.play);
  for (const k of ['film', 'practice', 'daily', 'board', 'ach', 'progress', 'custom', 'settings', 'free']) ok('menu ' + k, menu[k]);
  ok('menu modes', menu.modes >= 3, menu.modes);
  ok('menu levels', menu.levels >= 4, menu.levels);
  await p.screenshot({ path: 'screenshots/v12-menu-call.png' });

  // select Just read and start
  await p.click('[data-gt="read"]');
  await p.waitForTimeout(200);
  ok('persisted gameType read', await p.evaluate(() => localStorage.getItem('pocketiq3d.gameType') === 'read'));
  await p.screenshot({ path: 'screenshots/v12-menu-read.png' });
  await p.click('#pi-play');
  await p.waitForFunction(() => window.__qb3d && window.__qb3d.state.sim);
  await p.waitForTimeout(400);
  const jr = await p.evaluate(() => {
    const ps = document.getElementById('presnap');
    return {
      just: ps.classList.contains('just-read'),
      covHidden: getComputedStyle(document.getElementById('b-cov')).display === 'none',
      snapVisible: getComputedStyle(document.getElementById('snap-btn')).display !== 'none',
      gt: window.__gameType && window.__gameType(),
    };
  });
  ok('presnap just-read class', jr.just);
  ok('coverage bubble hidden', jr.covHidden);
  ok('snap still visible', jr.snapVisible);
  ok('__gameType read', jr.gt === 'read');

  await p.click('#snap-btn');
  await p.waitForTimeout(900);
  await p.evaluate(() => { const q = window.__qb3d, s = q.state.sim; q.throwTo((s.play.progression || ['H'])[0]); });
  await p.waitForSelector('#result:not([hidden])', { timeout: 12000 });
  const grade = await p.evaluate(() => {
    const secs = [...document.querySelectorAll('#res-sections .sec h4')].map((e) => e.textContent);
    const more = document.getElementById('res-more');
    // open more details to inspect parts if needed
    return { secs, outcome: document.getElementById('res-outcome').textContent };
  });
  ok('Just read panel has Best read', grade.secs.some((t) => /Best read/i.test(t)), grade.secs.join('|'));
  ok('Just read panel has Coverage reveal (not ID grade)', grade.secs.some((t) => /^Coverage$/i.test(t.trim())), grade.secs.join('|'));
  ok('Just read panel omits Coverage ID heading', !grade.secs.some((t) => /Coverage ID/i.test(t)), grade.secs.join('|'));
  await p.screenshot({ path: 'screenshots/v12-justread-result.png' });

  await b.close();
  console.log(fails ? `FAILED ${fails}` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
