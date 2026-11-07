/**
 * modes.js — Game modes (Passing / Running / Normal), audible trees, play evaluation (EV),
 * protection evaluation, and history schema migration. Pure logic; browser + Node.
 */
(function (root) {
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = root.QBData || req('./data.js'), E = root.QBEngine || req('./engine.js');
  const Prot = root.QBProt || req('./protections.js'), Run = root.QBRun || req('./runplay.js');
  const AEV = () => root.QBAudibleEV || (() => { try { return req('./audible-ev.js'); } catch (e) { return null; } })() || {};
  const MODE_KEY = 'pocketiq3d.mode', HIST_V1 = 'pocketiq3d.history.v1', HIST_V2 = 'pocketiq3d.history.v2';
  const MODES = [
    { id: 'normal', label: 'Normal', desc: 'Full playbook: passes and runs. Audibles can check run ↔ pass.' },
    { id: 'passing', label: 'Passing', desc: 'Pass plays only vs every coverage and blitz. Audibles stay in the passing tree.' },
    { id: 'running', label: 'Running', desc: 'Run plays only: count the box, read the front. Audibles stay in the run tree.' },
  ];
  const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
  const getMode = () => { const m = ls() && ls().getItem(MODE_KEY); return MODES.some((x) => x.id === m) ? m : 'normal'; };
  const setMode = (m) => { if (ls()) ls().setItem(MODE_KEY, m); };
  const typeOk = (mode, type) => mode === 'normal' || (mode === 'passing' ? type !== 'run' : type === 'run');
  const pool = (mode, plays) => (plays || D.PLAYS).filter((p) => typeOk(mode, p.type || 'pass'));

  // ---- audible templates: offence only; the defence stays the original look ----
  const T = {
    SLANTS: { id: 'SLANTS', label: 'Hot slants', type: 'pass', routes: { X: 'slant', H: 'slant', Y: 'slant', Z: 'slant', RB: 'check' }, progression: ['H', 'X', 'Y', 'RB'], coach: 'Quick game: ball out on the third step behind the blitz.' },
    STICK: { id: 'STICK', label: 'Stick / flat', type: 'pass', routes: { X: 'go', H: 'hitch', Y: 'stick', Z: 'go', RB: 'flat' }, progression: ['Y', 'RB', 'H'], coach: '#2 stick at 5–6, RB flat, #1 clears — read the flat defender.' },
    SMASH: { id: 'SMASH', label: 'Smash', type: 'pass', routes: { X: 'hitch', H: 'corner', Y: 'corner', Z: 'hitch', RB: 'check' }, progression: ['H', 'X', 'RB'], coach: 'Hi-lo on the corner: corner route vs a squat corner.' },
    VERTS: { id: 'VERTS', label: 'Four verts', type: 'pass', routes: { X: 'go', H: 'seam', Y: 'seam', Z: 'go', RB: 'check' }, progression: ['H', 'Y', 'X', 'RB'], coach: 'Four verticals stress the deep safeties.' },
    MAXSHOT: { id: 'MAXSHOT', label: 'Max shot', type: 'pass', routes: { X: 'post', H: 'dig', Y: 'block', Z: 'go', RB: 'block' }, progression: ['X', 'H', 'Z'], protection: 'MAX', coach: 'Max protection, two-man shot concept.' },
    SCREEN: { id: 'SCREEN', label: 'RB screen', type: 'pass', routes: { X: 'go', H: 'slant', Y: 'slant', Z: 'go', RB: 'rbScreen' }, progression: ['RB', 'H'], screen: true, screenTo: 'RB', protection: 'MAN', coach: 'Let the blitz in and throw the screen behind it.' },
    IZ: { id: 'IZ', label: 'Inside zone', type: 'run', run: { concept: 'IZ', dir: 'R' } },
    OZ: { id: 'OZ', label: 'Outside zone', type: 'run', run: { concept: 'OZ', dir: 'R' } },
    POWER: { id: 'POWER', label: 'Power', type: 'run', run: { concept: 'POWER', dir: 'R' } },
    COUNTER: { id: 'COUNTER', label: 'Counter', type: 'run', run: { concept: 'COUNTER', dir: 'L' } },
    DRAW: { id: 'DRAW', label: 'Draw', type: 'run', run: { concept: 'DRAW', dir: 'R' } },
    TOSS: { id: 'TOSS', label: 'Toss', type: 'run', run: { concept: 'TOSS', dir: 'R' } },
  };
  const RUN_ROUTES = { X: 'stalk', Z: 'stalk', H: 'stalk', Y: 'block', RB: 'block' };
  /** Build an audible play: template offence + original formation & defence. */
  function makeAudible(orig, tid) {
    const t = T[tid]; const base = { id: orig.id + '>' + tid, name: `${t.label} (audible)`, formation: orig.formation, coverage: orig.coverage, pressure: orig.pressure, togo: orig.togo, audibleOf: orig.id, template: tid };
    if (t.type === 'run') return { ...base, type: 'run', run: { ...t.run, carrier: 'RB' }, routes: { ...RUN_ROUTES, ...(D.FORMATIONS[orig.formation].players.H && orig.formation === 'iform' ? { H: 'lead' } : {}) }, progression: [], coaching: '' };
    return { ...base, type: 'pass', routes: { ...t.routes }, progression: t.progression.slice(), protection: t.protection, screen: t.screen, screenTo: t.screenTo, coaching: t.coach };
  }
  // ---- v10: more audible concepts + matchup tags (what each concept beats / hates) ----
  Object.assign(T, {
    MESH: { id: 'MESH', label: 'Mesh', type: 'pass', routes: { X: 'shallow', H: 'sit', Y: 'shallowHi', Z: 'corner', RB: 'check' }, progression: ['X', 'Y', 'H', 'RB'], coach: 'Two crossing shallows rub man; sit/option in the hole vs zone.' },
    FLOOD: { id: 'FLOOD', label: 'Flood', type: 'pass', routes: { X: 'dig', H: 'check', Y: 'sail', Z: 'go', RB: 'flat' }, progression: ['Y', 'RB', 'Z'], coach: 'Three levels to the boundary: go / sail / flat vs Cover 3.' },
    DAGGER: { id: 'DAGGER', label: 'Dagger', type: 'pass', routes: { X: 'dig', H: 'seam', Y: 'check', Z: 'go', RB: 'check' }, progression: ['H', 'X', 'RB'], coach: 'Seam clears the safety, dig in behind the hook — Cover 4/3 beater.' },
    CURLFLAT: { id: 'CURLFLAT', label: 'Curl-flat', type: 'pass', routes: { X: 'curl', H: 'flat', Y: 'stick', Z: 'go', RB: 'check' }, progression: ['X', 'H', 'RB'], coach: 'Curl / flat stretch on the apex defender — Cover 3 beater.' },
    DRIVE: { id: 'DRIVE', label: 'Drive', type: 'pass', routes: { X: 'dig', H: 'shallow', Y: 'seam', Z: 'go', RB: 'check' }, progression: ['H', 'X', 'Y', 'RB'], coach: 'Shallow + dig high-low the middle hook; shallow runs away from man.' },
    BUBBLE: { id: 'BUBBLE', label: 'Bubble screen', type: 'pass', routes: { X: 'stalk', H: 'bubble', Y: 'block', Z: 'stalk', RB: 'block' }, progression: ['H'], coach: 'Numbers/leverage throw to the slot vs an off, light box apex.' },
    YCROSS: { id: 'YCROSS', label: 'Y-cross', type: 'pass', routes: { X: 'go', H: 'flat', Y: 'cross', Z: 'post', RB: 'check' }, progression: ['Y', 'H', 'RB'], coach: 'Deep crosser behind the hook layer, flat underneath it.' },
  });
  const MAN = ['cover0', 'cover1', 'cover1robber', 'cover2man', 'cover1bear'], ONEHIGH = ['cover1', 'cover1robber', 'cover1bear', 'cover3', 'cover3rot', 'cover3cloud', 'cover3buzz', 'cover3down', 'cover0'];
  const HEAVY = ['ZERO', 'FIRE', 'CB', 'SAF', 'NICK', 'XDOG', 'OVER'];
  const cat = (play) => { const c = play.coverage; return { man: MAN.includes(c), one: ONEHIGH.includes(c), two: !ONEHIGH.includes(c), zero: c === 'cover0' || play.pressure === 'ZERO', heavy: HEAVY.includes(play.pressure), none: play.pressure === 'NONE', light: ['cover2', 'cover4', 'cover2dime', 'tampa2', 'palms', 'cover6', 'under43'].includes(c), c }; };
  /** Heuristic matchup (+ good / − bad) of an audible concept vs the look. Only used to pick a varied, mixed menu;
   *  grading still uses the engine EV of each option (evalPlay). */
  const FIT = {
    SLANTS: (k) => (k.man ? 2 : 0) + (k.heavy ? 2 : 0) - (k.c === 'tampa2' ? 1 : 0),
    STICK: (k) => (k.one && !k.man ? 2 : 0) + (k.heavy ? 1 : 0) - (k.man ? 1 : 0),
    SMASH: (k) => (k.c === 'cover2' || k.c === 'cover2dime' ? 3 : 0) + (k.c === 'cover6' ? 1 : 0) - (k.zero ? 2 : 0) - (k.c === 'cover1' ? 1 : 0),
    VERTS: (k) => (['cover3', 'cover3rot', 'cover1'].includes(k.c) ? 2 : 0) - (k.zero ? 3 : 0) - (k.c === 'cover4' || k.c === 'palms' ? 2 : 0),
    MAXSHOT: (k) => (k.c === 'cover1' || k.c === 'cover1robber' ? 1 : 0) + (k.heavy && !k.zero ? 1 : 0) - (k.light ? 2 : 0) - (k.none ? 1 : 0),
    SCREEN: (k) => (k.heavy ? 3 : 0) - (k.none ? 2 : 0),
    MESH: (k) => (k.man ? 3 : 0) + (k.zero ? 1 : 0) - (k.c === 'tampa2' ? 2 : 0),
    FLOOD: (k) => (k.c.startsWith('cover3') ? 3 : 0) - (k.man ? 1 : 0) - (k.zero ? 2 : 0),
    DAGGER: (k) => (['cover4', 'palms', 'cover6', 'cover3'].includes(k.c) ? 2 : 0) - (k.zero ? 3 : 0) - (k.c === 'tampa2' ? 1 : 0),
    CURLFLAT: (k) => (k.c.startsWith('cover3') ? 2 : 0) - (k.man ? 2 : 0),
    DRIVE: (k) => (k.man ? 2 : 0) + (k.c === 'cover2' ? 1 : 0) - (k.zero ? 1 : 0),
    BUBBLE: (k) => (k.light ? 2 : 0) + (k.two ? 1 : 0) - (k.c === 'cover2man' || k.c === 'cover0' ? 2 : 0),
    YCROSS: (k) => (k.c === 'cover1' || k.c === 'cover3' ? 2 : 0) - (k.zero ? 3 : 0) - (k.c === 'tampa2' ? 2 : 0),
    IZ: (k) => (k.light ? 2 : 0) + (k.two ? 1 : 0) - (k.c === 'cover1bear' || k.zero ? 3 : 0) - (k.c === 'cover3down' ? 1 : 0),
    OZ: (k) => (k.light ? 2 : 0) - (k.c === 'cover1bear' ? 2 : 0) - (k.zero ? 2 : 0),
    POWER: (k) => (k.two ? 1 : 0) + (k.c === 'cover2dime' ? 2 : 0) - (k.zero ? 3 : 0),
    COUNTER: (k) => (k.heavy && !k.zero ? 1 : 0) + (k.light ? 1 : 0) - (k.zero ? 2 : 0),
    DRAW: (k) => (k.c === 'cover2dime' || k.c === 'tampa2' ? 2 : 0) + (k.none ? 1 : 0) - (k.zero ? 3 : 0) - (k.heavy ? 1 : 0),
    TOSS: (k) => (k.c === 'cover2dime' || k.c === 'under43' ? 1 : 0) + (k.heavy ? 1 : 0) - (k.c === 'cover1bear' ? 2 : 0),
  };
  const DESC = {
    SLANTS: 'All-slant quick game, ball out in 1.5 s', STICK: 'Stick + flat on the curl/flat defender', SMASH: 'Hitch under, corner over the squat corner',
    VERTS: 'Four vertical stems stress the safeties', MAXSHOT: 'Max protect, post + go shot', SCREEN: 'Let rushers in, screen to the back',
    MESH: 'Crossing shallows rub man coverage', FLOOD: 'Go / sail / flat three-level stretch', DAGGER: 'Seam clear-out with a dig behind',
    CURLFLAT: 'Curls + flat on the apex defender', DRIVE: 'Shallow under, dig over the hook', BUBBLE: 'Slot bubble, stalk blocks outside',
    YCROSS: 'Deep crosser + flat, post clears', IZ: 'Inside zone, read the backside end', OZ: 'Outside zone, stretch the edge',
    POWER: 'Gap scheme, pulling guard leads', COUNTER: 'Counter-step, kick + wrap pullers', DRAW: 'Sell pass, run behind the rush', TOSS: 'Pitch outside to the perimeter',
  };
  Object.keys(T).forEach((k) => { T[k].desc = DESC[k] || ''; });
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /** v10: dynamic per-rep audible menu (4-5 options + Keep in the UI): one strong fit, 1-2 poor fits, the rest marginal,
   *  drawn from the concept library suited to the mode, never repeating the previous rep's menu when avoidable.
   *  Deterministic for (play, mode, rep, avoid) so the worker/grader see the same list. Called with no rep → v9-style stable menu. */
  function audibleTree(play, mode, rep, avoid) {
    const isRun = play.type === 'run', c = play.run && play.run.concept;
    const passIds = ['SLANTS', 'STICK', 'SMASH', 'VERTS', 'MAXSHOT', 'SCREEN', 'MESH', 'FLOOD', 'DAGGER', 'CURLFLAT', 'DRIVE', 'BUBBLE', 'YCROSS'];
    const runIds = ['IZ', 'OZ', 'POWER', 'COUNTER', 'DRAW', 'TOSS'];
    let cand = mode === 'running' ? runIds : mode === 'passing' ? passIds : passIds.concat(runIds);
    cand = cand.filter((id) => id !== c && !(play.template && id === play.template) && !(T[id].routes && play.routes && JSON.stringify(T[id].routes) === JSON.stringify(play.routes)));
    const k = cat(play), rnd = prng(hashStr(`${play.id}|${mode}|${rep == null ? 'v9' : rep}`));
    const ev = AEV()[play.audibleOf || play.id]; // baked engine EV (tests/bake-audibles.cjs) when available, else heuristic
    const sc = cand.map((id) => ({ id, fit: (ev && ev[id] != null ? (ev[id] - ev.orig) * 1.6 : (FIT[id] ? FIT[id](k) : 0)) + rnd() * 0.9 })).sort((a, b) => b.fit - a.fit);
    const av = new Set(avoid || []);
    const fresh = (arr) => { const f = arr.filter((x) => !av.has(x.id)); return f.length ? f : arr; };
    const n = mode === 'running' ? 4 : 5, out = [];
    const take = (x) => { if (x && !out.some((o) => o.id === x.id)) out.push(x); };
    take(fresh(sc.slice(0, 3))[0]); // one good fit
    const nBad = mode === 'running' ? 1 : 1 + (rnd() < 0.5 ? 1 : 0);
    const bad = fresh(sc.slice(-4).reverse()); for (let i = 0; i < nBad; i++) take(bad[i]); // 1-2 bad fits
    const mid = fresh(sc.slice(1, -1)).filter((x) => !out.includes(x)); while (out.length < n && mid.length) take(mid.splice(Math.floor(rnd() * mid.length), 1)[0]);
    for (const x of sc) { if (out.length >= n) break; take(x); }
    // mode mix in Normal: make sure there is at least one run and one pass option
    if (mode === 'normal' && !out.some((o) => T[o.id].type === 'run')) out[out.length - 1] = sc.find((x) => T[x.id].type === 'run') || out[out.length - 1];
    if (mode === 'normal' && !out.some((o) => T[o.id].type === 'pass')) out[out.length - 1] = sc.find((x) => T[x.id].type === 'pass') || out[out.length - 1];
    // shuffle display order so the good one is not always first
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out.map((x) => ({ id: x.id, label: T[x.id].label, type: T[x.id].type, desc: T[x.id].desc, fit: +x.fit.toFixed(2) }));
  }
  /** Expected value of a play vs its defence (yards-ish units, comparable across pass / run). */
  function evalPlay(play, opts) {
    if (play.type === 'run') {
      const sim = E.createSim(play, () => 0.5, opts); const ex = Run.expected(sim);
      return { ev: +ex.ev.toFixed(2), score: +ex.ev.toFixed(2), type: 'run', note: ex.note + (ex.fitNote ? ' — ' + ex.fitNote : '') };
    }
    const prot = play.protection || (opts && opts.protection);
    const best = bestProtection(play, opts).best;
    const o = Object.assign({}, opts, { protection: (opts && opts.protection) || prot || best });
    const b = E.bestRead(play, o);
    const pk = b.pick;
    // pass EV is a window-weighted throw value; 0.3x puts it on the same 'expected yards' scale as runs
    return { ev: pk ? +pk.ev.toFixed(2) : -2, score: pk ? +(pk.ev * 0.3).toFixed(2) : -2, type: 'pass', note: pk ? `best throw ${pk.id} at ${pk.t}s (${pk.sep} yd window), pocket ${b.sackTime.toFixed(1)}s` : `nothing opens before the rush (pocket ${b.sackTime.toFixed(1)}s)`, pick: pk };
  }

  /** Rate each protection vs this look; the top tier is the right call. */
  function protectionTable(play, opts) {
    if (play.type === 'run') return [];
    return Prot.PROTECTIONS.map((P) => {
      const sim = E.createSim(play, () => 0.5, Object.assign({}, opts, { protection: P.id }));
      const pr = sim.prot;
      const freeEarly = pr.free.filter((r) => r.arrive < 2.8);
      const released = sim.offense.filter((p) => p.read >= 0).length;
      const hotOk = P.hot && sim.offense.some((p) => p.hotAdjust);
      let value = freeEarly.length === 0 ? 10 + released + Math.min(pr.sackTime, 4.2) * 0.5 : hotOk ? 7 + released * 0.5 : pr.sackTime;
      return { id: P.id, label: P.label, value: +value.toFixed(2), sackTime: +pr.sackTime.toFixed(2), free: pr.free.map((r) => r.rusher), freeEarly: freeEarly.map((r) => ({ id: r.rusher, kind: r.kind, move: r.move, at: +r.arrive.toFixed(2) })), released, hotOk, kept: pr.kept };
    }).sort((a, b) => b.value - a.value);
  }
  function bestProtection(play, opts) { const t = protectionTable(play, opts); return { best: t[0].id, table: t }; }

  /** History v1 -> v2 migration (v1 kept untouched). */
  function loadHistory() {
    const L = ls(); if (!L) return [];
    try {
      const v2 = JSON.parse(L.getItem(HIST_V2) || 'null');
      if (Array.isArray(v2)) return v2;
      const v1 = JSON.parse(L.getItem(HIST_V1) || '[]') || [];
      const mig = v1.map((r) => ({ ...r, v: 2, mode: 'passing', type: 'pass' }));
      L.setItem(HIST_V2, JSON.stringify(mig));
      return mig;
    } catch (e) { return []; }
  }
  const saveHistory = (h) => { const L = ls(); if (L) L.setItem(HIST_V2, JSON.stringify(h.slice(-800))); };
  const migrate = (v1) => v1.map((r) => ({ ...r, v: 2, mode: 'passing', type: 'pass' }));

  /** v10: audible evals for (base, menu) — baked table for authored plays (instant), engine EV otherwise. */
  function audibleEvals(base, menu, opts) {
    const ev = AEV()[base.id], o = Object.assign({}, opts); delete o.protection;
    const pack = (p, label, aid) => { if (ev && ev[aid || 'orig'] != null) return { id: aid, label, score: ev[aid || 'orig'], note: aid ? (T[aid].coach || T[aid].desc) + ' (' + T[aid].desc + ')' : (base.coaching || '').split('.')[0], run: p.run && p.run.concept, baked: true };
      const r = evalPlay(p, o); return { id: aid, label, score: r.score, note: r.note, run: p.run && p.run.concept }; };
    return { orig: pack(base, base.name, null), alts: menu.map((a) => pack(makeAudible(base, a.id), a.label, a.id)) };
  }
  const api = { audibleEvals, MODES, MODE_KEY, HIST_V2, getMode, setMode, typeOk, pool, TEMPLATES: T, makeAudible, audibleTree, evalPlay, protectionTable, bestProtection, loadHistory, saveHistory, migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBModes = api;
})(typeof window !== 'undefined' ? window : globalThis);
