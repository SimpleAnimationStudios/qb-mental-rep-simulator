/**
 * protections.js — Pass protection + pass rush model (pure, no DOM; browser + Node).
 *
 * Every rusher is matched to a blocker (or left free) according to the protection call:
 *  - zone/slide schemes assign GAPS (they pass off stunts and pick up droppers' replacements),
 *  - man/BOB schemes assign MEN by pre-snap alignment (a dropper wastes a blocker, stunts pick them),
 *  - backs/TEs can stay in (check, block, chip) and their coverage defender may "green-dog".
 * Each blocked matchup gets a rush move and a win time; free rushers get home on distance.
 * The earliest arrival is the sack clock — so blitz = less time, right protection = more.
 */
(function (root) {
  const D = root.QBData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const BX = D.FIELD.ballX;
  const GAPS = ['LD', 'LC', 'LB', 'LA', 'RA', 'RB', 'RC', 'RD'];
  const GX = [-9, -6.3, -3.75, -1.25, 1.25, 3.75, 6.3, 9];
  const gapX = (g) => BX + GX[Math.max(0, GAPS.indexOf(g))];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lerp = (a, b, f) => a + (b - a) * f;
  function gapOf(x, id) {
    const dx = x - BX, a = Math.abs(dx);
    const s = dx < -0.05 ? 'L' : dx > 0.05 ? 'R' : (/1$/.test(id || '') ? 'L' : 'R');
    return s + (a < 2.5 ? 'A' : a < 5 ? 'B' : a < 7.5 ? 'C' : 'D');
  }
  const OL_POS = ['LT', 'LG', 'C', 'RG', 'RT'];
  const OL_REACH = { LT: ['LD', 'LC', 'LB'], LG: ['LC', 'LB', 'LA'], C: ['LB', 'LA', 'RA', 'RB'], RG: ['RA', 'RB', 'RC'], RT: ['RB', 'RC', 'RD'] };
  const isDL = (d) => (d.role ? d.role === 'DL' && d.down !== false : /^(DE|DT|NT)/.test(d.id)); // v10: stand-up edges count as linebackers for BOB / checks

  /** Protection calls. `ol`: gap lists per OL (zone), 'dl' (man on down linemen), 'inside' (man on the 5 most inside threats). */
  const PROTECTIONS = [
    { id: 'BOB', label: 'BOB', name: 'Big-on-Big (6-man, RB checks LBs)', scheme: 'man', ol: 'dl', rb: { mode: 'check', gaps: 'lb' },
      desc: 'OL block the down linemen man-to-man, the uncovered lineman and the back take linebackers. Solid vs 5-6 man rushes, weak vs stunts and zone pressure.' },
    { id: 'SLIDE_L', label: 'Slide L', name: 'Slide Left (RB right)', scheme: 'zone', ol: { LT: ['LD', 'LC'], LG: ['LC', 'LB'], C: ['LB', 'LA'], RG: ['LA', 'RA'], RT: ['RA', 'RB'] }, slide: -1, rb: { mode: 'check', gaps: ['RA', 'RB', 'RC', 'RD'], side: 'R' },
      desc: 'The whole line zones the gaps to its left; the back has the right edge. Handles stunts and pressure from the left.' },
    { id: 'SLIDE_R', label: 'Slide R', name: 'Slide Right (RB left)', scheme: 'zone', ol: { LT: ['LB', 'LA'], LG: ['LA', 'RA'], C: ['RA', 'RB'], RG: ['RB', 'RC'], RT: ['RC', 'RD'] }, slide: 1, rb: { mode: 'check', gaps: ['LA', 'LB', 'LC', 'LD'], side: 'L' },
      desc: 'Mirror of slide left: the line zones right, the back has the left edge.' },
    { id: 'HALF_L', label: 'Half+RB', name: 'Half-slide Left + RB', scheme: 'half', ol: { C: ['LB', 'LA'], LG: ['LC', 'LB'], LT: ['LD', 'LC'], RG: 'dl', RT: 'dl' }, slide: -1, rb: { mode: 'check', gaps: ['LD', 'LC', 'LB'], side: 'L' },
      desc: 'Centre, left guard and left tackle slide left, the right side blocks man; the back aligns left for the edge. Answer to a left overload.' },
    { id: 'MAN', label: 'Man', name: 'Man / Turn (5-man, back free)', scheme: 'man', ol: 'inside', rb: { mode: 'release' },
      desc: 'Five linemen take the five most dangerous rushers inside-out; the back releases immediately. Max receivers, but a 6th rusher is free.' },
    { id: 'SIX', label: '6-man', name: '6-man (RB stays in)', scheme: 'man', ol: 'dl', rb: { mode: 'block', gaps: 'any' },
      desc: 'BOB with the back staying in no matter what. One fewer receiver; his coverage defender may green-dog.' },
    { id: 'MAX', label: 'Max', name: 'Max Protect (RB + TE stay in)', scheme: 'man', ol: 'dl', rb: { mode: 'block', gaps: 'any', side: 'L' }, te: { id: 'Y', mode: 'block', spot: [33.9, -1] },
      desc: '7-man protection: the TE (Y) moves in-line and the back stays in. Only 3 receivers out — use it vs overloaded pressure with a 2-3 man concept.' },
    { id: 'HOT', label: 'Hot', name: 'Hot / Sight adjust (5-man)', scheme: 'man', ol: 'dl', rb: { mode: 'release', quick: true }, hot: true,
      desc: '5-man protection: the back releases right away and the slots convert to hot routes vs an unblocked rusher. Ball out before he gets there.' },
    { id: 'CHIP', label: 'Chip', name: 'Chip & release (RB chips the edge)', scheme: 'man', ol: 'dl', rb: { mode: 'chip' },
      desc: 'BOB, but the back chips the best edge rusher (+time for the tackle) and then releases late into his route.' },
  ];
  const PROT = Object.fromEntries(PROTECTIONS.map((p) => [p.id, p]));

  // mulberry32 seeded PRNG so probes / replays reproduce the same rush.
  function seeded(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const speedOf = (d) => (isDL(d) ? 6.3 : /^(CB|S|NB|DB)/.test(d.id) ? 7.2 : 6.8);

  /**
   * Compute matchups for a pass play. Mutates sim: sim.prot, d.rush (rusher plans), blocker plans.
   * Call after offense (incl. protection alignment flips) and defense are built.
   */
  function assign(sim, protId) {
    const P = PROT[protId] || PROT.BOB;
    const rnd = seeded(sim.opts.seed || 7);
    const qbEnd = sim.qbAt(9);
    const defs = sim.defense;
    let rushers = defs.filter((d) => d.job.type === 'rush' || d.job.type === 'blitz');
    rushers.forEach((d) => { d.gap = d.job.gap || gapOf(d.sx, d.id); });
    const rows = new Map(); // rusher id -> row
    const blocked = (r) => rows.has(r.id);
    const ol = sim.ol.map((o, i) => ({ id: o.id, pos: OL_POS[i], x: o.sx, y: o.sy, ref: o, scheme: P.scheme === 'half' ? (Array.isArray(P.ol[OL_POS[i]]) ? 'zone' : 'man') : P.scheme, has: null, late: false }));
    const nearest = (cands, x) => cands.slice().sort((a, b) => Math.abs(a.sx - x) - Math.abs(b.sx - x))[0];
    const take = (b, r, kind) => { b.has = r; const ex = rows.get(r.id); if (ex) { ex.double = true; ex.helpers.push(b.id); return; } rows.set(r.id, { rusher: r.id, blocker: b.id, blockerKind: b.kind || 'OL', scheme: b.scheme, kind: kind || 'blocked', helpers: [] }); };
    const order = ['C', 'LG', 'RG', 'LT', 'RT'];
    const byPos = (p) => ol.find((o) => o.pos === p);
    const inGaps = (r, gaps) => gaps.indexOf(r.gap) >= 0;
    // --- OL ---
    const zonePass = (keys) => {
      // slide: work from the slide-side end, each lineman takes the outermost rusher in his two gaps
      const ks = keys.slice().sort((a, b) => (OL_POS.indexOf(a) - OL_POS.indexOf(b)) * -(P.slide || -1));
      ks.forEach((k) => { const b = byPos(k), gaps = P.ol[k]; const c = rushers.filter((r) => !blocked(r) && inGaps(r, gaps)).sort((a, z) => (a.sx - z.sx) * -(P.slide || -1)); if (c.length) take(b, c[0]); });
    };
    const zoneHelp = (keys) => { // uncovered zone blockers work to the adjacent gap
      keys.forEach((k) => { const b = byPos(k); if (b.has) return; const c = rushers.filter((r) => !blocked(r) && inGaps(r, OL_REACH[k])); if (c.length) take(b, nearest(c, b.x)); });
    };
    const manDL = (keys) => {
      const dls = defs.filter(isDL).filter((d) => !Object.values(rows).length || true).sort((a, b) => Math.abs(a.sx - BX) - Math.abs(b.sx - BX));
      dls.forEach((d) => {
        if (rows.has(d.id) || ol.some((o) => o.has === d)) return;
        const g = d.job.gap || gapOf(d.sx, d.id);
        const c = keys.map(byPos).filter((b) => !b.has && OL_REACH[b.pos].indexOf(gapOf(d.sx, d.id)) >= 0);
        if (!c.length) return;
        const b = c.sort((a, z) => Math.abs(a.x - d.sx) - Math.abs(z.x - d.sx))[0];
        if (d.job.type === 'rush' || d.job.type === 'blitz') take(b, d); else { b.has = d; b.wasted = true; } // dropper: blocker wasted
        void g;
      });
      // uncovered man blockers take the first linebacker/DB rusher in reach
      keys.map(byPos).filter((b) => !b.has).forEach((b) => { const c = rushers.filter((r) => !blocked(r) && inGaps(r, OL_REACH[b.pos])); if (c.length) take(b, nearest(c, b.x)); });
      // blockers whose man dropped look for work late
      keys.map(byPos).filter((b) => b.wasted).forEach((b) => { const c = rushers.filter((r) => !blocked(r) && inGaps(r, OL_REACH[b.pos])); if (c.length) { take(b, nearest(c, b.x), 'late'); b.late = true; } });
    };
    const manInside = () => {
      const threats = defs.filter((d) => isDL(d) || d.job.type === 'rush' || d.job.type === 'blitz' || (d.sy < 3 && Math.abs(d.sx - BX) < 10)).sort((a, b) => Math.abs(a.sx - BX) - Math.abs(b.sx - BX));
      threats.forEach((d) => {
        const c = ol.filter((b) => !b.has && OL_REACH[b.pos].indexOf(d.job.gap || gapOf(d.sx, d.id)) >= 0);
        if (!c.length) return;
        const b = c.sort((a, z) => Math.abs(a.x - d.sx) - Math.abs(z.x - d.sx))[0];
        if (d.job.type === 'rush' || d.job.type === 'blitz') take(b, d); else { b.has = d; b.wasted = true; }
      });
      ol.filter((b) => b.wasted).forEach((b) => { const c = rushers.filter((r) => !blocked(r) && inGaps(r, OL_REACH[b.pos])); if (c.length) { take(b, nearest(c, b.x), 'late'); b.late = true; } });
    };
    if (P.ol === 'dl') manDL(OL_POS);
    else if (P.ol === 'inside') manInside();
    else if (P.scheme === 'half') { const zk = order.filter((k) => Array.isArray(P.ol[k])); zonePass(zk); manDL(order.filter((k) => !Array.isArray(P.ol[k]))); zoneHelp(zk); }
    else { zonePass(order); zoneHelp(order); }

    // --- backs / TE ---
    const backs = [];
    const rb = sim.offense.find((p) => p.id === 'RB');
    const kept = [];
    const backPlan = (pl, spec) => {
      if (!pl || !spec || spec.mode === 'release' || (pl.route && pl.route.block === false)) return;
      if (sim.play.screen && pl.id === sim.play.screenTo) return; // screen target never stays in
      const b = { id: pl.id, kind: pl.id === 'RB' ? 'RB' : 'TE', x: pl.x, y: pl.y, scheme: 'man', ref: pl };
      let c = rushers.filter((r) => !blocked(r));
      if (spec.gaps === 'lb') c = c.filter((r) => !isDL(r)); else if (Array.isArray(spec.gaps)) c = c.filter((r) => inGaps(r, spec.gaps));
      // most dangerous first: earliest free arrival
      c.sort((a, z) => freeArrive(a) - freeArrive(z));
      if (spec.mode === 'chip') {
        if (c.length) { const r = c[0]; take(b, r, Math.abs(gapX(r.gap) - b.x) > 7 ? 'late' : 'blocked'); kept.push(pl.id); backs.push({ pl, mode: 'block', r }); return; }
        // chip the widest edge rusher on his side, then release
        const side = pl.x >= BX ? 'R' : 'L';
        const edge = rushers.filter((r) => blocked(r) && r.gap[0] === side && /[CD]/.test(r.gap[1])).sort((a, z) => Math.abs(z.sx - BX) - Math.abs(a.sx - BX))[0]
          || rushers.filter((r) => blocked(r) && /[CD]/.test(r.gap[1]))[0];
        if (edge) { rows.get(edge.id).chip = true; backs.push({ pl, mode: 'chip', r: edge }); }
        return;
      }
      if (c.length) { const r = c[0]; take(b, r, Math.abs(gapX(r.gap) - b.x) > 7 ? 'late' : 'blocked'); kept.push(pl.id); backs.push({ pl, mode: 'block', r }); return; }
      if (spec.mode === 'block') { // nobody came: double the most dangerous blocked rusher
        const r = rushers.filter(blocked).sort((a, z) => freeArrive(a) - freeArrive(z))[0];
        if (r) { rows.get(r.id).double = true; rows.get(r.id).helpers.push(pl.id); backs.push({ pl, mode: 'help', r }); } else backs.push({ pl, mode: 'help', r: null });
        kept.push(pl.id); return;
      }
      backs.push({ pl, mode: 'checkRelease' }); // check, nobody came -> release late
    };
    function freeArrive(r) {
      const g = { x: gapX(r.gap), y: 0.3 };
      return (r.job.delay || 0) + 0.15 + (dist({ x: r.sx, y: r.sy }, g) + dist(g, qbEnd)) / speedOf(r);
    }
    backPlan(rb, P.rb);
    if (P.te) backPlan(sim.offense.find((p) => p.id === P.te.id), P.te);

    // --- green dog: a box defender in man on a back/TE that stays in becomes a rusher ---
    defs.forEach((d) => {
      if (d.job.type !== 'man' || kept.indexOf(refId(sim, d.job.ref)) < 0) return;
      if (!backs.some((bk) => bk.pl.id === refId(sim, d.job.ref) && bk.mode === 'help')) return; // back is busy blocking a blitzer: his man plays the hole
      if (Math.abs(d.sx - BX) > 9.5 || d.sy > 8) return;
      d.job = { type: 'rush', gap: gapOf(d.sx, d.id), delay: 0.6, greenDog: true };
      d.gap = d.job.gap; rushers.push(d);
      // the back/TE he was covering is already in protection and picks him up (that's the rule)
      const helper = backs.find((bk) => bk.mode === 'help' && !bk.took);
      if (helper) {
        helper.took = true; if (helper.r) { const hr = rows.get(helper.r.id); hr.helpers = hr.helpers.filter((h) => h !== helper.pl.id); hr.double = hr.helpers.length > 0; }
        helper.r = d; helper.mode = 'block';
        rows.set(d.id, { rusher: d.id, blocker: helper.pl.id, blockerKind: helper.pl.id === 'RB' ? 'RB' : 'TE', scheme: 'man', kind: 'blocked', helpers: [] });
      }
    });

    // --- win times / moves ---
    rushers.forEach((r, i) => {
      const u = rnd(), u2 = rnd();
      let row = rows.get(r.id);
      if (!row) { row = { rusher: r.id, blocker: null, kind: 'free', helpers: [] }; rows.set(r.id, row); }
      const fa = freeArrive(r);
      row.freeArrive = fa;
      if (row.kind === 'free') { row.win = 0; row.arrive = fa; row.move = r.job.greenDog ? 'green-dog' : r.job.stunt ? 'stunt (unblocked)' : 'unblocked'; return; }
      const vsBack = row.blockerKind === 'RB' || row.blockerKind === 'TE';
      let win, move;
      if (/^DE/.test(r.id)) { move = u2 < 0.45 ? 'speed rush' : u2 < 0.75 ? 'bull rush' : 'rip'; win = 3.75 + (u - 0.5) * 1.1 - (move === 'speed rush' ? 0.15 : 0); }
      else if (isDL(r)) { move = u2 < 0.5 ? 'bull rush' : u2 < 0.8 ? 'swim' : 'club-rip'; win = 4.0 + (u - 0.5) * 0.9; }
      else { move = 'blitz'; win = 3.7 + (u - 0.5) * 0.9; }
      if (vsBack) win = isDL(r) ? 2.2 + (u - 0.5) * 0.6 : (row.blockerKind === 'TE' ? 3.4 : 3.0) + (u - 0.5) * 0.8;
      if (row.chip) win += 0.8;
      if (row.double) win += 2.2;
      if (r.job.stunt === 'loop') { if (row.scheme === 'man') { win = 1.55 + u * 0.55; move = 'loop stunt — picked the man blocker'; } else { win += 0.15; move = 'loop stunt (passed off)'; } }
      if (r.job.stunt === 'pen' && row.scheme === 'man') { win -= 0.3; move = 'penetrator (stunt)'; }
      if (row.kind === 'late') { win = Math.min(win, 0.45 + fa - 0.35); move = 'late pickup'; }
      row.win = clamp(win, 0.5, 7);
      row.move = move;
      row.arrive = row.win + 0.35;
    });
    const mul = sim.opts.pocketMul || 1;
    rows.forEach((row) => { row.arrive *= mul; row.win *= mul; if (row.freeArrive) row.freeArrive *= mul; });
    const list = [...rows.values()].sort((a, b) => a.arrive - b.arrive);
    const free = list.filter((r) => r.kind === 'free' || r.kind === 'late');
    const sackRow = list[0];
    sim.prot = { id: P.id, def: P, rows: list, free, kept, backs, sackTime: sackRow ? sackRow.arrive : 6, sacker: sackRow && sackRow.rusher, rushers: rushers.length,
      blockers: ol.length + kept.length };
    // plans for movement
    rushers.forEach((r) => { r.rush = rows.get(r.id); });
    sim.ol.forEach((o, i) => { o.block = ol[i].has && rows.get(ol[i].has.id) && rows.get(ol[i].has.id).blocker === o.id ? ol[i].has : null; o.helpTarget = ol[i].has; });
    return sim.prot;
  }
  function refId(sim, ref) { const p = sim.refs[ref]; return p ? p.id : null; }

  /** Rusher position at time t (pure). */
  function rusherPos(sim, d, t) {
    const row = d.rush, qb = sim.qbAt(Math.min(t, row.arrive));
    if (t >= row.arrive) return { x: qb.x + (d.sx < sim.qb.sx ? -0.5 : 0.5), y: qb.y + 0.6 };
    if (row.kind === 'free' || row.kind === 'late') {
      const g = { x: gapX(d.gap), y: 0.2 };
      const t0 = (d.job.delay || 0) + 0.15, t1 = t0 + dist({ x: d.sx, y: d.sy }, g) / speedOf(d);
      if (t < t0) return { x: d.sx, y: d.sy };
      if (t < t1) { const f = (t - t0) / (t1 - t0); return { x: lerp(d.sx, g.x, f), y: lerp(d.sy, g.y, f) }; }
      const f = (t - t1) / Math.max(0.05, row.arrive - t1), q = sim.qbAt(row.arrive);
      return { x: lerp(g.x, q.x, f), y: lerp(g.y, q.y + 0.6, f) };
    }
    const e = engagePoint(sim, d, Math.min(t, row.win));
    if (t <= row.win) return e;
    const f = (t - row.win) / Math.max(0.05, row.arrive - row.win), q = sim.qbAt(row.arrive);
    const bulge = row.move === 'speed rush' ? Math.sin(f * Math.PI) * 1.3 * (d.sx < BX ? -1 : 1) : 0;
    return { x: lerp(e.x, q.x, f) + bulge, y: lerp(e.y, q.y + 0.6, f) };
  }
  function blockerHome(sim, id) { const o = sim.ol.find((x) => x.id === id); if (o) return { x: o.sx, y: o.sy }; const p = sim.offense.find((x) => x.id === id); return p ? { x: p.sx0 != null ? p.sx0 : p.x, y: p.sy0 != null ? p.sy0 : p.y } : { x: BX, y: -2 }; }
  function engagePoint(sim, d, t) {
    const row = d.rush, b = blockerHome(sim, row.blocker);
    const te = row.blockerKind === 'OL' ? 0.32 : 0.55;
    const ex0 = lerp(b.x, d.sx, 0.45), ey0 = row.blockerKind === 'OL' ? -0.1 : Math.min(-1, b.y + 1.2);
    if (t < te) { const f = t / te; return { x: lerp(d.sx, ex0, f), y: lerp(d.sy, ey0 + 0.6, f) }; }
    const push = /bull/.test(row.move || '') ? -3.6 : row.double ? -1.2 : -2.4;
    const f = clamp((t - te) / Math.max(0.3, row.win - te), 0, 1);
    const qx = sim.qbAt(t).x;
    return { x: lerp(ex0, lerp(ex0, qx, 0.35), f), y: lerp(ey0 + 0.6, Math.max(push, sim.qbAt(t).y + 2), f) };
  }
  /** Offensive blocker (OL / kept-in back) position at time t. */
  function blockerPos(sim, o, t) {
    const home = { x: o.sx, y: o.sy };
    const d = o.block;
    if (d && d.rush) {
      const row = d.rush; const tt = Math.min(t, row.win);
      const e = engagePoint(sim, d, tt);
      const p = { x: e.x + (home.x - e.x) * 0.1, y: e.y - 0.8 };
      if (t > row.win) p.y -= Math.min(0.8, (t - row.win) * 2);
      return p;
    }
    // uncovered: pass set and help inside
    const f = clamp(t / 1.2, 0, 1);
    return { x: home.x + (BX - home.x) * 0.15 * f, y: home.y - 2.6 * f };
  }

  /** Static evaluation used by grading and the matrix test: how good is protection P vs this look? */
  function rate(prot, sim) {
    const freeEarly = prot.free.filter((r) => r.arrive < 2.4);
    const released = sim.offense.filter((p) => p.read >= 0).length;
    return { free: prot.free.length, freeEarly: freeEarly.length, released, sackTime: prot.sackTime };
  }

  const api = { PROTECTIONS, PROT, GAPS, gapX, gapOf, assign, rusherPos, blockerPos, rate, seeded, isDL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBProt = api;
})(typeof window !== 'undefined' ? window : globalThis);
