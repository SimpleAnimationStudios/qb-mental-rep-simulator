// v8: Pocket IQ shell (home, sessions, summary, levels, Film Room, practice, bests) + scale. Run: node tests/playwright-v8.cjs (server on :8766)
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const SS = __dirname + '/../screenshots/';
let fails = 0; const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = []; p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const Q = (f, a) => p.evaluate(f, a);
  const shot = async (n) => { await p.waitForTimeout(200); await p.screenshot({ path: SS + n + '.png' }); };
  await p.goto('http://localhost:8766/index.html?home=1');
  await Q(() => { localStorage.clear(); localStorage.setItem('pocketiq3d.unlimited', 'on'); localStorage.setItem('pocketiq3d.mode', 'passing'); });
  await p.goto('http://localhost:8766/index.html?home=1'); await p.waitForSelector('#pi-play', { timeout: 15000 });
  ok('home screen shown', await p.isVisible('#pi-home'));
  ok('levels: Youth+HS open, College/Pro locked', await Q(() => [...document.querySelectorAll('[data-lv]')].map((b) => b.disabled).join() === 'false,false,true,true'));
  await shot('v8-home');
  await p.click('[data-lv="youth"]'); await p.click('#pi-play');
  ok('session starts, home hidden, HUD chip', await Q(() => document.getElementById('pi-home').hidden && /rep 1\/10/.test(document.getElementById('pi-hud').textContent)));
  ok('level applied (youth → 15 s, 1.45× pocket)', await Q(() => window.__qb3d.state.diff === 'youth' && window.__qb3d.DIFF.youth.presnap === 15));
  for (let i = 0; i < 10; i++) {
    await p.waitForFunction(() => window.__qb3d.state.sim && window.__qb3d.state.sim.phase === 'presnap', null, { timeout: 8000 });
    await Q(() => { const q = window.__qb3d, s = q.state.sim; const c = q.D.COVERAGES[s.play.coverage]; document.querySelector(`#cov-choices [data-id="${c.shell}"]`)?.click(); q.doSnap(); window.__timeScale = 3; });
    await p.waitForFunction(() => { const s = window.__qb3d.state.sim; return s.phase !== 'live' || s.t > (s.play.idealTime || 2) - 0.1; }, null, { timeout: 15000 });
    await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.phase === 'live') q.throwTo(s.play.correct || s.play.progression[0]); });
    await p.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 });
    await Q(() => { window.__timeScale = 1; });
    if (i === 3) { await shot('v8-rep-feedback'); ok('feedback: SIM ring + 3 sections', await Q(() => !!document.querySelector('#res-extra .pi-sring') && document.querySelectorAll('#res-sections .sec').length === 3)); }
    await p.waitForTimeout(60); await p.click('#next-btn');
  }
  await p.waitForSelector('#pi-sum-t', { timeout: 8000 });
  const sum = await Q(() => ({ txt: document.getElementById('pi-sheet').textContent, prof: JSON.parse(localStorage.getItem('pocketiq.v8')) }));
  ok('summary: stats + traits', /Coverage ID/.test(sum.txt) && /Interceptions/.test(sum.txt) && /Pocket presence/.test(sum.txt) && /Decision speed/.test(sum.txt), '');
  ok('session saved with rating', sum.prof.sessions.length === 1 && sum.prof.sessions[0].n === 10 && sum.prof.sessions[0].rating != null, JSON.stringify(sum.prof.sessions[0]).slice(0, 200));
  ok('achievement "first" earned', !!sum.prof.ach.first);
  ok('youth session does not skip a level', !sum.prof.unlocked.includes('college'));
  await shot('v8-session-summary');
  const unl = await Q(() => { const H = window.PocketHub, r = { type: 'pass', sim: 85, covOk: true, presOk: true, protOk: true, readOk: true, thrown: 'H', time: 2.3, ideal: 2.3, result: 'complete', risk: 0, name: 'Smash', coverage: 'C2' };
    H.S.active = { scored: true, level: 'hs', mode: 'passing', reps: Array.from({ length: 10 }, () => ({ ...r })), at: new Date().toISOString() }; H.showSummary();
    return { u: JSON.parse(localStorage.getItem('pocketiq.v8')).unlocked, t: document.getElementById('pi-sheet').textContent }; });
  ok('HS avg 85 unlocks College', unl.u.includes('college') && /College unlocked/.test(unl.t), unl.u.join());
  await p.click('#pi-home-b');
  // Film room
  await Q(() => window.PocketHub.showFilm('quiz')); await p.waitForSelector('#pi-q-opts button');
  await shot('v8-quiz');
  await p.click('#pi-q-opts button'); ok('quiz reveal shows zones', await Q(() => document.querySelectorAll('#pi-q-diag ellipse, #pi-q-diag line[stroke="#f87171"]').length > 0));
  await shot('v8-quiz-reveal');
  await Q(() => window.PocketHub.showFilm('concept')); await p.click('#pi-c-opts button'); ok('concept quiz answer highlighted', await Q(() => !!document.querySelector('#pi-c-diag circle[fill="#16a34a"]')));
  await shot('v8-concept-quiz');
  const d1 = await Q(() => { window.PocketHub.showFilm('daily'); return document.getElementById('pi-d-diag').innerHTML.length; });
  const d2 = await Q(() => { window.PocketHub.showFilm('daily'); return document.getElementById('pi-d-diag').innerHTML.length; });
  ok('daily challenge is seeded (stable)', d1 === d2 && d1 > 100);
  for (let i = 0; i < 5; i++) { await p.click('#pi-d-opts button'); await p.click('#pi-d-next'); }
  ok('daily saved', await Q(() => !!JSON.parse(localStorage.getItem('pocketiq.v8')).daily[Object.keys(JSON.parse(localStorage.getItem('pocketiq.v8')).daily)[0]]));
  await shot('v8-daily');
  await Q(() => window.PocketHub.showFilm('cards'));
  const cc = await Q(() => [document.querySelectorAll('#pi-cards-cov .pi-cc').length, document.querySelectorAll('#pi-cards-bl .pi-cc').length, document.querySelectorAll('#pi-cards-pr .pi-cc').length, Object.keys(window.QBData.COVERAGES).length, Object.keys(window.QBData.BLITZES).length, window.QBProt.PROTECTIONS.length]);
  ok('coach cards for every coverage/blitz/protection', cc[0] === cc[3] && cc[1] === cc[4] && cc[2] === cc[5], cc.join());
  await shot('v8-coach-cards');
  // Practice
  await Q(() => window.PocketHub.showPractice()); await p.waitForSelector('#pi-pr-go');
  await p.click('#pi-pr-c [data-c="Smash"]'); await p.click('#pi-pr-d [data-p="smash_c4"]');
  await shot('v8-practice');
  await p.click('#pi-pr-go');
  const ids = [];
  for (let i = 0; i < 3; i++) {
    await p.waitForFunction(() => window.__qb3d.state.sim.phase === 'presnap'); ids.push(await Q(() => window.__qb3d.state.orig.id));
    await Q(() => { window.__qb3d.doSnap(); window.__timeScale = 4; }); await p.waitForFunction(() => window.__qb3d.state.sim.t > 1.8 || window.__qb3d.state.sim.phase === 'done');
    await Q(() => { const q = window.__qb3d; if (q.state.sim.phase === 'live') q.throwTo(q.state.sim.play.correct); });
    await p.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 }); await Q(() => { window.__timeScale = 1; }); await p.waitForTimeout(60); await p.click('#next-btn');
  }
  ok('practice repeats the chosen play', ids.every((x) => x === 'smash_c4'), ids.join());
  await shot('v8-practice-rep');
  await Q(() => window.PocketHub.showSummary()); ok('practice summary unrated', await Q(() => /Unrated/.test(document.getElementById('pi-sheet').textContent)));
  await Q(() => window.PocketHub.showBoard()); ok('leaderboard labeled local-only', await Q(() => /Local-only/.test(document.getElementById('pi-sheet').textContent) && document.querySelectorAll('#pi-lb tr').length === 3));
  await shot('v8-bests');
  await Q(() => window.PocketHub.showAch()); await shot('v8-achievements');
  // scale views
  await Q(() => { window.PocketHub.endSession(); window.PocketHub.hideHome(); document.getElementById('pi-sheet').hidden = true; const q = window.__qb3d; q.nextPlay(q.D.PLAYS[0]); });
  await p.waitForTimeout(500);
  await Q(() => { window.__camOverride = { pos: [0, 34, 14], look: [0, 0, -6] }; }); await shot('v8-field-overview');
  await Q(() => { window.__camOverride = null; localStorage.setItem('pocketiq3d.camera', 'eye'); document.getElementById('cam-sel').value = 'eye'; document.getElementById('cam-sel').dispatchEvent(new Event('change')); });
  await p.waitForTimeout(1200); await shot('v8-qb-view');
  await Q(() => { window.__qb3d.setScaleDebug(true); window.__camOverride = { pos: [9, 7, 9], look: [0, 1, -1] }; }); await p.waitForTimeout(300); await shot('v8-scale-debug');
  const hud = await Q(() => document.getElementById('scale-hud').textContent);
  ok('scale HUD reports realistic heights + OL spacing', /6'\d/.test(hud) && /OL/.test(hud), hud.slice(0, 160));
  ok('no JS errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
