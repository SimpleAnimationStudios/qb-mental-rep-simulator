/**
 * runplay.js — Run game model (pure, no DOM; browser + Node).
 * Box count vs blockers, safety shell, front, blitz -> expected yards per concept; then a
 * seeded outcome (yards / stuffed / TFL / fumble) and pure motion functions for the animation
 * (handoff mesh, carrier path, OL fire-out, run fits, tackler convergence).
 */
(function (root) {
  const D = root.QBData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const BX = D.FIELD.ballX;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /**
   * Run concepts. aim = target gap x-offset (playside), hand = handoff time, scheme = blocking.
   * fit(features) returns {bonus, note} — how this concept plays vs this look.
   */
  const RUN_CONCEPTS = {
    IZ: { name: 'Inside Zone', scheme: 'zone', aim: 2.6, hand: 0.5, read: true,
      fit: (f) => f.bear ? [-1.5, 'Bear front covers both guards and the centre — no double teams for inside zone'] : f.lbBlitz ? [-1, 'linebackers blitzing the A/B gaps get penetration before the zone combo climbs'] : f.adv >= 1 ? [0.6, 'zone doubles climb to an outnumbered second level'] : [0, ''] },
    OZ: { name: 'Outside Zone', scheme: 'zone', aim: 7.5, hand: 0.55, read: true,
      fit: (f) => f.bear ? [0.9, 'the Bear front is packed inside — stretching it outside wins the edge'] : f.squatCorner ? [-0.9, 'a squat / cloud corner is the force player and fills the alley fast'] : f.dbBlitz ? [-1.4, 'an edge blitz from the secondary sets the edge deep in the backfield'] : [0.2, 'the stretch makes linebackers flow and opens a cut-back'] },
    POWER: { name: 'Power (gap)', scheme: 'gap', aim: 3.6, hand: 0.55, pull: 'OL1',
      fit: (f) => f.lbBlitz ? [-1, 'a run blitz into the frontside gap beats the down blocks'] : f.twoHigh ? [0.6, 'two-high shell keeps a safety out of the fit, the puller has the linebacker'] : f.bear ? [-0.5, 'Bear technique players squeeze the gap the puller needs'] : [0.2, ''] },
    COUNTER: { name: 'Counter (GT)', scheme: 'gap', aim: -3.6, hand: 0.7, pull: 'OL3',
      fit: (f) => f.cross ? [1.6, 'the cross-dog linebackers flow with the first step and run themselves out of the play'] : f.lbBlitz ? [1, 'blitzing linebackers chase the counter step and vacate the backside'] : f.stunt ? [0.5, 'stunting linemen take themselves out of the gap'] : [0, ''] },
    DRAW: { name: 'Draw', scheme: 'man', aim: 1.2, hand: 1.0,
      fit: (f) => f.zero ? [2.6, 'all-out pressure means nobody is home behind the rushers'] : f.blitz ? [2, 'blitzers and rushers are selling out up-field — the draw goes right past them'] : f.box <= 5 ? [1, 'light dime box with pass rushers in a wide 9'] : [-0.6, 'a base 4-man rush with linebackers reading their keys sniffs out the draw'] },
    DIVE: { name: 'Dive', scheme: 'man', aim: 1.3, hand: 0.35,
      fit: (f) => f.bear ? [-2, 'five down linemen clog every inside gap'] : f.adv >= 1 ? [0.8, 'quick-hitting dive into a light box'] : [0, ''] },
    TOSS: { name: 'Toss / Sweep', scheme: 'zone', aim: 11, hand: 0.3,
      fit: (f) => f.bear ? [2.2, 'the Bear front is squeezed inside; nobody is outside the tight end'] : f.squatCorner ? [-1.6, 'squat Cover 2 / cloud corners force the sweep back inside'] : f.dbBlitz ? [-2, 'an edge blitzer is already in the backfield'] : [0.2, ''] },
    SNEAK: { name: 'QB Sneak', scheme: 'wedge', aim: 0.4, hand: 0, carrier: 'QB',
      fit: () => [0, ''] },
  };

  /** Pre-snap features of the defensive look. */
  function features(sim) {
    // box edges: 3.5 yd outside the last in-line blocker (tackle at +-5, or an in-line TE)
    const edge = (side) => 3.5 + Math.max(5, ...sim.offense.filter((p) => p.sy0 >= -1.5 && Math.abs(p.sx0 - BX) < 9 && Math.sign(p.sx0 - BX) === side).map((p) => Math.abs(p.sx0 - BX)));
    const eL = edge(-1), eR = edge(1);
    const box = sim.defense.filter((d) => d.sx - BX >= -eL && d.sx - BX <= eR && d.sy <= 7.5);
    const onLine = sim.defense.filter((d) => d.sy < 2 && Math.abs(d.sx - BX) <= 9);
    const inline = sim.offense.filter((p) => p.id !== sim.run.carrierId && p.id !== 'QB' && p.sy0 <= -0.5 && Math.abs(p.sx0 - BX) <= 9 && (!p.route || p.route.block || p.id !== 'RB'));
    const concept = RUN_CONCEPTS[sim.run.concept];
    const gun = sim.qb.sy <= -3;
    let blockers = 5 + inline.length + (concept.read && gun ? 1 : 0);
    const safeties = sim.defense.filter((d) => /S$|^S/.test(d.label) && d.sy >= 10);
    const bl = (sim.play.pressure && D.BLITZES[sim.play.pressure]) || D.BLITZES.NONE;
    const fam = bl.family;
    const rpo = sim.play.rpo && sim.defense.find((d) => d.id === sim.play.rpo.conflict);
    const f = {
      box: box.length, blockers, onLine: onLine.length, twoHigh: safeties.length >= 2,
      bear: onLine.length >= 5 && box.length >= 8, blitz: fam !== '4M' && fam !== 'STUNT', lbBlitz: fam === 'LB' || fam === 'ZERO' || fam === 'FIRE',
      dbBlitz: fam === 'DB', zero: fam === 'ZERO', stunt: fam === 'STUNT', cross: sim.play.pressure === 'XDOG',
      squatCorner: ['C2_ZONE', 'C2_TAMPA', 'C3_CLOUD', 'C4_C6'].indexOf(sim.cov.variant) >= 0,
      front: (sim.front ? sim.front.name + ' · ' : '') + (sim.cov.front || (box.length >= 8 ? '8-man box (safety down)' : box.length === 7 ? '7-man box (base)' : box.length === 6 ? 'Nickel (6-man box)' : 'Dime (5-man box)')),
      conflictInBox: rpo ? Math.abs(rpo.sx - BX) <= 8.5 && rpo.sy <= 7.5 : false,
    };
    if (rpo) { f.blockers += 0; if (f.conflictInBox) f.box -= 1; } // the RPO read 'blocks' the conflict defender
    f.adv = f.blockers - f.box;
    if (sim.run.concept === 'DRAW') f.adv += 0.8 * Math.max(0, sim.defense.filter((d) => d.job.type === 'rush' || d.job.type === 'blitz').length - 4); // rushers who sell out up-field
    f.adv = Math.round(f.adv * 10) / 10;
    return f;
  }

  /** Expected yards (deterministic) + explanation. */
  function expected(sim) {
    const f = features(sim), c = RUN_CONCEPTS[sim.run.concept];
    if (sim.run.concept === 'SNEAK') {
      const interior = sim.defense.filter((d) => Math.abs(d.sx - BX) <= 3.2 && d.sy <= 4).length;
      const ev = clamp(1.7 + 0.5 * (3 - interior), -0.5, 3.5);
      return { ev, f, note: `${interior} defenders over the A-gaps vs centre + guards (wedge)`, fitNote: '' };
    }
    const [bonus, fitNote] = c.fit(f);
    let schemeAdj = 0;
    const sch = sim.run.scheme || c.scheme;
    if (sch === 'zone' && f.stunt) schemeAdj += 0.4;
    if (sch === 'gap' && f.box <= 6) schemeAdj += 0.3;
    if (sch === 'man' && f.lbBlitz) schemeAdj -= 0.3;
    const ev = clamp(3.6 + 1.9 * f.adv + bonus + schemeAdj + (f.twoHigh ? 0.6 : -0.2), -3, 9.5);
    const note = `${f.box}-man box vs ${f.blockers} blockers (${f.adv >= 0 ? '+' : ''}${f.adv}), ${f.twoHigh ? 'two-high' : 'one-high/no-high'} shell, ${f.front}`;
    return { ev, f, note, fitNote };
  }

  function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /** Set up a run play on a sim (call from createSim when play.type === 'run'). */
  function setup(sim, rnd) {
    const r = sim.play.run; const c = RUN_CONCEPTS[r.concept];
    const carrierId = r.carrier || c.carrier || 'RB';
    sim.run = { concept: r.concept, scheme: r.scheme || c.scheme, carrierId, dir: r.dir === 'L' ? -1 : 1, handed: false, cancelled: false };
    const ex = expected(sim);
    sim.run.ex = ex;
    // outcome
    let yards = ex.ev + gauss(rnd) * (r.concept === 'SNEAK' ? 0.9 : 2.4);
    if (r.concept !== 'SNEAK' && ex.f.adv >= 0 && rnd() < 0.07) yards += 8 + rnd() * 18;
    yards = Math.round(clamp(yards, r.concept === 'SNEAK' ? -1 : -4, 60));
    const fumble = rnd() < 0.012 * ((sim.opts && sim.opts.intMul) || 1);
    sim.run.yards = yards; sim.run.fumble = fumble;
    // carrier path
    const car = carrierId === 'QB' ? sim.qb : sim.offense.find((p) => p.id === carrierId);
    const dir = sim.run.dir;
    const aimX = BX + dir * c.aim;
    const hand = c.hand;
    const mesh = carrierId === 'QB' ? { x: sim.qb.sx, y: sim.qb.sy } : { x: lerp(car.sx0, sim.qb.sx, 0.7) + dir * 0.4, y: sim.qb.sy - 0.4 };
    const tMesh = carrierId === 'QB' ? 0 : hand;
    const v = carrierId === 'QB' ? 3.2 : 6.6;
    const gapPt = { x: aimX, y: 0.4 };
    const tGap = tMesh + dist(mesh, gapPt) / v;
    const endPt = { x: aimX + dir * Math.min(4, Math.max(0, yards) * 0.15), y: yards };
    const tEnd = tGap + Math.abs(yards - gapPt.y) / (yards > 0 ? v : 3) + (yards <= 0 ? 0.2 : 0);
    sim.run.path = { start: { x: car.sx0 != null ? car.sx0 : car.sx, y: car.sy0 != null ? car.sy0 : car.sy }, mesh, tMesh, gapPt, tGap, endPt, tEnd };
    sim.run.tEnd = tEnd;
    // tackler: unblocked box defender for short gains, otherwise the nearest secondary player
    const box = sim.defense.filter((d) => Math.abs(d.sx - BX) <= 8.5 && d.sy <= 7.5).sort((a, b) => dist({ x: a.sx, y: a.sy }, endPt) - dist({ x: b.sx, y: b.sy }, endPt));
    const sec = sim.defense.filter((d) => box.indexOf(d) < 0).sort((a, b) => dist({ x: a.sx, y: a.sy }, endPt) - dist({ x: b.sx, y: b.sy }, endPt));
    const tackler = yards <= 4 ? box.find((d) => !/^(DE|DT|NT)/.test(d.id)) || box[0] : sec[0] || box[0];
    sim.run.tackler = tackler && tackler.id;
    // which box defenders are blocked (closest to the aim point first, up to the blocker count)
    const nBlock = Math.max(0, ex.f.blockers - (c.read && sim.qb.sy <= -3 ? 1 : 0));
    sim.run.blocked = box.filter((d) => d !== tackler).slice(0, nBlock).map((d) => d.id);
    sim.sackTime = 99;
  }

  function carrierAt(sim, t) {
    const P = sim.run.path;
    if (t <= P.tMesh) { const f = P.tMesh ? t / P.tMesh : 1; return { x: lerp(P.start.x, P.mesh.x, f), y: lerp(P.start.y, P.mesh.y, f) }; }
    if (t <= P.tGap) { const f = (t - P.tMesh) / (P.tGap - P.tMesh); return { x: lerp(P.mesh.x, P.gapPt.x, f), y: lerp(P.mesh.y, P.gapPt.y, f) }; }
    const f = clamp((t - P.tGap) / Math.max(0.05, P.tEnd - P.tGap), 0, 1);
    return { x: lerp(P.gapPt.x, P.endPt.x, f), y: lerp(P.gapPt.y, P.endPt.y, f) };
  }

  /** Step all players for a run play. */
  function step(sim, dt) {
    const t = sim.t, R = sim.run, dir = R.dir;
    const car = carrierAt(sim, t);
    if (R.carrierId === 'QB') { sim.qb.x = car.x; sim.qb.y = car.y; }
    else {
      sim.qb.x = sim.qb.sx + (t < R.path.tMesh ? dir * 0.5 * t / R.path.tMesh : dir * 0.5);
      sim.qb.y = sim.qb.sy - (t < R.path.tMesh ? 0.3 * t / R.path.tMesh : 0.3 + Math.min(1.5, (t - R.path.tMesh) * 1.5));
    }
    if (t >= R.path.tMesh) R.handed = true;
    sim.ballCarrier = R.handed ? R.carrierId : 'QB';
    sim.offense.forEach((p) => {
      if (p.id === R.carrierId) { p.x = car.x; p.y = car.y; return; }
      const q = p.posAt(t); p.x = q.x; p.y = q.y;
    });
    // OL fire out: zone = lateral + forward, gap = down blocks, puller wraps
    const c = RUN_CONCEPTS[R.concept];
    sim.ol.forEach((o, i) => {
      const f = clamp(t / 0.7, 0, 1);
      if (c.pull && o.id === c.pull) {
        const pt = { x: BX + dir * (c.aim - 0.5), y: -0.8 }; const g = clamp(t / 1.1, 0, 1);
        o.x = lerp(o.sx, pt.x, g); o.y = lerp(o.sy, pt.y, g) - Math.sin(g * Math.PI) * 1.2 + (g >= 1 ? Math.min(2, (t - 1.1) * 3) : 0);
        return;
      }
      const lat = c.scheme === 'zone' ? dir * 1.2 : c.scheme === 'gap' ? -dir * 0.6 : 0;
      o.x = o.sx + lat * f; o.y = o.sy + 1.6 * f;
    });
    // defenders: run fits
    sim.defense.forEach((d) => {
      const blocked = R.blocked.indexOf(d.id) >= 0, isT = d.id === R.tackler;
      const isDL = /^(DE|DT|NT)/.test(d.id);
      let target, sp;
      const lead = carrierAt(sim, t + 0.35);
      if (isT) {
        const remain = Math.max(0.05, R.tEnd - t), tp = R.path.endPt;
        target = t < 0.35 ? { x: d.sx, y: d.sy } : tp; sp = t < 0.35 ? 0 : clamp(dist(d, tp) / remain, 2, 9.5);
      } else if (isDL) { target = { x: d.sx + (lead.x - d.sx) * 0.2, y: blocked ? 0.6 : lead.y }; sp = blocked ? 1.5 : 5.5; }
      else if (blocked) { target = { x: lerp(d.sx, lead.x, 0.4), y: Math.max(1.4, Math.min(d.sy, lead.y + 1.2)) }; sp = 3; }
      else if (d.sy > 8 || Math.abs(d.sx - BX) > 9) { target = t < 0.5 ? { x: d.sx, y: d.sy + 1 } : { x: lead.x, y: lead.y + 1 }; sp = t < 0.5 ? 3 : 6.4; }
      else { target = t < 0.3 ? { x: d.sx, y: d.sy } : lead; sp = 5.8; }
      moveToward(d, target, sp, dt);
    });
    if (t >= R.tEnd) {
      sim.phase = 'done';
      const y = R.yards;
      if (R.fumble) sim.result = { type: 'fumble', yards: y, text: 'FUMBLE — defence ball', tackler: R.tackler };
      else sim.result = { type: 'run', yards: y, text: y <= -1 ? `TFL ${y}` : y <= 1 ? `STUFFED ${y >= 0 ? '+' : ''}${y}` : `RUN +${y}`, tackler: R.tackler };
      const td = sim.defense.find((d) => d.id === R.tackler); if (td) { const p = carrierAt(sim, t); td.x = p.x + 0.5; td.y = p.y + 0.6; }
    }
  }
  function moveToward(p, target, speed, dt) {
    const dx = target.x - p.x, dy = target.y - p.y, m = Math.hypot(dx, dy), s = speed * dt;
    if (m <= s || m === 0) { p.x = target.x; p.y = target.y; } else { p.x += dx / m * s; p.y += dy / m * s; }
  }

  /** Verdict text for grading: should this run have been called vs this look? */
  function verdict(sim, togo) {
    const ex = sim.run ? sim.run.ex : expected(sim);
    const need = sim.run && sim.run.concept === 'SNEAK' ? Math.min(togo || 1, 2) : 3.5;
    const good = ex.ev >= need, marginal = !good && ex.ev >= need - 1.2;
    const f = ex.f;
    let why;
    if (sim.run && sim.run.concept === 'SNEAK') why = good ? `Short yardage and ${ex.note}: the sneak is the right call.` : `${ex.note}: too many bodies over the ball for a sneak.`;
    else if (f.adv >= 0) why = `Light box: ${f.blockers} blockers vs ${f.box} in the box — run is the right option.`;
    else if (f.box >= 8) why = `Loaded ${f.box}-man box vs ${f.blockers} blockers — audible to a pass / hot throw.`;
    else why = `${f.box}-man box vs ${f.blockers} blockers: the defence has an extra run defender.`;
    if (ex.fitNote) why += ` ${RUN_CONCEPTS[sim.run.concept].name}: ${ex.fitNote}.`;
    return { good, marginal, ev: ex.ev, why, f };
  }

  const api = { RUN_CONCEPTS, features, expected, setup, step, carrierAt, verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBRun = api;
})(typeof window !== 'undefined' ? window : globalThis);
