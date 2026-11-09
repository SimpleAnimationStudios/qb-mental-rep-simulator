// v13 Practice multi-select: UI layout (desktop/phone/landscape/narrow, long names), only-selected plays+coverages over real reps,
// all selected items reached, Fully random diversity, persistence, validation, and Free Play unaffected.
// Needs a static server on :8766 (python3 -m http.server 8766). node tests/playwright-practice.cjs   (env REPS=24 SHOTS=dir)
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const REPS = +(process.env.REPS || 24), SHOTS = process.env.SHOTS || ''; let fails = 0;
const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n, c || i === undefined ? '' : JSON.stringify(i).slice(0, 400)); if (!c) fails++; };
const URL0 = 'http://localhost:8766/index.html';
async function open(b, vp) {
  const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.mobile, isMobile: !!vp.mobile, deviceScaleFactor: vp.mobile ? 2 : 1 });
  const p = await ctx.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.stack || e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(URL0); await p.evaluate(() => { localStorage.clear(); }); await p.reload(); await p.waitForFunction(() => window.PocketHub && window.PocketHub.showPractice && window.__qb3d);
  return { ctx, p, errs, Q: (f, a) => p.evaluate(f, a) };
}
const tap = async (p, vp, sel) => { const el = await p.$(sel); if (!el) throw new Error('missing ' + sel); await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(30); const r = await el.boundingBox(); if (vp.mobile) await p.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await p.waitForTimeout(60); };
async function layout(p, tag) {
  return p.evaluate((tag) => {
    const s = document.getElementById('pi-sheet'), vw = window.innerWidth, over = [];
    s.querySelectorAll('*').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && (r.right > vw + 1 || r.left < -1)) over.push((e.id || e.className || e.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); });
    const small = [...s.querySelectorAll('.pi-opt,.pi-tap,.pi-grpbtn,#pi-pr-go,#pi-pr-prev summary')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim().slice(0, 30));
    return { tag, docOverflow: document.documentElement.scrollWidth - vw, sheetOverflow: s.scrollWidth - s.clientWidth, over: over.slice(0, 5), small: small.slice(0, 5),
      sheetScrolls: s.scrollHeight > s.clientHeight && getComputedStyle(s).overflowY === 'auto', bodyScroll: document.scrollingElement.scrollHeight - window.innerHeight };
  }, tag);
}
async function playReps(Q, p, vp, n) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    await p.waitForFunction(() => { const s = window.__qb3d.state; return s.sim && s.sim.phase === 'presnap' && document.getElementById('result').hidden; }, null, { timeout: 20000 });
    const r = await Q(() => { const q = window.__qb3d, s = q.state, pl = s.sim.play; return { id: pl.id, orig: s.orig.id, cov: pl.coverage, simCov: Object.keys(q.D.COVERAGES).find((k) => q.D.COVERAGES[k] === s.sim.cov), pressure: pl.pressure, type: pl.type, tag: document.getElementById('mode-tag').textContent }; });
    seen.push(r);
    await Q(() => window.__qb3d.doSnap()); await p.waitForTimeout(200);
    await Q(() => { const q = window.__qb3d, s = q.state.sim; if (s.play.type !== 'run') q.throwTo(s.play.correct || s.play.progression[0]); });
    await p.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 30000 });
    if (i < n - 1) await tap(p, vp, '#next-btn');
  }
  return seen;
}
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // ---- layout on four viewports, with deliberately long names ----
  for (const vp of [{ width: 1280, height: 800, tag: 'desktop' }, { width: 390, height: 844, tag: 'phone', mobile: true }, { width: 844, height: 390, tag: 'landscape', mobile: true }, { width: 320, height: 640, tag: 'narrow', mobile: true }]) {
    const { ctx, p, errs, Q } = await open(b, vp);
    await Q(() => window.PocketHub.showPractice()); await tap(p, vp, '[data-om="pick"]'); await tap(p, vp, '[data-dm="pick"]');
    let L = await layout(p, vp.tag);
    ok(`${vp.tag}: no horizontal overflow`, L.docOverflow <= 0 && L.sheetOverflow <= 0 && !L.over.length, L);
    ok(`${vp.tag}: tap targets >= 44px`, !L.small.length, L.small);
    ok(`${vp.tag}: the practice sheet scrolls (not the page)`, L.sheetScrolls && L.bodyScroll <= 0, L);
    const go = await Q(() => { const r = document.getElementById('pi-pr-go').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    ok(`${vp.tag}: REP IT bar visible without scrolling (sticky)`, go.bottom <= go.vh + 1 && go.top >= 0, go);
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/practice-${vp.tag}-empty.png` });
    // long names
    await Q(() => { const D = window.QBData; D.COVERAGES.cover2.name = 'Cover 2 Super-Long-Disguised-Rotating-Inverted-Robber-Buzz-Matchup-Name-Test'; const pl = D.PLAYS.find((x) => x.type !== 'run'); pl.name = 'Smash-Y-Corner-Option-Double-Choice-Sail-Seam-Wheel-Extreme-Length-Name'; window.PocketHub.showPractice(); });
    await tap(p, vp, '#pi-pr-pall'); await tap(p, vp, '#pi-pr-call');
    L = await layout(p, vp.tag + '+long');
    ok(`${vp.tag}: no horizontal overflow with long names + everything selected`, L.docOverflow <= 0 && L.sheetOverflow <= 0 && !L.over.length, L);
    ok(`${vp.tag}: no JS errors`, !errs.length, errs.slice(0, 2));
    await ctx.close();
  }
  // ---- real reps: 3 plays (2 concepts) x 3 coverages, then Fully random, then Free Play ----
  for (const vp of [{ width: 1280, height: 800, tag: 'desktop' }, { width: 390, height: 844, tag: 'phone', mobile: true }]) {
    const { ctx, p, errs, Q } = await open(b, vp);
    const before = await Q(() => { const P = window.PocketHub.P(); P.prefs.gameType = 'read'; P.prefs.playset = 'all'; localStorage.setItem('pocketiq.v8', JSON.stringify(P)); return JSON.stringify(P.prefs); });
    await Q(() => window.PocketHub.reload());
    const pool = await Q(() => window.QBModes.pool(window.QBModes.getMode()).map((x) => ({ id: x.id, name: x.name, cov: x.coverage })));
    const playsSel = [pool[0].id, pool.find((x) => x.name !== pool[0].name).id, pool[pool.length - 1].id].filter((v, i, a) => a.indexOf(v) === i);
    const covSel = ['cover1robber', 'cover3cloud', 'cover6'];
    await Q(() => window.PocketHub.showPractice());
    await tap(p, vp, '[data-om="pick"]'); for (const id of playsSel) await tap(p, vp, `[data-play="${id}"]`);
    await tap(p, vp, '[data-dm="pick"]'); for (const k of covSel) await tap(p, vp, `[data-cov="${k}"]`);
    // validation: select none -> disabled; then re-pick
    await tap(p, vp, '#pi-pr-cnone');
    const inv = await Q(() => ({ dis: document.getElementById('pi-pr-go').disabled, msg: document.getElementById('pi-pr-err').textContent }));
    ok(`${vp.tag}: empty coverage selection blocks start with a message`, inv.dis && /coverage/i.test(inv.msg), inv);
    for (const k of covSel) await tap(p, vp, `[data-cov="${k}"]`);
    const sel = await Q(() => ({ plays: [...document.querySelectorAll('[data-play].on')].map((e) => e.dataset.play), covs: [...document.querySelectorAll('[data-cov].on')].map((e) => e.dataset.cov), go: !document.getElementById('pi-pr-go').disabled }));
    ok(`${vp.tag}: UI shows exactly the chosen plays/coverages`, JSON.stringify(sel.plays.sort()) === JSON.stringify(playsSel.slice().sort()) && JSON.stringify(sel.covs.sort()) === JSON.stringify(covSel.slice().sort()) && sel.go, sel);
    if (SHOTS) { await Q(() => (document.getElementById('pi-sheet').scrollTop = 0)); await p.screenshot({ path: `${SHOTS}/practice-${vp.tag}-selected.png` }); await Q(() => document.getElementById('pi-pr-pl').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${SHOTS}/practice-${vp.tag}-plays.png` }); await Q(() => document.querySelector('[data-dm]').scrollIntoView({ block: 'start' })); await p.screenshot({ path: `${SHOTS}/practice-${vp.tag}-coverages.png` }); }
    await tap(p, vp, '#pi-pr-go');
    const seen = await playReps(Q, p, vp, REPS);
    const ids = new Set(seen.map((r) => r.orig)), covs = new Set(seen.map((r) => r.cov));
    ok(`${vp.tag}: ${REPS} reps used only the selected plays`, seen.every((r) => playsSel.includes(r.orig)), [...ids]);
    ok(`${vp.tag}: ${REPS} reps used only the selected coverages`, seen.every((r) => covSel.includes(r.cov) && r.simCov === r.cov), seen.map((r) => r.cov + '/' + r.simCov));
    ok(`${vp.tag}: every selected play and coverage reached`, playsSel.every((x) => ids.has(x)) && covSel.every((x) => covs.has(x)), { ids: [...ids], covs: [...covs] });
    ok(`${vp.tag}: no back-to-back coverage within a bag, balanced counts`, covSel.every((c) => Math.abs(seen.filter((r) => r.cov === c).length - REPS / 3) <= 1), covSel.map((c) => seen.filter((r) => r.cov === c).length));
    ok(`${vp.tag}: no CUSTOM tag on practice reps`, seen.every((r) => !/CUSTOM/.test(r.tag)));
    const hist = await Q(() => window.PocketHub.S.active.reps.length);
    ok(`${vp.tag}: practice reps recorded in session`, hist >= REPS - 1, hist);
    // end practice -> summary -> home
    await Q(() => window.PocketHub.showSummary());
    const after = await Q(() => ({ active: !!window.PocketHub.S.active, filter: !!window.__qb3d.state.poolFilter, forced: window.PocketHub.nextForced(), last: window.PocketHub.P().sessions.slice(-1)[0], prefs: window.PocketHub.P().prefs }));
    ok(`${vp.tag}: leaving practice clears session/filter/forced`, !after.active && !after.filter && after.forced === undefined, after);
    ok(`${vp.tag}: practice session saved unrated with a label`, after.last && after.last.scored === false && typeof after.last.practice === 'string' && after.last.practice.length > 3, after.last);
    const pb = JSON.parse(before);
    ok(`${vp.tag}: other prefs kept (mode/playset/scored/gameType)`, ['mode', 'playset', 'scored', 'gameType'].every((k) => JSON.stringify(after.prefs[k]) === JSON.stringify(pb[k])), { pb, now: after.prefs });
    ok(`${vp.tag}: practice choice saved in prefs.practice`, after.prefs.practice && after.prefs.practice.offense === 'pick' && after.prefs.practice.defense === 'pick' && after.prefs.practice.covs.length === 3 && after.prefs.practice.plays.length === playsSel.length, after.prefs.practice);
    // persistence across reload
    await p.reload(); await p.waitForFunction(() => window.PocketHub && window.PocketHub.showPractice); await Q(() => window.PocketHub.showPractice());
    const rs = await Q(() => ({ plays: [...document.querySelectorAll('[data-play].on')].length, covs: [...document.querySelectorAll('[data-cov].on')].map((e) => e.dataset.cov) }));
    ok(`${vp.tag}: selections restored after reload`, rs.plays === playsSel.length && rs.covs.length === 3, rs);
    // Fully random + own looks: diversity, untouched looks
    await tap(p, vp, '[data-om="random"]'); await tap(p, vp, '[data-dm="own"]'); await tap(p, vp, '#pi-pr-go');
    const fr = await playReps(Q, p, vp, 15), base = Object.fromEntries(pool.map((x) => [x.id, x.cov]));
    ok(`${vp.tag}: Fully random shows diversity (15 reps)`, new Set(fr.map((r) => r.orig)).size >= Math.min(10, pool.length), [...new Set(fr.map((r) => r.orig))].length);
    ok(`${vp.tag}: Fully random draws from the Free Play pool with own looks`, fr.every((r) => base[r.orig] && r.cov === base[r.orig]));
    await Q(() => window.PocketHub.showSummary());
    // Free Play unaffected
    await Q(() => { window.PocketHub.showHome(); document.querySelector('[data-go="free"]').click(); });
    await p.waitForTimeout(300);
    const fp = [];
    for (let i = 0; i < 12; i++) { await Q(() => window.__qb3d.nextPlay(window.PocketHub.nextForced())); fp.push(await Q(() => ({ id: window.__qb3d.state.sim.play.id, cov: window.__qb3d.state.sim.play.coverage, look: !!window.__qb3d.state.sim.play.practiceLook }))); }
    ok(`${vp.tag}: Free Play after practice uses authored looks, full pool`, fp.every((r) => base[r.id] === r.cov && !r.look), fp);
    ok(`${vp.tag}: no JS errors`, !errs.length, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAIL` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
