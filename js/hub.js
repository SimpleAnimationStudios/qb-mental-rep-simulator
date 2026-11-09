/* hub.js — v8 "Pocket IQ" shell around the 3D sim: home screen, 10-rep sessions + summary, levels, achievements,
 * Film Room (coverage quiz, concept quiz, daily Guess the Coverage, coach cards), practice mode, local leaderboard,
 * richer rep feedback. Pure DOM/SVG; talks to game3d.js only through window.__qb3d and the 'pocketiq:rep' event.
 * Everything is stored locally (localStorage key pocketiq.v8). Nothing is uploaded anywhere. */
(function () {
  'use strict';
  const KEY = 'pocketiq.v8', SESSION_LEN = 10;
  const LEVELS = [
    { id: 'youth', label: 'Youth', diff: 'youth', mult: 0.8, note: '15 s pre-snap · no disguise · 1.45× pocket time' },
    { id: 'hs', label: 'High School', diff: 'rookie', mult: 0.9, note: '12 s pre-snap · no disguise · 1.3× pocket time' },
    { id: 'college', label: 'College', diff: 'starter', mult: 1.0, note: '8 s pre-snap · some disguise · normal pocket' },
    { id: 'pro', label: 'Pro', diff: 'pro', mult: 1.1, note: '5 s pre-snap · heavy disguise · 0.85× pocket, tighter windows' },
  ];
  const UNLOCK_AVG = 70;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- persistent profile ----------
  const blank = () => ({ v: 1, rating: 50, unlocked: ['youth', 'hs'], level: 'hs', sessions: [], ach: {}, days: [], daily: {}, quiz: { right: 0, total: 0 }, prefs: { mode: null, playset: 'all', scored: true, gameType: 'call' } });
  function load() { try { const p = JSON.parse(localStorage.getItem(KEY)); return p && p.v === 1 ? Object.assign(blank(), p) : blank(); } catch (e) { return blank(); } }
  function save() { localStorage.setItem(KEY, JSON.stringify(P)); }
  let P = load();

  // ---------- seeded rng (daily challenge) ----------
  function rngFrom(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; }; }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
  function shuffled(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  let Q = null, D = null, E = null, M = null, Prot = null, VAR = {};
  const S = { active: null }; // current session
  window.PocketHub = { S, P: () => P, LEVELS };

  // ---------- diagrams (top-down SVG from a real engine sim at the snap) ----------
  const FAMILY_NAMES = { C0: 'Cover 0', C1: 'Cover 1', C2: 'Cover 2', C3: 'Cover 3', C4: 'Cover 4 (Quarters)', C6: 'Cover 6' };
  function simFor(play, coverage, pressure, seed, front) {
    const r = rngFrom(String(seed || 1));
    return E.createSim({ ...play, coverage: coverage || play.coverage, pressure: pressure || 'NONE' }, r, { disguise: 0, seed: 7, front: front || undefined });
  }
  function diagram(sim, o) {
    o = o || {};
    const x0 = 0, w = 53.3, yTop = o.yTop || 22, yBot = -8, sc = 9, H = (yTop - yBot) * sc, Wd = w * sc;
    const X = (x) => ((x - x0) * sc).toFixed(1), Y = (y) => ((yTop - y) * sc).toFixed(1);
    let s = `<svg class="diag" viewBox="0 0 ${Wd} ${H}" preserveAspectRatio="xMidYMid meet"><rect width="${Wd}" height="${H}" fill="#14532d"/>`;
    for (let y = -5; y <= yTop; y += 5) s += `<line x1="0" x2="${Wd}" y1="${Y(y)}" y2="${Y(y)}" stroke="#ffffff${y === 0 ? '99' : '33'}" stroke-width="${y === 0 ? 2 : 1}"/>`;
    s += `<line x1="${X(23.58)}" x2="${X(23.58)}" y1="0" y2="${H}" stroke="#ffffff22" stroke-dasharray="3 9"/><line x1="${X(29.72)}" x2="${X(29.72)}" y1="0" y2="${H}" stroke="#ffffff22" stroke-dasharray="3 9"/>`;
    if (o.reveal) sim.defense.forEach((d) => {
      const j = d.job || {};
      if (j.type === 'zone') s += `<ellipse cx="${X(j.x)}" cy="${Y(j.y)}" rx="${(j.r * sc).toFixed(1)}" ry="${(j.r * sc * 0.7).toFixed(1)}" fill="${j.deep ? '#38bdf855' : '#facc1544'}" stroke="${j.deep ? '#38bdf8' : '#facc15'}" stroke-width="1.5"/>`;
      if (j.type === 'man' && sim.refs[j.ref]) { const t = sim.refs[j.ref]; s += `<line x1="${X(d.x)}" y1="${Y(d.y)}" x2="${X(t.x)}" y2="${Y(t.y)}" stroke="#f87171" stroke-width="2" stroke-dasharray="5 4"/>`; }
      if (j.type === 'rush' || d.blitzed) s += `<line x1="${X(d.x)}" y1="${Y(d.y)}" x2="${X(d.x + (26.65 - d.x) * 0.4)}" y2="${Y(-3)}" stroke="#fb923c" stroke-width="2" marker-end="url(#ar)"/>`;
    });
    if (o.routes) sim.offense.forEach((p) => {
      if (!p.route || !p.route.pts) return;
      const pts = [[p.x, p.y]].concat(p.route.pts.map(([dx, dy]) => [clamp(p.x + dx * (p.dir || 1), 1, 52.3), p.y + dy]));
      const hi = o.answer && p.id === o.answer;
      s += `<polyline points="${pts.map(([a, b]) => X(a) + ',' + Y(b)).join(' ')}" fill="none" stroke="${hi ? '#4ade80' : '#e5e7eb'}" stroke-width="${hi ? 3.5 : 2}" marker-end="url(#ar)"/>`;
    });
    s += `<defs><marker id="ar" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="#e5e7eb"/></marker></defs>`;
    sim.ol.forEach((p) => (s += `<rect x="${(X(p.x) - 6)}" y="${(Y(p.y) - 6)}" width="12" height="12" fill="#1d4ed8" stroke="#fff"/>`));
    s += `<circle cx="${X(sim.qb.x)}" cy="${Y(sim.qb.y)}" r="7" fill="#1d4ed8" stroke="#fff"/><text x="${X(sim.qb.x)}" y="${+Y(sim.qb.y) + 4}" font-size="8" text-anchor="middle" fill="#fff">QB</text>`;
    sim.offense.forEach((p) => (s += `<g class="opt-rcv" data-id="${p.id}"><circle cx="${X(p.x)}" cy="${Y(p.y)}" r="9" fill="${o.answer && p.id === o.answer ? '#16a34a' : '#2563eb'}" stroke="#fff" stroke-width="1.5"/><text x="${X(p.x)}" y="${+Y(p.y) + 4}" font-size="9" font-weight="700" text-anchor="middle" fill="#fff">${p.id}</text></g>`));
    if (o.front) sim.defense.forEach((d) => { if (d.down) s += `<rect x="${(X(d.x) - 7)}" y="${(Y(d.y) - 7)}" width="14" height="14" rx="2" fill="#7f1d1d" stroke="#fecaca" stroke-width="1"/>`; }); // v10: hands in the dirt = square
    sim.defense.forEach((d) => (s += `<text x="${X(d.x)}" y="${+Y(d.y) + 5}" font-size="14" font-weight="800" text-anchor="middle" fill="#fecaca" stroke="#7f1d1d" stroke-width="0.6">${esc(d.label)}</text>`));
    return s + '</svg>';
  }

  // ---------- styles ----------
  const css = `
  #pi-home,#pi-sheet{position:fixed;inset:0;z-index:60;background:radial-gradient(ellipse at 50% 0%,#14284a 0%,#060b16 70%);color:#e5e7eb;overflow:auto;font-family:inherit}
  #pi-home .wrap,#pi-sheet .wrap{max-width:920px;margin:0 auto;padding:22px 18px 60px}
  .pi-logo{font-size:30px;font-weight:900;letter-spacing:.14em}.pi-logo b{color:#3ee08f}.pi-sub{color:#94a3b8;margin:2px 0 18px}
  .pi-card{background:#0f172acc;border:1px solid #1e293b;border-radius:14px;padding:14px 16px;margin:10px 0}
  .pi-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.pi-lbl{font-size:11px;letter-spacing:.12em;color:#94a3b8;text-transform:uppercase;margin:8px 0 6px}
  .pi-chip{border:1px solid #334155;background:#111827;color:#e5e7eb;border-radius:999px;padding:7px 13px;cursor:pointer;font:inherit;font-size:13px}
  .pi-chip.on{background:#3ee08f;color:#052e16;border-color:#3ee08f;font-weight:700}.pi-chip:disabled{opacity:.4;cursor:not-allowed}
  .pi-play{background:linear-gradient(180deg,#4ade80,#16a34a);color:#052e16;font-weight:900;font-size:22px;letter-spacing:.1em;border:0;border-radius:16px;padding:16px 40px;cursor:pointer;box-shadow:0 8px 30px #16a34a55}
  .pi-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
  .pi-tile{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:12px;cursor:pointer;color:#e5e7eb;text-align:left;font:inherit}.pi-tile b{display:block;font-size:15px}.pi-tile span{font-size:12px;color:#94a3b8}
  .pi-rating{font-size:44px;font-weight:900;color:#3ee08f;line-height:1}.pi-small{font-size:12px;color:#94a3b8}
  .pi-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}@media(max-width:640px){.pi-grid2{grid-template-columns:1fr}}
  .pi-trait{display:grid;grid-template-columns:130px 1fr 34px;gap:8px;align-items:center;font-size:13px;margin:4px 0}.pi-trait .t{height:8px;background:#1f2937;border-radius:5px;overflow:hidden}.pi-trait .t i{display:block;height:100%;background:linear-gradient(90deg,#22d3ee,#3ee08f)}
  .pi-badge{display:inline-flex;gap:6px;align-items:center;border-radius:10px;padding:6px 10px;margin:3px;background:#1f2937;font-size:12px}.pi-badge.got{background:#14532d;color:#bbf7d0}.pi-badge:not(.got){opacity:.45}
  .pi-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
  .diag{width:100%;max-height:52vh;border-radius:10px;display:block}
  table.pi-t{width:100%;border-collapse:collapse;font-size:13px}table.pi-t td,table.pi-t th{padding:5px 6px;border-bottom:1px solid #1e293b;text-align:left}
  .pi-ok{color:#4ade80}.pi-bad{color:#f87171}.pi-x{float:right}

  #pi-home .wrap.v9{max-width:1060px}
  #pi-home{background:radial-gradient(ellipse at 50% -10%,#1b3a6b 0%,#0a1428 45%,#04070f 100%)}
  .pi-top{text-align:center;margin-bottom:10px}
  .pi-hero{display:grid;grid-template-columns:auto 1fr minmax(0,300px);gap:22px;align-items:center;background:linear-gradient(135deg,#0f1d36cc,#0a1222cc);border:1px solid #23406e;border-radius:22px;padding:18px 22px;box-shadow:0 20px 60px #0008,inset 0 1px 0 #ffffff12}
  .pi-ringwrap{position:relative;width:132px;height:132px}.pi-ring{width:132px;height:132px;transform:rotate(-90deg)}
  .pi-ring circle{fill:none;stroke-width:9}.pi-ring .bg{stroke:#1e293b}.pi-ring .fg{stroke:url(#none);stroke:#3ee08f;stroke-linecap:round;filter:drop-shadow(0 0 6px #3ee08f88)}
  .pi-ringwrap .pi-rating{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:900;margin-top:-8px}
  .pi-rlbl{position:absolute;left:0;right:0;bottom:30px;text-align:center;font-size:10px;letter-spacing:.2em;color:#94a3b8}
  .pi-herotxt{display:flex;flex-direction:column;gap:10px;align-items:flex-start}
  .pi-hero .pi-play{font-size:28px;padding:18px 56px;border-radius:18px;animation:piglow 2.4s ease-in-out infinite}
  @keyframes piglow{50%{box-shadow:0 8px 44px #22c55e99}}
  .pi-setup{margin-top:16px;background:#0b1424cc;border:1px solid #1e2c45;border-radius:18px;padding:14px 18px}
  .pi-modecards{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}
  .pi-mcard{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:14px;border:1px solid #24344f;background:#101c30;color:#cbd5e1;cursor:pointer;font:inherit}
  .pi-mcard i{font-style:normal;font-size:22px}.pi-mcard.on{border-color:#3ee08f;background:linear-gradient(180deg,#123a2a,#0f2a20);color:#fff;box-shadow:0 0 0 1px #3ee08f55}
  .pi-ladder{display:flex;gap:6px;flex-wrap:wrap}
  .pi-rung{flex:1 1 90px;display:flex;align-items:center;gap:6px;padding:9px 10px;border-radius:10px;border:1px solid #24344f;background:#101c30;color:#e5e7eb;cursor:pointer;font:inherit;font-size:13px}
  .pi-rung .n{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#1e293b;font-size:11px}
  .pi-rung.on{border-color:#ffd23f;background:#2a2410}.pi-rung.on .n{background:#ffd23f;color:#111}.pi-rung.locked{opacity:.45;cursor:not-allowed}
  .pi-grid3{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:end;margin-top:4px}
  .pi-seg{display:flex;gap:6px;flex-wrap:wrap}
  #pi-home .pi-tiles{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
  /* v12 menu breathing room */
  #pi-home .wrap.v12{max-width:1080px;padding:28px 22px 72px}
  .pi-hero-v12{gap:22px;margin-bottom:8px}
  .pi-setup-v12{display:flex;flex-direction:column;gap:14px;margin:18px 0 8px;padding:16px 16px 18px;background:#0c1528cc;border:1px solid #1e3a5f;border-radius:16px}
  .pi-gametypes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .pi-gtype{text-align:left;padding:14px 16px;border-radius:14px;border:1px solid #234;background:#0a1220;color:#e5e7eb;cursor:pointer;display:flex;flex-direction:column;gap:6px}
  .pi-gtype b{font-size:16px}.pi-gtype span{font-size:12px;color:#94a3b8;line-height:1.35}
  .pi-gtype.on{border-color:#3b82f6;background:linear-gradient(180deg,#132a4a,#0c1a30);box-shadow:0 0 0 1px #3b82f688}
  .pi-row2{display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start}
  .pi-tiles-primary{margin-top:6px}.pi-tiles-util{opacity:.95}
  @media (max-width:760px){.pi-gametypes,.pi-row2{grid-template-columns:1fr}#pi-home .wrap.v12{padding:18px 14px 56px}}

  .pi-overhome{z-index:70 !important}
  @media (max-width:760px){.pi-hero{grid-template-columns:1fr;justify-items:center;text-align:center}.pi-herotxt{align-items:center}.pi-chartwrap{width:100%}.pi-grid3{grid-template-columns:1fr}.pi-hero .pi-play{font-size:24px;padding:16px 44px}#pi-home .pi-tiles{grid-template-columns:1fr 1fr}}
  #pi-hud{position:fixed;bottom:86px;left:12px;z-index:21;background:#0b1220cc;border:1px solid #1e293b;border-radius:999px;padding:4px 12px;font-size:12px;color:#cbd5e1;pointer-events:none}
  #pi-hud b{color:#3ee08f}
  body.pi-immersive #hud-top .right select,body.pi-immersive #q-det,body.pi-immersive #q-unl,body.pi-immersive #help{display:none}
  #res-extra{display:grid;grid-template-columns:72px minmax(0,1fr);gap:10px;align-items:start;margin:6px 0;position:relative;overflow:hidden}#res-extra .rwrap{width:72px;height:72px;flex:none}#res-extra .pi-sring{display:block;width:72px;height:72px;transform:none!important}#res-extra .seen{min-width:0;overflow-wrap:anywhere}
  @media (max-height:430px){#res-extra{grid-template-columns:56px minmax(0,1fr)}#res-extra .rwrap,#res-extra .pi-sring{width:56px;height:56px}}
  #res-extra .seen{font-size:12px;line-height:1.5}#res-extra .tbar{position:relative;height:10px;background:#1f2937;border-radius:5px;margin-top:6px}
  #res-extra .tbar i{position:absolute;top:-3px;width:3px;height:16px;border-radius:2px}#res-extra .tbar .win{position:absolute;top:0;height:100%;background:#16a34a66;border-radius:5px}
  .pi-cardlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.pi-cc{background:#111827;border:1px solid #1f2937;border-radius:12px;padding:10px}.pi-cc h4{margin:2px 0 6px}.pi-cc p{font-size:12px;color:#cbd5e1;margin:4px 0}
  /* v13 practice builder: big tap targets, wrapping text, sticky start bar, no sideways scroll */
  .pi-prac{min-width:0;overflow:hidden}.pi-tap{min-height:44px;padding:10px 15px}.pi-chip.part{border-color:#3ee08f;box-shadow:inset 0 0 0 1px #3ee08f}.pi-chip small{opacity:.75;font-weight:600}
  .pi-seg{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:2px 0 8px}.pi-seg .pi-chip{border-radius:12px;white-space:normal}
  .pi-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0}.pi-cs .pi-chip{max-width:100%;white-space:normal;overflow-wrap:anywhere;text-align:left}
  .pi-optlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:6px;min-width:0}
  .pi-grp{grid-column:1/-1;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin:10px 0 2px;text-align:left}
  .pi-grpbtn{background:none;border:0;border-bottom:1px solid #1e293b;color:#cbd5e1;font:inherit;font-size:12px;min-height:44px;cursor:pointer;padding:6px 2px;overflow-wrap:anywhere}.pi-grpbtn small{text-transform:none;letter-spacing:0;color:#64748b}
  .pi-opt{display:flex;align-items:center;gap:10px;min-height:48px;min-width:0;width:100%;text-align:left;background:#111827;border:1px solid #334155;color:#e5e7eb;border-radius:12px;padding:8px 12px;cursor:pointer;font:inherit}
  .pi-opt span{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}.pi-opt b{font-size:14px}.pi-opt em{font-style:normal;font-size:12px;color:#94a3b8}
  .pi-opt.on{border-color:#3ee08f;background:#0b2a1c}.pi-box{flex:none;width:22px;height:22px;border-radius:6px;border:2px solid #475569;display:grid;place-items:center;font-style:normal;font-weight:900;color:#052e16}.pi-opt.on .pi-box{background:#3ee08f;border-color:#3ee08f}
  .pi-gobar{position:sticky;bottom:0;z-index:2;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;text-align:center;margin:12px -6px 0;padding:10px 8px calc(10px + env(safe-area-inset-bottom,0px));background:#081022;border-top:1px solid #1e293b;border-radius:14px 14px 0 0;box-shadow:0 -10px 24px #060b16}
  .pi-gobar #pi-pr-err{flex:1 1 220px;min-width:0;overflow-wrap:anywhere}.pi-play:disabled{opacity:.45;cursor:not-allowed;box-shadow:none}
  #pi-pr-prev summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
  @media (max-height:500px){.pi-gobar{padding-top:6px;padding-bottom:calc(6px + env(safe-area-inset-bottom,0px))}.pi-gobar .pi-play{font-size:17px;padding:11px 26px;min-height:44px}.pi-gobar #pi-pr-err{font-size:12px}}
  .pi-toast{position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:80;background:#14532d;color:#dcfce7;border-radius:12px;padding:10px 16px;font-weight:700;box-shadow:0 10px 30px #0008}
  `;
  function toast(t) { document.querySelectorAll('.pi-toast').forEach((x) => x.remove()); const d = el('div', 'pi-toast', t); document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

  // ---------- home ----------
  function playsets() {
    const pool = M.pool(P.prefs.mode || M.getMode());
    const names = [...new Set(pool.map((p) => p.name.replace(' (audible)', '')))];
    return [{ id: 'all', label: 'Full playbook' }].concat(names.map((n) => ({ id: 'c:' + n, label: n })));
  }
  function showHome() {
    closeSheet(); let h = $('pi-home'); if (!h) { h = el('div'); h.id = 'pi-home'; document.body.appendChild(h); }
    const mode = P.prefs.mode || M.getMode(); P.prefs.mode = mode;
    if (!P.prefs.gameType) P.prefs.gameType = 'call';
    const gt = P.prefs.gameType === 'read' ? 'read' : 'call';
    try { localStorage.setItem('pocketiq3d.gameType', gt); } catch (e) {}
    const last = P.sessions.filter((s) => s.scored).slice(-1)[0];
    const ps = playsets(), nSc = P.sessions.filter((s) => s.scored).length, R = Math.round(P.rating), C = 2 * Math.PI * 52;
    const stad = (window.__stadium && window.__stadium()) || 'bowl', ST = window.__STADIUMS || { bowl: 'Outdoor Bowl', dome: 'Indoor Dome', hs: 'High School' };
    const MI = { normal: '🏈', passing: '🎯', running: '🏃', rpo: '⚡', redzone: '🔥', twomin: '⏱', blitz: '💥' };
    const gtLabel = gt === 'read' ? 'Just read' : 'Call it';
    // v12 home: hero → Game Type → Mode+Level → Session/Stadium → secondary tiles → utilities
    h.innerHTML = `<div class="wrap v12"><div class="pi-top"><div class="pi-logo">POCKET<b>IQ</b></div><div class="pi-sub">Read the defense · make the call · deliver on time</div></div>
    <section class="pi-hero pi-hero-v12"><div class="pi-ringwrap" title="Pocket IQ rating"><svg viewBox="0 0 120 120" class="pi-ring"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" stroke-dasharray="${(C * R / 99).toFixed(1)} ${C.toFixed(1)}"/></svg><div class="pi-rating" id="pi-rating">${R}</div><div class="pi-rlbl">POCKET IQ</div></div>
      <div class="pi-herotxt"><div class="pi-small">${nSc} scored sessions${last ? ` · last ${last.avg}` : ''} · ${dayStreak()} day streak 🔥</div>
      <button class="pi-play" id="pi-play">▶ PLAY</button>
      <div class="pi-small" id="pi-sumline">${esc(gtLabel)} · ${esc(M.MODES.find((m) => m.id === mode).label)} · ${esc(LEVELS.find((l) => l.id === P.level).label)} · ${P.prefs.scored ? 'Scored' : 'Practice'} · ${esc(ST[stad])}</div></div>
      <div class="pi-chartwrap">${chart(P.sessions.filter((s) => s.scored).slice(-20))}</div></section>

    <section class="pi-setup pi-setup-v12">
      <div class="pi-lbl">Game type</div>
      <div class="pi-gametypes" id="pi-gametypes">
        <button class="pi-gtype${gt === 'call' ? ' on' : ''}" data-gt="call"><b>Call it</b><span>Predict coverage &amp; pressure, then throw. Scored on ID + read + timing.</span></button>
        <button class="pi-gtype${gt === 'read' ? ' on' : ''}" data-gt="read"><b>Just read</b><span>No predictions — throw the right receiver vs the look. Graded on read, timing &amp; result.</span></button>
      </div>

      <div class="pi-row2">
        <div><div class="pi-lbl">Playbook mode</div><div class="pi-modecards" id="pi-modes">${M.MODES.map((m) => `<button class="pi-mcard${m.id === mode ? ' on' : ''}" data-mode="${m.id}"><i>${MI[m.id] || '🏈'}</i><b>${m.label}</b></button>`).join('')}</div></div>
        <div><div class="pi-lbl">Level</div><div class="pi-ladder" id="pi-levels">${LEVELS.map((l, i) => { const un = P.unlocked.includes(l.id); return `<button class="pi-rung${P.level === l.id ? ' on' : ''}${un ? '' : ' locked'}" data-lv="${l.id}" ${un ? '' : 'disabled title="Unlock: average ' + UNLOCK_AVG + '+ in a scored session at the level below"'}><span class="n">${i + 1}</span>${un ? '' : '🔒 '}${l.label}</button>`; }).join('')}</div><div class="pi-small" id="pi-lvnote">${LEVELS.find((l) => l.id === P.level).note}</div></div>
      </div>

      <div class="pi-grid3"><div><div class="pi-lbl">Session</div><div class="pi-seg"><button class="pi-chip${P.prefs.scored ? ' on' : ''}" data-sc="1">Scored · ${SESSION_LEN}</button><button class="pi-chip${!P.prefs.scored ? ' on' : ''}" data-sc="0">Practice · unrated</button></div></div>
      <div><div class="pi-lbl">Playbook set</div><select id="pi-playset" class="pi-chip">${ps.map((p) => `<option value="${esc(p.id)}"${P.prefs.playset === p.id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select></div>
      <div><div class="pi-lbl">Stadium</div><div class="pi-seg" id="pi-stadiums">${Object.entries(ST).map(([k, v]) => `<button class="pi-chip${k === stad ? ' on' : ''}" data-stadium="${k}">${{ dome: '🏟', hs: '🏫', bowl: '🌃' }[k]} ${v}</button>`).join('')}</div></div></div>
    </section>

    <div class="pi-lbl" style="margin-top:18px">Train &amp; learn</div>
    <div class="pi-tiles pi-tiles-primary">
      <button class="pi-tile" data-go="film"><b>🎬 Film Room</b><span>Coverage quiz · where does the ball go · coach cards</span></button>
      <button class="pi-tile" data-go="practice"><b>🎯 Practice</b><span>Pick a play and a look; rep it until it's automatic</span></button>
      <button class="pi-tile" data-go="daily"><b>📅 Daily Coverage</b><span>${P.daily[today()] ? 'Done today: ' + P.daily[today()].score + '/5' : '5 looks, same for everyone on this device today'}</span></button>
      <button class="pi-tile" data-go="custom"><b>✎ Custom plays</b><span>Design, save and rep your own plays</span></button>
    </div>
    <div class="pi-lbl" style="margin-top:14px">Progress &amp; tools</div>
    <div class="pi-tiles pi-tiles-util">
      <button class="pi-tile" data-go="progress"><b>📈 Progress</b><span>Rep history, stats &amp; trends</span></button>
      <button class="pi-tile" data-go="board"><b>🏆 Bests</b><span>Local leaderboard &amp; personal bests</span></button>
      <button class="pi-tile" data-go="ach"><b>🏅 Achievements</b><span>${Object.keys(P.ach).length}/${ACH.length} earned</span></button>
      <button class="pi-tile" data-go="settings"><b>⚙ Settings</b><span>Camera, graphics, stadium, protections</span></button>
      <button class="pi-tile" data-go="free"><b>🏈 Free play</b><span>Endless reps, no session (classic sim)</span></button>
    </div>
    <p class="pi-small" style="margin-top:16px">Progress is stored only in this browser (local-only). Pocket IQ is an independent training sim.</p></div>`;
    h.querySelectorAll('[data-stadium]').forEach((b) => (b.onclick = () => { if (window.__setStadium) window.__setStadium(b.dataset.stadium); showHome(); }));
    const overHome = (id) => { const e = document.getElementById(id); if (e) e.classList.add('pi-overhome'); };
    h.querySelectorAll('[data-gt]').forEach((b) => (b.onclick = () => { P.prefs.gameType = b.dataset.gt; try { localStorage.setItem('pocketiq3d.gameType', b.dataset.gt); } catch (e) {} save(); showHome(); }));
    h.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { P.prefs.mode = b.dataset.mode; P.prefs.playset = 'all'; save(); showHome(); }));
    h.querySelectorAll('[data-lv]').forEach((b) => (b.onclick = () => { P.level = b.dataset.lv; save(); showHome(); }));
    h.querySelectorAll('[data-sc]').forEach((b) => (b.onclick = () => { P.prefs.scored = b.dataset.sc === '1'; save(); showHome(); }));
    $('pi-playset').onchange = (e) => { P.prefs.playset = e.target.value; save(); };
    $('pi-play').onclick = () => startSession({ scored: P.prefs.scored });
    h.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => ({ practice: showPractice, film: () => showFilm('quiz'), daily: () => showFilm('daily'), board: showBoard, ach: showAch, progress: () => { overHome('history'); document.getElementById('menu-progress').click(); }, custom: () => { overHome('designer'); document.getElementById('menu-custom').click(); }, settings: () => { overHome('menu'); document.getElementById('menu-btn').click(); }, free: () => { endSession(); hideHome(); } })[b.dataset.go]()));
    h.hidden = false; document.body.classList.remove('pi-immersive'); hud();
  }
  function hideHome() { const h = $('pi-home'); if (h) h.hidden = true; }
  function sheet(title, body) {
    let s = $('pi-sheet'); if (!s) { s = el('div'); s.id = 'pi-sheet'; document.body.appendChild(s); }
    s.innerHTML = `<div class="wrap"><button class="pi-chip pi-x" id="pi-sheet-x">✕ Home</button><div class="pi-logo" style="font-size:22px">${title}</div>${body}</div>`;
    s.hidden = false; $('pi-sheet-x').onclick = showHome; return s;
  }
  function closeSheet() { const s = $('pi-sheet'); if (s) s.hidden = true; }

  // ---------- sessions ----------
  function levelOf(id) { return LEVELS.find((l) => l.id === id) || LEVELS[1]; }
  function applyCommon(mode, level) {
    if (mode && M.getMode() !== mode) { M.setMode(mode); Q.state.mode = mode; const ms = $('mode-sel'); if (ms) ms.value = mode; }
    Q.setDiff(levelOf(level).diff);
  }
  function startSession(o) {
    const level = P.level, mode = P.prefs.mode || M.getMode(), ps = o.practice ? null : P.prefs.playset;
    S.active = { scored: !!o.scored && !o.practice, practice: o.practice || null, run: null, level, mode, playset: ps, reps: [], at: new Date().toISOString(), gameType: P.prefs.gameType || 'call' };
    try { localStorage.setItem('pocketiq3d.gameType', S.active.gameType); } catch (e) {}
    applyCommon(mode, level);
    Q.setPoolFilter(ps && ps.startsWith('c:') ? (p) => p.name.replace(' (audible)', '') === ps.slice(2) : null);
    closeSheet(); hideHome(); document.body.classList.add('pi-immersive');
    Q.state.session.streak = 0;
    Q.nextPlay(nextForced()); hud();
  }
  function endSession() { S.active = null; if (Q) Q.setPoolFilter(null); document.body.classList.remove('pi-immersive'); hud(); }
  function nextForced() {
    const a = S.active; if (!a || !a.practice) return undefined;
    if (!a.run) a.run = window.QBPractice.createRun(a.mode, a.practice.cfg); // fresh shuffle bags per session
    return a.run.next();
  }
  function hud() {
    let d = $('pi-hud'); if (!d) { d = el('div'); d.id = 'pi-hud'; document.body.appendChild(d); }
    const a = S.active; d.hidden = !a;
    if (a) d.innerHTML = a.practice ? `PRACTICE · <b>${esc(a.practice.concept)}</b> · rep ${a.reps.length + 1} · ${levelOf(a.level).label} · <u style="pointer-events:auto;cursor:pointer" id="pi-end">end</u>` : `${a.scored ? 'SCORED' : 'PRACTICE'} · rep <b>${Math.min(SESSION_LEN, a.reps.length + 1)}/${SESSION_LEN}</b> · ${levelOf(a.level).label}`;
    const e = $('pi-end'); if (e) { d.style.pointerEvents = 'auto'; e.onclick = () => showSummary(); } else d.style.pointerEvents = 'none';
  }
  window.PocketHub.beforeNext = function () {
    const a = S.active; if (!a) return false;
    if (!a.practice && a.reps.length >= SESSION_LEN) { showSummary(); return true; }
    return false;
  };
  window.PocketHub.nextForced = nextForced;
  window.addEventListener('pocketiq:rep', (ev) => {
    const { rec, g, play, sim, thrown } = ev.detail;
    feedback(ev.detail);
    const a = S.active; if (!a) return;
    a.reps.push({ ...rec, ideal: g.ideal, best: g.correct || null, thrown, name: play.name, sacked: sim.result.type === 'sack' });
    hud();
  });

  // ---------- rep feedback polish ----------
  function ring(v, size) {
    const r = size / 2 - 6, c = 2 * Math.PI * r, f = clamp(v / 100, 0, 1), col = v >= 80 ? '#3ee08f' : v >= 60 ? '#facc15' : '#f87171';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="pi-sring" style="transform:none"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#1f2937" stroke-width="8" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${col}" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="54%" text-anchor="middle" font-size="${size / 3.4}" font-weight="900" fill="#fff">${Math.round(v)}</text><text x="50%" y="74%" text-anchor="middle" font-size="9" fill="#94a3b8">SIM</text></svg>`;
  }
  function feedback({ rec, g, sim, thrown }) {
    // v11: simple panel — ring + 3 plain-language sections; details behind expander
    const res = $('result'); if (!res) return;
    const x = $('res-extra'), sec = $('res-sections'), why = $('res-why'), more = $('res-more'), mbtn = $('res-more-btn');
    const Dv = VAR[sim.cov.variant], fam = FAMILY_NAMES[sim.cov.shell] || sim.cov.shell, bl = D.BLITZES[sim.play.pressure];
    const covName = Dv ? Dv.name : fam, pressName = bl ? bl.name : (sim.play.pressure || 'Base');
    // one-line why under the headline
    let whyTxt = '';
    if (rec.type === 'run') whyTxt = g.readOk || (g.parts && g.parts['Run decision'] >= 35) ? 'Solid run decision.' : 'Check the box count next time.';
    else if (rec.result === 'interception' || rec.int) whyTxt = 'Ball went to the defense — tighter window or better read next rep.';
    else if (rec.result === 'sack') whyTxt = 'Pressure won — get the ball out or protect better.';
    else if (g.readOk) whyTxt = thrown ? `Threw it to ${thrown} — the right idea.` : 'Good decision.';
    else if (g.correct) whyTxt = thrown ? `You threw ${thrown}; the better answer was ${g.correct}.` : `Best answer was ${g.correct}.`;
    else whyTxt = 'Rep complete.';
    if (why) why.textContent = whyTxt;
    if (x) {
      const tip = (g.ideal != null && rec.type !== 'run' && thrown != null)
        ? `<div class="pi-small">Ball out ${rec.time.toFixed(2)}s · on-time ≈ ${g.ideal.toFixed(1)}s</div>` : '';
      x.innerHTML = `<div class="rwrap">${ring(rec.sim, 72)}</div><div class="seen"><div><b>SIM ${rec.sim}</b></div>${tip}</div>`;
    }
    if (sec) {
      const sawCls = g.covOk && g.presOk ? 'ok' : (g.covOk || g.presOk ? '' : 'bad');
      const sawTxt = g.covOk && g.presOk
        ? `You had it — <b>${esc(covName)}</b>, <b>${esc(pressName)}</b>.`
        : `It was <b>${esc(covName)}</b> with <b>${esc(pressName)}</b>.${Dv && !g.covOk ? ' Tell: ' + esc(Dv.tell) : ''}`;
      const readCls = g.readOk ? 'ok' : 'bad';
      const readTxt = rec.type === 'run'
        ? (g.parts && g.parts['Run decision'] >= 35 ? 'Hand-off matched the look.' : 'Run fit was off for this front/box.')
        : (g.correct
          ? (g.readOk ? `Threw <b>${esc(thrown || g.correct)}</b> — correct.` : `Best read was <b>${esc(g.correct)}</b>${thrown ? `; you threw <b>${esc(thrown)}</b>` : ''}.`)
          : 'No clear best read tagged.');
      const justRead = (localStorage.getItem('pocketiq3d.gameType') === 'read') || (S.active && S.active.gameType === 'read');
      const covCls = justRead ? '' : (g.covOk ? 'ok' : 'bad');
      const covTxt = justRead
        ? `Look was <b>${esc(covName)}</b> (revealed — not graded in Just read).`
        : (g.covOk ? `Nailed the family${g.varOk ? ' and variant' : ''}.` : `Coverage ID missed — it was <b>${esc(covName)}</b>.`);
      sec.innerHTML = justRead
        ? `<div class="sec"><h4>Best read</h4><p class="${readCls}">${readTxt}</p></div>
        <div class="sec"><h4>Timing &amp; result</h4><p>${esc(whyTxt)}</p></div>
        <div class="sec"><h4>Coverage</h4><p class="${covCls}">${covTxt}</p></div>`
        : `<div class="sec"><h4>What you saw</h4><p class="${sawCls}">${sawTxt}</p></div>
        <div class="sec"><h4>Best read</h4><p class="${readCls}">${readTxt}</p></div>
        <div class="sec"><h4>Coverage ID</h4><p class="${covCls}">${covTxt}</p></div>`;
    }
    if (more) more.hidden = true;
    if (mbtn) { mbtn.textContent = 'More details ▾'; mbtn.onclick = () => { const open = more && !more.hidden; if (more) more.hidden = open; mbtn.textContent = open ? 'More details ▾' : 'Hide details ▴'; }; }
    requestAnimationFrame(() => { res.scrollTop = 0; });
    const nb = $('next-btn'); const a = S.active;
    if (nb && a && !a.practice) nb.firstChild.textContent = a.reps.length + 1 >= SESSION_LEN ? 'Session summary ' : 'Next rep ';
    else if (nb) nb.firstChild.textContent = 'Next rep ';
  }

  // ---------- summary, traits, rating ----------
  const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  function traits(reps) {
    const pass = reps.filter((r) => r.type !== 'run'), thrown = pass.filter((r) => r.thrown);
    const pct = (arr, f) => (arr.length ? 100 * arr.filter(f).length / arr.length : 0);
    const pre = avg(reps.map((r) => ((r.covOk ? 1 : 0) + (r.presOk ? 1 : 0) + (r.protOk == null ? 1 : r.protOk ? 1 : 0)) / 3 * 100));
    return {
      'Pre-snap': pre,
      'Progressions': pass.length ? pct(pass, (r) => r.readOk) : pct(reps, (r) => r.runOk),
      'Decision speed': thrown.length ? avg(thrown.map((r) => 100 * clamp(1 - (Math.abs(r.time - (r.ideal || r.time)) - 0.2) / 1.3, 0, 1))) : 50,
      'Accuracy': thrown.length ? pct(thrown, (r) => r.result === 'complete') : 50,
      'Ball security': clamp(100 - 30 * reps.filter((r) => r.int || r.result === 'fumble').length - 60 * avg(reps.map((r) => r.risk || 0)), 0, 100),
      'Pocket presence': clamp(100 - 100 * pass.filter((r) => r.sacked).length / Math.max(1, pass.length) * 2 - 20 * pass.filter((r) => r.protOk === false).length / Math.max(1, pass.length), 0, 100),
      'Football IQ': avg(reps.map((r) => r.sim)),
    };
  }
  function summarize(a) {
    const reps = a.reps, pass = reps.filter((r) => r.type !== 'run'), thrown = pass.filter((r) => r.thrown);
    const by = reps.slice().sort((x, y) => y.sim - x.sim);
    return { n: reps.length, avg: Math.round(avg(reps.map((r) => r.sim))), cov: Math.round(100 * reps.filter((r) => r.covOk).length / Math.max(1, reps.length)),
      read: pass.length ? Math.round(100 * pass.filter((r) => r.readOk).length / pass.length) : null, dtime: thrown.length ? +avg(thrown.map((r) => r.time)).toFixed(2) : null,
      ints: reps.filter((r) => r.int).length, best: by[0], worst: by[by.length - 1], traits: traits(reps) };
  }
  function showSummary() {
    const a = S.active; if (!a) return showHome();
    const sm = summarize(a); let unlockMsg = '', newAch = [];
    if (sm.n) {
      const rec = { at: a.at, end: new Date().toISOString(), level: a.level, mode: a.mode, scored: a.scored, practice: a.practice ? a.practice.concept : null, playset: a.playset, n: sm.n, avg: sm.avg, cov: sm.cov, read: sm.read, dtime: sm.dtime, ints: sm.ints, traits: Object.fromEntries(Object.entries(sm.traits).map(([k, v]) => [k, Math.round(v)])) };
      if (a.scored && sm.n >= SESSION_LEN) {
        const before = P.rating; P.rating = clamp(0.7 * P.rating + 0.3 * sm.avg * levelOf(a.level).mult, 0, 99); rec.ratingDelta = +(P.rating - before).toFixed(1); rec.rating = +P.rating.toFixed(1);
        const i = LEVELS.findIndex((l) => l.id === a.level), nx = LEVELS[i + 1];
        if (sm.avg >= UNLOCK_AVG && nx && !P.unlocked.includes(nx.id)) { P.unlocked.push(nx.id); unlockMsg = `🔓 ${nx.label} unlocked!`; }
      }
      P.sessions.push(rec); if (P.sessions.length > 200) P.sessions.shift();
      if (!P.days.includes(today())) P.days.push(today());
      newAch = checkAch(rec, a.reps);
      save();
    }
    endSession();
    const t = Object.entries(sm.traits).map(([k, v]) => `<div class="pi-trait"><span>${k}</span><span class="t"><i style="width:${v.toFixed(0)}%"></i></span><b>${Math.round(v)}</b></div>`).join('');
    const rr = (r) => (r ? `${esc(r.name)} vs ${esc((VAR[r.variant] || {}).name || r.coverage)} — <b>${r.sim}</b> (${r.result}${r.yards ? ' ' + r.yards + ' yd' : ''})` : '—');
    const last = P.sessions[P.sessions.length - 1] || {};
    const s = sheet('SESSION SUMMARY', `<div class="pi-small">${a.practice ? 'Practice · ' + esc(a.practice.concept) : (a.scored ? 'Scored' : 'Practice')} · ${levelOf(a.level).label} · ${sm.n} reps</div>
      <div class="pi-grid2"><div class="pi-card" style="text-align:center">${ring(sm.avg, 150)}<div class="pi-small">SIM average</div>${a.scored && last.rating != null ? `<div style="margin-top:6px">Pocket IQ rating <b class="pi-ok">${Math.round(last.rating)}</b> (${last.ratingDelta >= 0 ? '+' : ''}${last.ratingDelta})</div>` : '<div class="pi-small">Unrated session</div>'}${unlockMsg ? `<div class="pi-ok" style="font-weight:800;margin-top:6px">${unlockMsg}</div>` : ''}</div>
      <div class="pi-card"><table class="pi-t" id="pi-sum-t"><tr><td>Coverage ID</td><td><b>${sm.cov}%</b></td></tr><tr><td>Read accuracy</td><td><b>${sm.read == null ? '—' : sm.read + '%'}</b></td></tr><tr><td>Avg decision time</td><td><b>${sm.dtime == null ? '—' : sm.dtime + ' s'}</b></td></tr><tr><td>Interceptions</td><td><b class="${sm.ints ? 'pi-bad' : 'pi-ok'}">${sm.ints}</b></td></tr><tr><td>Best rep</td><td>${rr(sm.best)}</td></tr><tr><td>Worst rep</td><td>${rr(sm.worst)}</td></tr></table></div></div>
      <div class="pi-grid2"><div class="pi-card"><div class="pi-lbl">Traits</div>${t}</div><div class="pi-card"><div class="pi-lbl">Progress (scored sessions)</div>${chart(P.sessions.filter((x) => x.scored).slice(-20))}${newAch.length ? `<div class="pi-lbl">New achievements</div>${newAch.map((x) => `<span class="pi-badge got">${x.icon} ${x.label}</span>`).join('')}` : ''}</div></div>
      <div class="pi-row" style="justify-content:center"><button class="pi-play" id="pi-again">▶ AGAIN</button><button class="pi-chip" id="pi-home-b">Home</button></div>`);
    $('pi-again').onclick = () => (a.practice ? startSession({ practice: a.practice }) : startSession({ scored: a.scored }));
    $('pi-home-b').onclick = showHome; void s;
  }
  function chart(list) {
    const w = 420, h = 120, pad = 18;
    if (!list.length) return `<svg class="pi-chart" viewBox="0 0 ${w} ${h}" width="100%"><text x="${w / 2}" y="${h / 2}" fill="#64748b" text-anchor="middle" font-size="12">Finish a scored session to start your chart</text></svg>`;
    const X = (i) => pad + (list.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (list.length - 1)), Y = (v) => h - pad - ((v || 0) / 100) * (h - 2 * pad);
    const line = (k, col) => `<polyline fill="none" stroke="${col}" stroke-width="2.5" points="${list.map((s, i) => X(i).toFixed(1) + ',' + Y(s[k]).toFixed(1)).join(' ')}"/>` + list.map((s, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(s[k]).toFixed(1)}" r="3" fill="${col}"/>`).join('');
    return `<svg class="pi-chart" viewBox="0 0 ${w} ${h}" width="100%">${[25, 50, 75, 100].map((v) => `<line x1="${pad}" x2="${w - pad}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1e293b"/><text x="2" y="${Y(v) + 3}" font-size="8" fill="#64748b">${v}</text>`).join('')}${line('avg', '#22d3ee')}${line('rating', '#3ee08f')}<text x="${w - pad}" y="12" font-size="9" fill="#22d3ee" text-anchor="end">● session SIM</text><text x="${w - pad - 80}" y="12" font-size="9" fill="#3ee08f" text-anchor="end">● rating</text></svg>`;
  }

  // ---------- achievements & streaks ----------
  const ACH = [
    { id: 'first', icon: '🏈', label: 'First session', test: (s) => s.n >= 1 },
    { id: 'clean', icon: '🧤', label: 'Clean sheet (10 reps, 0 INT)', test: (s) => s.n >= SESSION_LEN && s.ints === 0 },
    { id: 's80', icon: '⭐', label: 'SIM 80+ session', test: (s) => s.n >= SESSION_LEN && s.avg >= 80 },
    { id: 's90', icon: '🌟', label: 'SIM 90+ session', test: (s) => s.n >= SESSION_LEN && s.avg >= 90 },
    { id: 'eyes', icon: '👁️', label: 'Coverage master (100% ID)', test: (s) => s.n >= SESSION_LEN && s.cov === 100 },
    { id: 'prog', icon: '🎯', label: 'Perfect progressions (100% reads)', test: (s) => s.n >= SESSION_LEN && s.read === 100 },
    { id: 'quick', icon: '⚡', label: 'Quick trigger (avg < 2.4 s, 80%+ reads)', test: (s) => s.dtime != null && s.dtime < 2.4 && s.read >= 80 },
    { id: 'hot5', icon: '🔥', label: 'Hot hand (5 good reps in a row)', test: (s, reps) => run(reps) >= 5 },
    { id: 'hot10', icon: '💯', label: 'Unstoppable (10 in a row)', test: (s, reps) => run(reps) >= 10 },
    { id: 'college', icon: '🎓', label: 'Reached College', test: () => P.unlocked.includes('college') },
    { id: 'pro', icon: '🏆', label: 'Reached Pro', test: () => P.unlocked.includes('pro') },
    { id: 'day3', icon: '📆', label: '3-day streak', test: () => dayStreak() >= 3 },
    { id: 'day7', icon: '🗓️', label: '7-day streak', test: () => dayStreak() >= 7 },
    { id: 'film10', icon: '🎬', label: 'Film junkie (10 quiz answers right)', test: () => P.quiz.right >= 10 },
    { id: 'daily5', icon: '📅', label: 'Perfect daily (5/5)', test: () => Object.values(P.daily).some((d) => d.score === 5) },
  ];
  function run(reps) { let b = 0, c = 0; (reps || []).forEach((r) => { c = (r.type === 'run' ? r.runOk : r.readOk) && !r.int ? c + 1 : 0; b = Math.max(b, c); }); return b; }
  function dayStreak() {
    const set = new Set(P.days); let n = 0; const d = new Date();
    if (!set.has(today())) d.setDate(d.getDate() - 1);
    for (;;) { const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; if (!set.has(k)) break; n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function checkAch(s, reps) {
    const got = [];
    ACH.forEach((a) => { if (!P.ach[a.id] && a.test(s || {}, reps)) { P.ach[a.id] = new Date().toISOString(); got.push(a); } });
    if (got.length) { save(); toast(got.length === 1 ? `${got[0].icon} Achievement: ${got[0].label}` : `🏅 ${got.length} new achievements: ${got.map((a) => a.icon).join(' ')}`); }
    return got;
  }
  function showAch() {
    sheet('ACHIEVEMENTS', `<div class="pi-card"><div class="pi-lbl">Streak</div><div class="pi-rating">${dayStreak()} 🔥</div><div class="pi-small">consecutive days with a finished session</div></div>
    <div class="pi-card">${ACH.map((a) => `<span class="pi-badge${P.ach[a.id] ? ' got' : ''}">${a.icon} ${a.label}</span>`).join('')}</div>`);
  }

  // ---------- leaderboard ----------
  function showBoard() {
    const sc = P.sessions.filter((s) => s.scored && s.n >= SESSION_LEN).slice().sort((a, b) => b.avg - a.avg).slice(0, 10);
    const pb = LEVELS.map((l) => { const a = P.sessions.filter((s) => s.scored && s.level === l.id); return `<tr><td>${l.label}</td><td>${a.length}</td><td><b>${a.length ? Math.max(...a.map((s) => s.avg)) : '—'}</b></td><td>${a.length ? Math.max(...a.map((s) => s.cov)) + '%' : '—'}</td><td>${a.filter((s) => s.dtime).length ? Math.min(...a.filter((s) => s.dtime).map((s) => s.dtime)) + ' s' : '—'}</td></tr>`; }).join('');
    const fmt = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    sheet('BESTS', `<div class="pi-small">🔒 Local-only: these are sessions played in this browser. There is no online leaderboard.</div>
    <div class="pi-card"><div class="pi-lbl">Top 10 scored sessions</div><table class="pi-t" id="pi-lb"><tr><th>#</th><th>SIM</th><th>Level</th><th>Mode</th><th>Cov</th><th>Read</th><th>INT</th><th>When</th></tr>${sc.map((s, i) => `<tr><td>${i + 1}</td><td><b>${s.avg}</b></td><td>${levelOf(s.level).label}</td><td>${esc(s.mode)}</td><td>${s.cov}%</td><td>${s.read == null ? '—' : s.read + '%'}</td><td>${s.ints}</td><td>${fmt(s.end || s.at)}</td></tr>`).join('') || '<tr><td colspan="8">No scored sessions yet.</td></tr>'}</table></div>
    <div class="pi-card"><div class="pi-lbl">Personal bests by level</div><table class="pi-t"><tr><th>Level</th><th>Sessions</th><th>Best SIM</th><th>Best Cov</th><th>Fastest avg</th></tr>${pb}</table></div>`);
  }

  // ---------- practice ----------
  // v13: multi-select. Offense = Fully random (exact Free Play pool) or chosen plays (concept chips select whole concepts);
  // Defense = chosen coverages (shuffle bag, only those) or each play's own look. Choices persist in prefs.practice.
  function showPractice() {
    const PR = window.QBPractice, mode = P.prefs.mode || M.getMode(), pool = PR.freePlayPool(mode);
    const modeLbl = ((M.MODES || []).find((m) => m.id === mode) || { label: mode }).label;
    let cfg = PR.normalize(P.prefs.practice), preview = false;
    const names = [...new Set(pool.map(PR.concept))], fams = PR.families();
    const persist = () => { P.prefs.practice = cfg; save(); };
    const covName = (k) => (D.COVERAGES[k] || {}).name || k;
    const tog = (arr, id, on) => (on ? [...new Set(arr.concat(id))] : arr.filter((x) => x !== id));
    const opt = (attr, id, on, title, sub) => `<button class="pi-opt${on ? ' on' : ''}" ${attr}="${esc(id)}" aria-pressed="${on}"><i class="pi-box">${on ? '✓' : ''}</i><span><b>${esc(title)}</b>${sub ? `<em>${esc(sub)}</em>` : ''}</span></button>`;
    const render = () => {
      const sc = ($('pi-sheet') || {}).scrollTop || 0, v = PR.validate(mode, cfg), sel = new Set(cfg.plays), csel = new Set(cfg.covs);
      const nIn = pool.filter((p) => sel.has(p.id)).length;
      const conceptChip = (n) => { const ps = pool.filter((p) => PR.concept(p) === n), k = ps.filter((p) => sel.has(p.id)).length; return `<button class="pi-chip pi-tap${k === ps.length ? ' on' : k ? ' part' : ''}" data-cs="${esc(n)}" aria-pressed="${k === ps.length}">${esc(n)} <small>${k}/${ps.length}</small></button>`; };
      const multi = names.filter((n) => pool.filter((p) => PR.concept(p) === n).length > 1), types = new Set(pool.map((p) => (p.type === 'run' ? 'run' : 'pass')));
      const row = (p) => opt('data-play', p.id, sel.has(p.id), p.name, `${(D.FORMATIONS[p.formation] || {}).name || p.formation} · ${p.type === 'run' ? 'run' : 'pass'} · drawn vs ${covName(p.coverage)}${p.pressure && p.pressure !== 'NONE' ? ' + ' + ((D.BLITZES[p.pressure] || {}).label || p.pressure) : ''}`);
      const off = cfg.offense === 'random' ? `<p class="pi-small">Every rep is drawn from the full ${esc(modeLbl)} playbook — the same ${pool.length} plays as Free Play, shuffled so each comes up before any repeats.</p>`
        : `<div class="pi-bar"><button class="pi-chip pi-tap" id="pi-pr-pall">Select all</button><button class="pi-chip pi-tap" id="pi-pr-pnone">Select none</button>${types.size > 1 ? '<button class="pi-chip pi-tap" data-ty="pass">+ All passes</button><button class="pi-chip pi-tap" data-ty="run">+ All runs</button>' : ''}<span class="pi-small"><b>${nIn}</b> of ${pool.length} plays</span></div>
        ${multi.length ? `<div class="pi-lbl">Concept sets <span class="pi-small" style="text-transform:none;letter-spacing:0">— tap to add/remove every version of a concept</span></div><div class="pi-row pi-cs" id="pi-pr-cs">${multi.map(conceptChip).join('')}</div>` : ''}
        <div class="pi-lbl">Plays</div><div class="pi-optlist" id="pi-pr-pl">${names.map((n) => { const ps = pool.filter((p) => PR.concept(p) === n); return (ps.length > 1 ? `<div class="pi-grp">${esc(n)} · ${ps.length} versions</div>` : '') + ps.map(row).join(''); }).join('')}</div>`;
      const def = cfg.defense === 'own' ? `<p class="pi-small">Each play keeps the look it was drawn against (Free Play behaviour), including its pressure.</p>`
        : `<div class="pi-bar"><button class="pi-chip pi-tap" id="pi-pr-call">Select all</button><button class="pi-chip pi-tap" id="pi-pr-cnone">Select none</button><span class="pi-small"><b>${cfg.covs.length}</b> of ${PR.allCovs().length} coverages</span></div>
        <div class="pi-optlist" id="pi-pr-cl">${fams.map((f) => `<button class="pi-grp pi-grpbtn" data-fam="${f.id}">${esc(f.label)} <small>${f.covs.filter((k) => csel.has(k)).length}/${f.covs.length} · tap to toggle all</small></button>` + f.covs.map((k) => opt('data-cov', k, csel.has(k), covName(k), '')).join('')).join('')}</div>
        <p class="pi-small">Reps shuffle through only these coverages — each one shows up before any repeats. A play's blitz is kept only when it fits the look (an all-out zero blitz only with Cover 0); protection settings are unchanged.</p>`;
      let prev = '';
      if (preview && v.ok) { const s0 = PR.withLook(v.plays[0], v.covs ? v.covs[0] : null); prev = diagram(simFor(s0, null, s0.pressure, 3), { routes: true }) + `<p class="pi-small">${esc(s0.name)} vs ${esc(covName(s0.coverage))} — sample of the first selection</p>`; }
      sheet('PRACTICE', `<div class="pi-small">Build your rep list: choose the plays and the coverages you want to see. Reps shuffle among only what you select. Practice reps are unrated.</div>
      <div class="pi-card pi-prac"><div class="pi-lbl">Offense · ${esc(modeLbl)} playbook</div>
        <div class="pi-seg" id="pi-pr-om"><button class="pi-chip pi-tap${cfg.offense === 'random' ? ' on' : ''}" data-om="random">🎲 Fully random</button><button class="pi-chip pi-tap${cfg.offense === 'pick' ? ' on' : ''}" data-om="pick">☑ Choose plays</button></div>${off}</div>
      <div class="pi-card pi-prac"><div class="pi-lbl">Defense</div>
        <div class="pi-seg" id="pi-pr-dm"><button class="pi-chip pi-tap${cfg.defense === 'pick' ? ' on' : ''}" data-dm="pick">☑ Choose coverages</button><button class="pi-chip pi-tap${cfg.defense === 'own' ? ' on' : ''}" data-dm="own">Each play's own look</button></div>${def}</div>
      <div class="pi-card pi-prac"><div class="pi-lbl">Level</div><div class="pi-row">${LEVELS.map((l) => `<button class="pi-chip pi-tap${P.level === l.id ? ' on' : ''}" data-lv="${l.id}" ${P.unlocked.includes(l.id) ? '' : 'disabled'}>${l.label}</button>`).join('')}</div>
        <details id="pi-pr-prev"${preview ? ' open' : ''}><summary class="pi-small">Preview a sample rep</summary>${prev}</details></div>
      <div class="pi-gobar"><div id="pi-pr-err" class="${v.ok ? 'pi-small' : 'pi-bad'}" role="status">${v.ok ? esc(PR.label(mode, cfg)) : v.errors.map(esc).join('<br>')}</div><button class="pi-play" id="pi-pr-go" ${v.ok ? '' : 'disabled'}>▶ REP IT</button></div>`);
      const s = $('pi-sheet'); if (s) s.scrollTop = sc;
      const up = (f) => () => { f(); persist(); render(); }, q = (x) => document.querySelectorAll('#pi-sheet ' + x);
      q('[data-om]').forEach((b) => (b.onclick = up(() => (cfg.offense = b.dataset.om))));
      q('[data-dm]').forEach((b) => (b.onclick = up(() => (cfg.defense = b.dataset.dm))));
      q('[data-play]').forEach((b) => (b.onclick = up(() => (cfg.plays = tog(cfg.plays, b.dataset.play, !sel.has(b.dataset.play))))));
      q('[data-cs]').forEach((b) => (b.onclick = up(() => { const ids = pool.filter((p) => PR.concept(p) === b.dataset.cs).map((p) => p.id), all = ids.every((id) => sel.has(id)); cfg.plays = all ? cfg.plays.filter((x) => !ids.includes(x)) : [...new Set(cfg.plays.concat(ids))]; })));
      q('[data-ty]').forEach((b) => (b.onclick = up(() => (cfg.plays = [...new Set(cfg.plays.concat(pool.filter((p) => (p.type === 'run' ? 'run' : 'pass') === b.dataset.ty).map((p) => p.id)))]))));
      q('[data-cov]').forEach((b) => (b.onclick = up(() => (cfg.covs = tog(cfg.covs, b.dataset.cov, !csel.has(b.dataset.cov))))));
      q('[data-fam]').forEach((b) => (b.onclick = up(() => { const ks = fams.find((f) => f.id === b.dataset.fam).covs, all = ks.every((k) => csel.has(k)); cfg.covs = all ? cfg.covs.filter((k) => !ks.includes(k)) : [...new Set(cfg.covs.concat(ks))]; })));
      const bt = (id, f) => { const b = $(id); if (b) b.onclick = up(f); };
      bt('pi-pr-pall', () => (cfg.plays = [...new Set(cfg.plays.concat(pool.map((p) => p.id)))]));
      bt('pi-pr-pnone', () => (cfg.plays = cfg.plays.filter((id) => !pool.some((p) => p.id === id))));
      bt('pi-pr-call', () => (cfg.covs = PR.allCovs()));
      bt('pi-pr-cnone', () => (cfg.covs = []));
      q('[data-lv]').forEach((b) => (b.onclick = () => { P.level = b.dataset.lv; save(); render(); }));
      $('pi-pr-prev').ontoggle = (e) => { if (e.target.open !== preview) { preview = e.target.open; render(); } };
      $('pi-pr-go').onclick = () => { if (PR.validate(mode, cfg).ok) startSession({ practice: { cfg: PR.normalize(cfg), concept: PR.label(mode, cfg) } }); };
    };
    render();
  }

  // ---------- Film Room ----------
  const passBase = () => D.PLAYS.find((p) => p.id === 'smash_c2') || D.PLAYS[0];
  function covQuestion(r, covKey) {
    const keys = Object.keys(D.COVERAGES), k = covKey || pick(keys, r), c = D.COVERAGES[k];
    const fams = D.COVERAGE_OPTIONS.map((o) => o.id);
    const ans = c.shell === 'C6' ? 'C4' : c.shell;  // Cover 6 is quarters to one side — accept it under Cover 4 in the family quiz
    return { key: k, cov: c, sim: simFor(passBase(), k, 'NONE', Math.floor(r() * 1e6)), options: D.COVERAGE_OPTIONS.filter((o) => fams.includes(o.id)), answer: ans };
  }
  function filmTabs(cur) { return `<div class="pi-tabs">${[['quiz', 'Coverage quiz'], ['concept', 'Where does the ball go?'], ['daily', 'Daily Coverage'], ['fronts', 'Front quiz'], ['cards', 'Coach cards']].map(([k, l]) => `<button class="pi-chip${k === cur ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`; }
  function bindTabs() { document.querySelectorAll('#pi-sheet [data-tab]').forEach((b) => (b.onclick = () => showFilm(b.dataset.tab))); }
  function showFilm(tab) {
    if (tab === 'quiz') return quizCov(Math.random, null);
    if (tab === 'concept') return quizConcept();
    if (tab === 'daily') return daily();
    if (tab === 'fronts') return quizFront();
    return cards();
  }
  function quizCov(r) {
    const q = covQuestion(r);
    sheet('FILM ROOM', filmTabs('quiz') + `<div class="pi-card"><div class="pi-lbl">Name the coverage family (pre-snap, no disguise)</div><div id="pi-q-diag">${diagram(q.sim)}</div>
    <div class="pi-row" id="pi-q-opts">${q.options.map((o) => `<button class="pi-chip" data-a="${o.id}">${esc(o.label)}</button>`).join('')}</div><div id="pi-q-out" class="pi-small" style="margin-top:8px"></div></div>
    <div class="pi-small">Score: ${P.quiz.right}/${P.quiz.total}</div>`);
    bindTabs();
    document.querySelectorAll('#pi-q-opts [data-a]').forEach((b) => (b.onclick = () => {
      const ok = b.dataset.a === q.answer; P.quiz.total++; if (ok) P.quiz.right++; save(); checkAch(null, []);
      document.querySelectorAll('#pi-q-opts button').forEach((x) => { x.disabled = true; if (x.dataset.a === q.answer) x.classList.add('on'); });
      const v = VAR[q.cov.variant] || {};
      $('pi-q-diag').innerHTML = diagram(q.sim, { reveal: true });
      $('pi-q-out').innerHTML = `<b class="${ok ? 'pi-ok' : 'pi-bad'}">${ok ? 'Correct' : 'Not quite'}</b> — ${esc(q.cov.name)}. <b>Tell:</b> ${esc(v.tell || '')}. <b>Post-snap:</b> ${esc(v.post || '')}. <span class="pi-small">(Blue = deep zones, yellow = underneath zones, red dashes = man)</span> <button class="pi-chip" id="pi-q-next">Next ▶</button>`;
      $('pi-q-next').onclick = () => quizCov(Math.random);
    }));
  }
  function quizConcept() {
    const pool = D.PLAYS.filter((p) => p.type !== 'run' && p.correct), play = pool[Math.floor(Math.random() * pool.length)];
    const sim = simFor(play, play.coverage, 'NONE', 5);
    sheet('FILM ROOM', filmTabs('concept') + `<div class="pi-card"><div class="pi-lbl">${esc(play.name)} vs ${esc(D.COVERAGES[play.coverage].name)} — where does the ball go?</div><div id="pi-c-diag">${diagram(sim, { routes: true, reveal: true })}</div>
    <div class="pi-row" id="pi-c-opts">${(play.progression || []).map((id) => `<button class="pi-chip" data-a="${id}">${id} · ${esc((sim.offense.find((o) => o.id === id) || { route: {} }).route.name || '')}</button>`).join('')}</div><div id="pi-c-out" class="pi-small" style="margin-top:8px"></div></div>`);
    bindTabs();
    document.querySelectorAll('#pi-c-opts [data-a]').forEach((b) => (b.onclick = () => {
      const ok = b.dataset.a === play.correct; P.quiz.total++; if (ok) P.quiz.right++; save(); checkAch(null, []);
      document.querySelectorAll('#pi-c-opts button').forEach((x) => { x.disabled = true; if (x.dataset.a === play.correct) x.classList.add('on'); });
      $('pi-c-diag').innerHTML = diagram(sim, { routes: true, reveal: true, answer: play.correct });
      $('pi-c-out').innerHTML = `<b class="${ok ? 'pi-ok' : 'pi-bad'}">${ok ? 'Correct' : 'The ball goes to ' + play.correct}</b> — ${esc(play.coaching || '')} <button class="pi-chip" id="pi-c-next">Next ▶</button>`;
      $('pi-c-next').onclick = quizConcept;
    }));
  }
  // v10: front-ID quiz — name the front (down linemen, techniques, stand-up edges) from a real engine alignment
  function quizFront() {
    const DF = window.QBDefense; if (!DF) return cards();
    const fr = DF.FRONTS[Math.floor(Math.random() * DF.FRONTS.length)], plays = D.PLAYS.filter((p) => p.type !== 'run'), pl = plays[Math.floor(Math.random() * plays.length)];
    const sim = simFor({ ...pl, pressure: 'NONE' }, 'cover3', 'NONE', 3, fr.id), pe = sim.personnel;
    const opts = shuffled([fr].concat(shuffled(DF.FRONTS.filter((x) => x.id !== fr.id), Math.random).slice(0, 3)), Math.random);
    sheet('FILM ROOM', filmTabs('fronts') + `<div class="pi-card"><div class="pi-lbl">Name the front (squares = hands in the dirt, letters = stand-up)</div><div id="pi-f-diag">${diagram(sim, { front: true, yTop: 12 })}</div>
    <div class="pi-row" id="pi-f-opts">${opts.map((o) => `<button class="pi-chip" data-a="${o.id}">${esc(o.name)}</button>`).join('')}</div><div id="pi-f-out" class="pi-small" style="margin-top:8px"></div></div><div class="pi-small">Score: ${P.quiz.right}/${P.quiz.total}</div>`);
    bindTabs();
    document.querySelectorAll('#pi-f-opts [data-a]').forEach((b) => (b.onclick = () => {
      const ok = b.dataset.a === fr.id; P.quiz.total++; if (ok) P.quiz.right++; save(); checkAch(null, []);
      document.querySelectorAll('#pi-f-opts button').forEach((x) => { x.disabled = true; if (x.dataset.a === fr.id) x.classList.add('on'); });
      $('pi-f-out').innerHTML = `<b class="${ok ? 'pi-ok' : 'pi-bad'}">${ok ? 'Correct' : 'Not quite'}</b> — ${esc(fr.name)} · personnel ${pe.DL}-${pe.LB}-${pe.DB} (${esc(fr.pkg)}). <b>Tell:</b> ${esc(fr.tell)}. <b>Why:</b> ${esc(fr.why)} <button class="pi-chip" id="pi-f-next">Next ▶</button>`;
      $('pi-f-next').onclick = quizFront;
    }));
  }
  function daily() {
    const day = today(), r = rngFrom('pocketiq-daily-' + day), keys = shuffled(Object.keys(D.COVERAGES), r).slice(0, 5);
    const qs = keys.map((k) => covQuestion(r, k)), done = P.daily[day];
    let i = 0, score = 0;
    const step = () => {
      if (done || i >= qs.length) {
        if (!done) { P.daily[day] = { score, at: new Date().toISOString() }; if (!P.days.includes(day)) P.days.push(day); save(); checkAch(null, []); }
        const d = P.daily[day];
        sheet('FILM ROOM', filmTabs('daily') + `<div class="pi-card" style="text-align:center"><div class="pi-lbl">Daily Coverage · ${day}</div>${ring(d.score * 20, 140)}<div><b>${d.score}/5</b> today · ${dayStreak()} day streak 🔥</div><div class="pi-small">Same five looks for everyone on this device today (seeded by date). Come back tomorrow for a new set.</div></div>`);
        return bindTabs();
      }
      const q = qs[i];
      sheet('FILM ROOM', filmTabs('daily') + `<div class="pi-card"><div class="pi-lbl">Daily Coverage · ${day} · look ${i + 1}/5</div><div id="pi-d-diag">${diagram(q.sim)}</div><div class="pi-row" id="pi-d-opts">${q.options.map((o) => `<button class="pi-chip" data-a="${o.id}">${esc(o.label)}</button>`).join('')}</div><div id="pi-d-out" class="pi-small"></div></div>`);
      bindTabs();
      document.querySelectorAll('#pi-d-opts [data-a]').forEach((b) => (b.onclick = () => {
        const ok = b.dataset.a === q.answer; if (ok) score++;
        document.querySelectorAll('#pi-d-opts button').forEach((x) => { x.disabled = true; if (x.dataset.a === q.answer) x.classList.add('on'); });
        $('pi-d-diag').innerHTML = diagram(q.sim, { reveal: true });
        $('pi-d-out').innerHTML = `<b class="${ok ? 'pi-ok' : 'pi-bad'}">${ok ? '✓' : '✗'} ${esc(q.cov.name)}</b> <button class="pi-chip" id="pi-d-next">${i + 1 < 5 ? 'Next ▶' : 'Finish'}</button>`;
        $('pi-d-next').onclick = () => { i++; step(); };
      }));
    };
    step();
  }
  function cards() {
    const cv = Object.entries(D.COVERAGES).map(([k, c]) => { const v = VAR[c.variant] || {}; return `<div class="pi-cc"><h4>${esc(c.name)}</h4>${diagram(simFor(passBase(), k, 'NONE', 9), { reveal: true, yTop: 24 })}<p><b>Pre-snap tell:</b> ${esc(v.tell || '—')}</p><p><b>Post-snap:</b> ${esc(v.post || '—')}</p><p><b>Attack:</b> ${esc(attack(c.shell))}</p></div>`; }).join('');
    const bl = Object.entries(D.BLITZES).map(([k, b]) => `<div class="pi-cc"><h4>${esc(b.name)}</h4><p><b>Tell:</b> ${esc(b.tell || '—')}</p><p><b>Answer:</b> ${esc(b.post || '—')}</p></div>`).join('');
    const DF = window.QBDefense;
    const fc = DF ? DF.FRONTS.map((f) => { const sm = simFor({ ...passBase(), pressure: 'NONE' }, 'cover3', 'NONE', 9, f.id), pe = sm.personnel; return `<div class="pi-cc" data-front="${f.id}"><h4>${esc(f.name)}</h4>${diagram(sm, { front: true, yTop: 12 })}<p><b>Personnel:</b> ${pe.DL}-${pe.LB}-${pe.DB} · ${pe.down} down · ${esc(f.pkg)}</p><p><b>Tell:</b> ${esc(f.tell)}</p><p><b>Why:</b> ${esc(f.why)}</p></div>`; }).join('') : '';
    const pr = Prot.PROTECTIONS.map((p) => `<div class="pi-cc"><h4>${esc(p.label)} — ${esc(p.name)}</h4><p>${esc(p.desc)}</p></div>`).join('');
    sheet('FILM ROOM', filmTabs('cards') + `<div class="pi-lbl">Coverages</div><div class="pi-cardlist" id="pi-cards-cov">${cv}</div><div class="pi-lbl">Pressures &amp; blitzes</div><div class="pi-cardlist" id="pi-cards-bl">${bl}</div><div class="pi-lbl">Fronts &amp; personnel</div><div class="pi-cardlist" id="pi-cards-fr">${fc}</div><div class="pi-lbl">Protections</div><div class="pi-cardlist" id="pi-cards-pr">${pr}</div>`);
    bindTabs();
  }
  function attack(shell) {
    return { C0: 'Ball out hot — quick slants, fades vs. no help; you have one more rusher than blockers.', C1: 'Man beaters: crossers, mesh, rub routes, double moves; find the matchup, the post safety is the only help.',
      C2: 'Hole shots between the squat corner and the half-field safety (smash corner), seams vs. the middle.', C3: 'Four verticals, seams and flood to stretch the three deep defenders; curl-flat vs. the flat defender.',
      C4: 'Underneath and the flats — quarters plays the run and the deep balls; stick, flat-curl, and dig behind the LBs.', C6: 'Quarters to one side, Cover 2 to the other — attack the cloud corner side with the smash hole shot.' }[shell] || '';
  }

  // ---------- boot ----------
  function boot() {
    Q = window.__qb3d; D = Q.D; E = Q.E; M = Q.M; Prot = window.QBProt; VAR = Object.fromEntries((D.VARIANTS || []).map((v) => [v.id, v]));
    const st = el('style', null, css); document.head.appendChild(st);
    const mb = $('menu'); if (mb) { const b = el('button', 'ghost', '⌂ Home'); b.id = 'menu-home'; b.onclick = () => { mb.hidden = true; if (S.active && S.active.reps.length) showSummary(); else { endSession(); showHome(); } }; const row = mb.querySelector('.row'); if (row) row.prepend(b); }
    const params = new URLSearchParams(location.search);
    // automated suites predating v8 drive the sim directly; they get the classic screen unless ?home=1 is passed
    if (params.get('home') === '1' || (!navigator.webdriver && params.get('home') !== '0')) showHome(); else hud();
    Object.assign(window.PocketHub, { showHome, hideHome, startSession, showSummary, showFilm, showPractice, showBoard, showAch, endSession, summarize, traits, diagram, simFor, reload: () => (P = load()) });
  }
  if (window.__qb3d) boot(); else window.addEventListener('pocketiq:ready', boot, { once: true });
})();
