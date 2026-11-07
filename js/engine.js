/**
 * engine.js — Pure simulation (no DOM). Builds a play from data, steps it in time,
 * resolves throws. Runs in the browser (window.QBEngine) and in Node (for tests).
 */
(function (root) {
  const D = root.QBData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const Prot = root.QBProt || (typeof require !== 'undefined' ? require('./protections.js') : null);
  const req = (n) => { try { return typeof require !== 'undefined' ? require(n) : null; } catch (e) { return null; } };
  const Run = root.QBRun || (typeof require !== 'undefined' ? require('./runplay.js') : null);

  // Tunable physics (yards / second). v12 feel: snappier game-sim pacing (docs/v12-feel.md).
  const WR_SPEED = 7.85;     // v12: slightly faster stems/breaks (was 7.4)
  const DB_SPEED = 8.0;      // v12: crisp close; still ≥ WR so deep isn't free
  const ZONE_SPEED = 7.0;    // v12: underneath drops arrive sooner (was 6.5)
  const DEEP_DROP = 7.6;     // v12: deeper pedal (was 7.2)
  const MAN_LAG = 0.22;      // v12: tighter trail reaction (was 0.32)
  const BALL_SPEED = 22;     // v12: snappier ball flight (was 20)
  const RELEASE = 0.12;      // v12: quicker release (was 0.15)

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** Build a timed path from route waypoints. Position is a pure function of time. */
  /** Resolve a route spec: library name, or {base, depth, flip, pts, delay} (custom plays). */
  function resolveRoute(spec) {
    if (!spec) return D.ROUTES.block;
    if (typeof spec === 'string') return D.ROUTES[spec] || D.ROUTES.hitch;
    const base = spec.pts ? { name: spec.name || 'Custom', pts: spec.pts } : (D.ROUTES[spec.base] || D.ROUTES.hitch);
    const k = spec.depth || 1, fl = spec.flip ? -1 : 1;
    return { ...base, name: (base.name || '') + (spec.depth && spec.depth !== 1 ? ` (${Math.round(k * 100)}%)` : '') + (spec.flip ? ' (flipped)' : ''),
      pts: base.pts.map(([dx, dy]) => [dx * fl, dy * k]), delay: spec.delay != null ? spec.delay : base.delay, yac: base.yac, block: base.block };
  }
  function buildPath(start, route, dir) {
    const pts = [{ x: start.x, y: start.y }];
    route.pts.forEach(([dx, dy]) => pts.push({ x: clamp(start.x + dx * dir, 1, D.FIELD.width - 1), y: start.y + dy }));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const delay = route.delay || 0;
    return function posAt(t) {
      const d = Math.max(0, t - delay) * WR_SPEED;
      if (d >= cum[cum.length - 1]) return { ...pts[pts.length - 1] };
      let i = 1;
      while (cum[i] < d) i++;
      const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    };
  }

  /** Map receivers to refs: L1,L2 (outside-in left), R1,R2,R3 (outside-in right), B (back). */
  function computeRefs(players) {
    const refs = {};
    const wr = players.filter((p) => p.id !== 'RB' && p.y > -2.5);
    const fb = players.find((p) => p.id !== 'RB' && p.y <= -2.5); if (fb) refs.F = fb;
    wr.filter((p) => p.x < D.FIELD.ballX).sort((a, b) => a.x - b.x).forEach((p, i) => (refs['L' + (i + 1)] = p));
    wr.filter((p) => p.x >= D.FIELD.ballX).sort((a, b) => b.x - a.x).forEach((p, i) => (refs['R' + (i + 1)] = p));
    refs.B = players.find((p) => p.id === 'RB');
    return refs;
  }

  /** Create a fresh simulation for a play (pass or run). opts: {pocketMul, disguise, intMul, seed, protection}. */
  function createSim(play, rng, opts) {
    opts = Object.assign({}, opts || {});
    if (opts.seed == null) opts.seed = Math.floor((rng || Math.random)() * 1e9) + 1;
    const form = D.FORMATIONS[play.formation] || D.FORMATIONS.doubles;
    const cov = D.COVERAGES[play.coverage] || D.COVERAGES.cover3;
    const blitz = D.BLITZES[play.pressure] || D.BLITZES.NONE;
    const sim = { opts, play, cov, blitz, form, t: 0, phase: 'presnap', rng: rng || Math.random, ball: null, result: null, throwInfo: null };
    const isRun = play.type === 'run';
    const protId = isRun ? null : (opts.protection || play.protection || 'BOB');
    const P = protId && Prot.PROT[protId];
    sim.protId = protId;
    sim.qb = { id: 'QB', label: 'QB', x: form.qb[0], y: form.qb[1], sx: form.qb[0], sy: form.qb[1] };
    sim.qbAt = qbPath(sim, form, play);
    sim.ol = [-5, -2.5, 0, 2.5, 5].map((dx, i) => ({ id: 'OL' + i, label: ['LT', 'LG', 'C', 'RG', 'RT'][i], x: D.FIELD.ballX + dx, y: -1, sx: D.FIELD.ballX + dx, sy: -1 }));

    sim.offense = Object.entries(form.players).map(([id, [x, y]]) => {
      // protection alignment: the back flips to his protection side, Max brings the TE in-line
      if (P && id === 'RB' && P.rb && P.rb.side && y > -6 && Math.abs(x - D.FIELD.ballX) > 1) x = D.FIELD.ballX + (P.rb.side === 'L' ? -2.85 : 2.85);
      if (P && P.te && id === P.te.id) { x = P.te.spot[0]; y = P.te.spot[1]; }
      const dir = x < D.FIELD.ballX - 0.1 ? -1 : x > D.FIELD.ballX + 0.1 ? 1 : (play.run && play.run.dir === 'L' ? -1 : 1);
      const spec = (play.routes || {})[id];
      const route = resolveRoute(spec);
      const p = { id, label: id, x, y, sx0: x, sy0: y, route, dir };
      p.posAt = buildPath({ x, y }, route, dir);
      p.basePosAt = p.posAt;
      p.read = route.block ? -1 : (play.progression || []).indexOf(id);
      return p;
    });
    sim.refs = computeRefs(sim.offense);
    const fallback = (ref) => sim.refs[ref] || (ref && ref[0] === 'L' ? sim.refs.L2 || sim.refs.L1 : sim.refs.R2 || sim.refs.R3 || sim.refs.R1) || null;

    // v10 fronts (js/defense.js): opts.front = front id | 'auto' (pairing pick, deterministic by seed) ; play.front = authored
    const F = root.QBDefense || req('./defense.js');
    let fid = opts.front === 'auto' ? (F && F.pick(play, opts.seed)) : (opts.front || play.front || null);
    const front = (F && fid && F.BY[fid]) || null; const strong = F ? F.strengthOf(sim.offense) : 1;
    sim.front = front ? { id: front.id, family: front.family, name: front.name, label: front.label, pkg: front.pkg, strong } : null;
    sim.defense = cov.defenders.map((def0) => {
      const fs = front && F.slot(front, def0.id, strong);
      if (fs) def0 = { ...def0, label: fs.label || def0.label, pre: fs.pre || def0.pre, job: fs.job || def0.job, role: fs.role, down: fs.down, tech: fs.tech, tilt: fs.tilt };
      const o = blitz.set && blitz.set[def0.id];
      const def = o ? { ...def0, pre: o.pre || def0.pre, job: o.job || def0.job, blitzed: true } : def0;
      let x, y, job = { ...def.job };
      if (def.pre.ref) {
        const r = sim.refs[def.pre.ref] || fallback(def.pre.ref);
        if (r) { x = r.x + (def.pre.dx || 0); y = Math.max(0.8, r.y + (def.pre.dy || 0)); }
        else { x = D.FIELD.ballX + (def.pre.ref[0] === 'L' ? -7 : 7); y = 6; }
      } else { x = def.pre.x; y = def.pre.y; }
      // v11: outside deep thirds/halves prefer the #1 vertical (widest), not the seam
      if (job.deep && job.type === 'zone' && Math.abs((job.x != null ? job.x : x) - D.FIELD.ballX) > 12) job.prefer = job.prefer || 'out';
      if (job.type === 'man' && !sim.refs[job.ref]) { const r = fallback(job.ref); if (r && r !== sim.refs.B) job.ref = Object.keys(sim.refs).find((k) => sim.refs[k] === r); else job = { type: 'zone', x, y: y + 3, r: 5 }; }
      if (job.type === 'read' && !sim.refs[job.ref]) job = job.no;
      // Difficulty disguise: safeties creep toward a neutral 2-high shell pre-snap (not blitzers — their creep IS the tell).
      const dg = opts.disguise || 0;
      if (dg && !o && (def.id === 'S1' || def.id === 'S2')) {
        const n = def.id === 'S1' ? { x: 17.5, y: 12.5 } : { x: 36, y: 12.5 };
        x += (n.x - x) * dg; y += (n.y - y) * dg;
      }
      const role = def.role || (F ? F.BASE_ROLE[def.id] : null) || (/^(DE|DT)/.test(def.id) ? 'DL' : /^(W|M)$/.test(def.id) ? 'LB' : 'DB');
      const down = def.down != null ? (o && o.pre && role !== 'DL' ? false : def.down) : role === 'DL';
      const job0 = JSON.parse(JSON.stringify(job)); return { id: def.id, label: def.label, job, job0, x, y, sx: x, sy: y, sx0: x, sy0: y, blitzed: !!def.blitzed, role, down, tech: def.tech || null }; // v12: job0 = authored overlay landmarks
    });
    if (F) sim.personnel = F.personnel(sim.defense);
    if (isRun) {
      Run.setup(sim, Prot.seeded(opts.seed * 7 + 3));
      sim.rushers = sim.defense.filter((d) => d.job.type === 'rush' || d.job.type === 'blitz').length;
      return sim;
    }
    // ---- pass protection ----
    Prot.assign(sim, protId);
    const prot = sim.prot;
    prot.backs.forEach((bk) => {
      const pl = bk.pl;
      if (bk.mode === 'block' || bk.mode === 'help') {
        const r = bk.r; pl.read = -1; pl.kept = true;
        pl.posAt = (t) => { if (!r) return { x: pl.sx0, y: pl.sy0 - Math.min(1, t) }; const rp = Prot.rusherPos(sim, r, Math.min(t, r.rush.win || 0.5)); const f = Math.min(1, t / 0.5); return { x: pl.sx0 + (rp.x - pl.sx0) * f, y: pl.sy0 + (rp.y - 0.8 - pl.sy0) * f }; };
      } else if (bk.mode === 'checkRelease' || bk.mode === 'chip') {
        const delay = bk.mode === 'chip' ? 0.9 : 0.6;
        const rt = { ...pl.route, delay: Math.max(pl.route.delay || 0, delay) };
        pl.route = rt; pl.posAt = buildPath({ x: pl.sx0, y: pl.sy0 }, rt, pl.dir); pl.checked = bk.mode;
      }
    });
    if (P.rb && P.rb.mode === 'release' && P.rb.quick) {
      const rb = sim.offense.find((p) => p.id === 'RB');
      if (rb && rb.read >= 0) { const rt = { ...rb.route, delay: 0 }; rb.route = rt; rb.posAt = buildPath({ x: rb.sx0, y: rb.sy0 }, rt, rb.dir); }
    }
    // HOT / sight adjust: if a rusher is unblocked, the slots convert to hot slants.
    if (P.hot && prot.free.some((r) => r.arrive < 2.3)) {
      ['L2', 'R2'].forEach((k) => { const p = sim.refs[k]; if (!p || p.kept || p.read < 0) return; p.route = D.ROUTES.hotSlant; p.posAt = buildPath({ x: p.sx0, y: p.sy0 }, p.route, p.dir); p.hotAdjust = true; });
    }
    sim.rushers = prot.rushers;
    sim.sackTime = play.sackTime ? play.sackTime * (opts.pocketMul || 1) : prot.sackTime;
    // Custom / audibled plays carry no authored read: probe one so timing + INT lateness are defined.
    if ((play.idealTime == null || !play.correct) && !opts._probe) {
      const br = bestRead(play, Object.assign({}, opts, { _probe: true }));
      const pk = br.pick || { id: (play.progression || [])[0], t: 1.6 };
      sim.play = Object.assign({}, play, { correct: play.correct || pk.id, idealTime: play.idealTime != null ? play.idealTime : pk.t, probed: true });
    }
    return sim;
  }

  /** QB path as a pure function of time: drop, play-action fake, bootleg. */
  function qbPath(sim, form, play) {
    const sx = form.qb[0], sy = form.qb[1], drop = form.drop || 2, dT = form.dropT || 0.6;
    const pa = !!play.pa, boot = play.boot ? (play.boot === 'L' ? -1 : 1) : 0;
    return function (t) {
      if (play.type === 'run') return { x: sx, y: sy };
      let x = sx, y;
      if (pa) {
        const fk = 0.5; // ride the fake
        if (t < fk) { x = sx + 0.8 * (t / fk) * (boot ? -boot : 1); y = sy - 0.6 * t / fk; }
        else { const f = clamp((t - fk) / dT, 0, 1); x = sx + 0.8 * (boot ? -boot : 1) * (1 - f); y = sy - 0.6 - (drop - 0.6) * f; }
        if (boot && t > 0.6) { const f = clamp((t - 0.6) / 1.1, 0, 1); x = sx + boot * 8 * f; y = Math.max(y, sy - drop + 1 * f); }
        return { x, y };
      }
      y = sy - drop * clamp(t / dT, 0, 1);
      if (boot && t > 0.3) x = sx + boot * 8 * clamp((t - 0.3) / 1.2, 0, 1);
      return { x, y };
    };
  }

  function moveToward(p, target, speed, dt) {
    const dx = target.x - p.x, dy = target.y - p.y, m = Math.hypot(dx, dy);
    const step = speed * dt;
    if (m <= step || m === 0) { p.x = target.x; p.y = target.y; }
    else { p.x += (dx / m) * step; p.y += (dy / m) * step; }
  }

  /** Defender AI: simple coverage rules. */
  function stepDefender(d, sim, dt) {
    let j = d.job; const t = sim.t;
    // 2-read / pattern-read jobs: hold & read, then commit to the `yes` or `no` assignment.
    if (j.type === 'read') {
      const r = sim.refs[j.ref], s0 = r.posAt(0), p = r.posAt(t);
      const out = Math.abs(p.x - D.FIELD.ballX) - Math.abs(s0.x - D.FIELD.ballX) > 1.5 && p.y - s0.y < 5;
      if (t < (j.at || 0.6)) { moveToward(d, { x: d.sx, y: d.sy + 1 }, 3, dt); return; }
      d.readJob = j; d.job = j = (j.cond === 'out' ? out : !out) ? j.yes : j.no;
    }
    if (j.type === 'rush' || j.type === 'blitz') {
      if (d.rush) { const p = Prot.rusherPos(sim, d, t); d.x = p.x; d.y = p.y; return; }
      const f = clamp(t / sim.sackTime, 0, 1);
      const goal = { x: sim.qb.x + (d.sx - sim.qb.x) * 0.12, y: sim.qb.y + 0.8 };
      d.x = d.sx + (goal.x - d.sx) * f; d.y = d.sy + (goal.y - d.sy) * f;
      return;
    }
    // Play-action: second-level defenders in the box bite on the run fake before they drop.
    if (sim.play.pa && t < 0.75 && d.sy < 9 && Math.abs(d.sx - D.FIELD.ballX) < 12 && /^(W|M|SAM|S1|NB|DB)$/.test(d.id)) {
      moveToward(d, { x: d.sx + (sim.qb.sx - d.sx) * 0.2, y: Math.max(1.5, d.sy - 2) }, 4.5, dt); return;
    }
    // ---- v9 defender AI: perception (eyes on the QB, reaction delay), assignment target, then smooth kinematics ----
    const react = sim.opts && sim.opts.react != null ? sim.opts.react : 0.3, disc = sim.opts && sim.opts.disc != null ? sim.opts.disc : 0.8;
    const ti = sim.throwInfo, b = sim.ball;
    if (d.jit == null) { let hsh = 0; for (const ch of String(d.id)) hsh = (hsh * 31 + ch.charCodeAt(0)) % 997; d.jit = (hsh % 7) * 0.025 * (1.3 - disc); }
    // 1) Break on the throw: once the ball is out and this defender has "seen" it (reaction delay + small per-player
    //    jitter), anyone who can get there drives to the catch point; others take a pursuit angle to it.
    const X = (typeof process !== 'undefined' && process.env.V9X) || '';
    let brk = null;
    if (ti && b && sim.phase === 'flight' && !X.includes('B')) {
      const seen = t - ti.time - (react + (d.jit || 0));
      if (seen > 0) {
        const dTo = dist(d, b.to), tLeft = Math.max(0.05, b.t0 + b.T - t);
        const mine = j.type === 'man' && sim.refs[j.ref] === b.target;
        const overHead = !j.deep && j.type !== 'man' && b.to.y > d.y + 4.5; // underneath players don't run down throws over their heads
        if (mine || (!overHead && dTo < (j.type === 'man' ? 3 : BREAK_R))) { // man defenders have eyes on their man: only break if it's him (or right on top of it)
          // flip the hips and locate the ball first (ramp), then drive; deep defenders come over the top, underneath
          // defenders to the near hip — they arrive to contest, not to stand on the exact catch spot.
          const ux = (d.x - b.to.x) / (dTo || 1), uy = (d.y - b.to.y) / (dTo || 1), stand = j.deep ? 1.1 : 0.8;
          brk = { aim: { x: b.to.x + ux * stand, y: b.to.y + uy * stand + (j.deep ? 0.4 : 0) }, w: clamp(seen / 0.35, 0, 1), v: mine ? DB_SPEED + 0.3 : DB_SPEED * BREAK_V * (j.deep ? 0.7 : 1.1) * (0.9 + 0.1 * disc) }; // deep-zone players are turning from a backpedal: slower to close
          void tLeft;
        }
      }
    }
    let target, vmax, ff = null;
    if (j.type === 'man') {
      // Man: trail/leverage technique. Cushion early (bail), tightening as the route develops; he reacts to where the
      // receiver WAS (MAN_LAG, longer for an undisciplined DB), so hard breaks still win a step before he closes.
      const r = sim.refs[j.ref], lag = MAN_LAG * (1.1 - 0.25 * disc);
      const p = r.posAt(Math.max(0, t - lag));
      // v11: trail technique — cushion shrinks fast; press (dy<=3) reroutes with inside hand (dx nudge)
      const press = (d.sy0 != null ? d.sy0 : d.sy) <= 3.2;
      const cush = press ? Math.max(0.15, 0.55 - t * 0.7) : Math.max(0.25, 0.7 - t * 0.55);
      const lev = (j.dx != null ? Math.sign(j.dx) : (p.x >= D.FIELD.ballX ? -1 : 1)) * (press ? 0.55 : 0.35);
      target = { x: p.x + lev, y: p.y + cush }; vmax = DB_SPEED + (dist(d, target) > 0.5 ? 0.85 * disc + 0.25 : 0);
      const p2 = r.posAt(Math.max(0, t - lag + 0.1)); ff = { x: (p2.x - p.x) * 10, y: (p2.y - p.y) * 10 };
      if (press && t < 0.55) { target.x += lev * 0.4; vmax = Math.min(vmax, WR_SPEED * 0.95); } // reroute: slow the release
    } else {
      // Zone: drop / match. v11 deep rule — never race past a vertical; stay on top of the threat in your third/half.
      const spot = { x: j.x, y: j.y };
      const prog = sim.play.progression || [], eyes = prog.length ? sim.refs && sim.offense.find((o) => o.id === prog[Math.min(prog.length - 1, Math.max(0, Math.floor((t - 0.8) / 0.75)))]) : null;
      if (!X.includes('E') && j.deep && eyes && t > 0.45 && Math.abs(spot.x - D.FIELD.ballX) < 14) spot.x += clamp((eyes.x - spot.x) * 0.28 * (1.3 - disc), -4, 4); // v11: only middle deep shades to eyes; corners stay on #1
      if (!X.includes('S') && !j.deep && spot.y >= 5 && spot.y <= 11) spot.y += Math.min(2, Math.max(0, t - 1) * 0.9);
      target = spot; vmax = j.deep ? DEEP_DROP : ZONE_SPEED;
      const matchShell = !X.includes('M') && /MATCH|QTR|C6|C4/.test((sim.cov && (sim.cov.variant || sim.cov.shell)) || '');
      const ZL = matchShell ? 0.25 : (j.deep ? 0.28 : 0.45);
      // Find the most relevant threat: deep zones use a wide lateral reach (their third/half), underneath use zone radius.
      const reach = j.r + (j.deep ? 9 : 2.5);
      let best = null, bs = -Infinity, bestR = null;
      sim.offense.forEach((r) => {
        if (r.route && r.route.block) return; // only true blockers skip; clear-outs (read -1) still threaten deep
        const p = r.posAt(Math.max(0, t - ZL));
        if (j.deep && p.y < 4) return; // deep players ignore checkdowns still behind the LOS
        const dd = dist(p, spot);
        const inLane = j.deep ? (Math.abs(p.x - spot.x) < (j.r + 6) || (j.r >= 8 && p.y > 10 && Math.abs(p.x - spot.x) < j.r + 12)) : dd <= reach;
        if (!inLane && dd > reach) return;
        let score;
        if (j.prefer === 'out') score = Math.abs(p.x - D.FIELD.ballX) * 1.5 + p.y * 0.8 - dd * 0.15;
        else if (j.deep) {
          const outside = Math.abs(spot.x - D.FIELD.ballX) > 12; // corner thirds / deep halves toward the sideline
          // Outside deep: carry the widest vertical in your half (don't jump #2 seams and leave #1 free).
          // Middle deep (FS): sit on the deepest threat near the hashes / posts / seams.
          score = outside
            ? (p.y * 1.2 + Math.abs(p.x - D.FIELD.ballX) * 1.6 - Math.abs(p.x - spot.x) * 0.3)
            : (p.y * 3.2 - Math.abs(p.x - spot.x) * 0.9);
        } else score = -dd;
        if (score > bs) { bs = score; best = p; bestR = r; }
      });
      if (best && bestR) {
        const now = bestR.posAt(t), vertGain = now.y - bestR.posAt(Math.max(0, t - 0.4)).y;
        const vert = j.deep && (now.y > 5 || best.y > 5) && vertGain > 0.8;
        if (j.deep && vert) {
          // Pedal/bail then trail on top — cushion ~1.5–2.2 yd, inside leverage; never clamp to landmark.
          const cush = 1.7 + Math.min(0.6, Math.max(0, 14 - now.y) * 0.08);
          target = { x: now.x + (now.x >= D.FIELD.ballX ? -0.4 : 0.4), y: now.y + cush };
          vmax = DB_SPEED;
          const p2 = bestR.posAt(Math.max(0, t - ZL + 0.1)); ff = { x: (p2.x - best.x) * 10, y: (p2.y - best.y) * 10 };
        } else if (t > (j.drop != null ? j.drop : 0.5)) {
          let vx = (best.x - spot.x) * 0.85, vy = (best.y - spot.y) * 0.85; const m = Math.hypot(vx, vy);
          const cap = j.deep ? j.r + 3 : j.r;
          if (m > cap) { vx *= cap / m; vy *= cap / m; }
          target = { x: spot.x + vx, y: spot.y + vy };
          if (j.deep) target.y = Math.max(target.y, best.y + 1.5);
          else target.y = Math.min(target.y, best.y - 0.5);
        }
      }
      // Deep with no threat yet: still don't overshoot past typical WR depth early
      if (j.deep && !best && t < 1.4) target.y = Math.min(spot.y, d.sy0 + 6 + t * 6);
    }
    if (brk) { target = { x: target.x + (brk.aim.x - target.x) * brk.w, y: target.y + (brk.aim.y - target.y) * brk.w }; vmax = Math.max(vmax * (1 - brk.w), brk.v * brk.w); ff = null; }
    if (X.includes('K')) moveToward(d, target, vmax, dt); else drive(d, target, vmax, dt, ff);
  }
  // Smooth movement: acceleration / braking limits (≈ 10 / 16 yd/s²) instead of instant velocity, so defenders round
  // their breaks and need a beat to get going; arrive-steering eases into a landmark instead of overshooting.
  const ACC_UP = 22, ACC_DN = 28; // v12: snappier accel/brake (was 15/20)
  const BREAK_R = 10, BREAK_V = Number((typeof process !== 'undefined' && process.env.V9BV) || 0.55); // v12: break react a bit harder
  function drive(d, target, vmax, dt, ff) {
    if (d.vx == null) { d.vx = 0; d.vy = 0; }
    const dx = target.x - d.x, dy = target.y - d.y, m = Math.hypot(dx, dy);
    // desired velocity: feed-forward (mirror the man) + proportional catch-up, or arrive-steering to a landmark
    let tx, ty;
    if (ff) { tx = ff.x + dx * 3; ty = ff.y + dy * 3; }
    else { const want = Math.min(vmax, Math.sqrt(2 * ACC_DN * 0.6 * m)); tx = m > 1e-6 ? dx / m * want : 0; ty = m > 1e-6 ? dy / m * want : 0; }
    const tm = Math.hypot(tx, ty); if (tm > vmax) { tx *= vmax / tm; ty *= vmax / tm; }
    let ax = tx - d.vx, ay = ty - d.vy; const am = Math.hypot(ax, ay);
    const sp = Math.hypot(d.vx, d.vy), lim = (Math.hypot(tx, ty) < sp ? ACC_DN : ACC_UP) * dt;
    if (am > lim) { ax *= lim / am; ay *= lim / am; }
    d.vx += ax; d.vy += ay;
    d.x += d.vx * dt; d.y += d.vy * dt;
  }

  function nearestDefender(sim, p) {
    let best = null, bd = Infinity;
    sim.defense.forEach((d) => { if (d.job.type === 'rush' || d.job.type === 'blitz') return; const dd = dist(d, p); if (dd < bd) { bd = dd; best = d; } });
    return { def: best, d: bd };
  }

  /** Advance the simulation by dt seconds. */
  function step(sim, dt) {
    if (sim.phase !== 'live' && sim.phase !== 'flight') return;
    sim.t += dt;
    const t = sim.t;
    if (sim.run && !sim.run.cancelled) { Run.step(sim, dt); return; }
    const q = sim.qbAt(t); sim.qb.x = q.x; sim.qb.y = q.y;
    sim.offense.forEach((p) => Object.assign(p, p.posAt(t)));
    sim.ol.forEach((o) => { const p = Prot.blockerPos(sim, o, t); o.x = p.x; o.y = p.y; });
    sim.defense.forEach((d) => stepDefender(d, sim, dt));

    if (sim.phase === 'live' && t >= sim.sackTime) {
      sim.phase = 'done';
      const sr = sim.prot && sim.prot.rows[0];
      sim.result = { type: 'sack', yards: -7, text: 'SACK', sackBy: sr && sr.rusher, sackKind: sr && sr.kind, sackMove: sr && sr.move };
    }
    if (sim.phase === 'flight') {
      const b = sim.ball;
      b.f = clamp((t - b.t0) / b.T, 0, 1);
      b.x = b.from.x + (b.to.x - b.from.x) * b.f; b.y = b.from.y + (b.to.y - b.from.y) * b.f;
      b.h = ballHeight(b, b.f);
      laneCheck(sim, dt);
      if (sim.phase === 'flight' && b.f >= 1) resolveCatch(sim);
    }
  }

  // ---------- ball flight / interception model ----------
  const CATCH_H = 3.3;      // max height (yd) a defender can play the ball (leap)
  const LANE_R = 1.6;       // yd: how close to the ball a defender must be to play it
  const INT_RATE = 3.2;     // hazard per second at zero distance, with leverage
  const PBU_RATE = 4.0;
  /** Same arc the renderer draws: release 2.2 yd, arrive at catch height, gravity-ish apex. */
  function ballHeight(b, f) {
    const apex = Math.max(1.2, b.T * b.T * 4.9 / 4);
    return 2.2 + (b.arriveH - 2.2) * f + 4 * apex * f * (1 - f);
  }
  /**
   * Every step of flight, every non-rushing defender is tested against the ball (not only the
   * target's defender). Hazard rises with proximity, leverage (between QB and catch point / in
   * front of the receiver), a late throw, and the difficulty multiplier.
   */
  function laneCheck(sim, dt) {
    const b = sim.ball, mul = (sim.opts && sim.opts.intMul) || 1;
    if (b.f < 0.12 || b.h > CATCH_H) return;          // still at QB / over everyone's head
    const late = Math.max(0, sim.throwInfo.late);
    const toQB = dist(b.target, b.from);
    for (const d of sim.defense) {
      if (d.job.type === 'rush' || d.job.type === 'blitz') continue;
      const dd = dist(d, b);
      if (dd > LANE_R) continue;
      const prox = 1 - dd / LANE_R;                    // 0..1
      const lev = dist(d, b.from) < toQB - 0.3 ? 1.5 : 0.7; // in front of the receiver = leverage
      const reach = 1 - Math.max(0, b.h - 2.4) / (CATCH_H - 2.4); // ball low enough to get hands on
      const k = prox * prox * lev * Math.max(0.2, reach) * mul * (1 + late * 0.8) * dt;
      const pInt = 1 - Math.exp(-INT_RATE * k), pPbu = 1 - Math.exp(-PBU_RATE * k);
      sim.intSurvive *= 1 - pInt;
      const r = sim.rng();
      if (r < pInt) return endInt(sim, d, b.f > 0.85 ? 'cover' : 'lane', dd);
      if (r < pInt + pPbu) {
        // Tipped ball: 25% pops up to someone, otherwise broken up.
        if (sim.rng() < 0.25 * mul) return endInt(sim, d, 'tip', dd);
        sim.phase = 'done';
        sim.result = { type: 'incomplete', yards: 0, sepAtCatch: dist(nearestDefender(sim, b.target).def || b.target, b.target), defender: d.id, cause: 'pbu', at: { x: b.x, y: b.y }, f: b.f, text: 'BROKEN UP' };
        return;
      }
    }
  }
  function endInt(sim, d, cause, dd) {
    const b = sim.ball;
    sim.phase = 'done';
    sim.result = { type: 'interception', yards: 0, sepAtCatch: nearestDefender(sim, b.target).d, defender: d.id, defLabel: d.label, cause, at: { x: b.x, y: b.y }, f: b.f, text: 'INTERCEPTED' };
  }
  function snap(sim) { if (sim.phase === 'presnap') sim.phase = 'live'; }

  /** Throw to a receiver: lead him to where he'll be when the ball arrives. */
  function throwTo(sim, id) {
    if (sim.phase !== 'live') return false;
    const r = sim.offense.find((p) => p.id === id);
    // v10: EVERY eligible receiver (WR/TE/RB, in the progression or not, even one kept in to block) can be thrown to.
    if (!r) return false;
    if (sim.run && !(sim.play.rpo && sim.play.rpo.target === id)) return false; // run plays: only the RPO tag
    const offRead = r.read < 0 && !(sim.play.rpo && sim.play.rpo.target === id);
    if (r.kept && !sim.run) {
      // a back/TE kept in to block: he has to come off his block (~0.35 s), then leaks to the flat on his side as a checkdown
      const t0 = sim.t, p0 = r.posAt(t0), side = (p0.x >= D.FIELD.ballX ? 1 : -1);
      r.posAt = (tt) => { const u = Math.max(0, tt - t0 - 0.35); return { x: p0.x + side * Math.min(5, u * 3.6), y: p0.y + Math.min(3, u * 2.2) }; };
      r.released = true;
    }
    if (sim.run) {
      // RPO: the throw is only available before the mesh is complete.
      if (!sim.play.rpo || sim.run.handed || sim.t > (sim.play.rpo.window || 0.6) || id !== sim.play.rpo.target) return false;
      sim.run.cancelled = true; sim.rpoThrow = true; sim.sackTime = sim.t + 2.2;
      sim.ol.forEach((o) => { o.sx = o.x; o.sy = o.y; });
      if (!sim.prot) sim.prot = { rows: [], free: [], kept: [], backs: [], sackTime: sim.sackTime };
      sim.defense.forEach((d) => { d.sx = d.x; d.sy = d.y; if (d.job.type === 'rush' || d.job.type === 'blitz') d.job = { type: 'zone', x: d.x, y: d.y, r: 1 }; });
    }
    const from = { x: sim.qb.x, y: sim.qb.y };
    let T = 0.5, to;
    for (let i = 0; i < 5; i++) { to = r.posAt(sim.t + T); T = dist(from, to) / BALL_SPEED + RELEASE; }
    to = r.posAt(sim.t + T);
    // Pressure: rushers near the QB / pocket clock running out -> accuracy error.
    const mul = (sim.opts && sim.opts.intMul) || 1;
    let near = Infinity;
    sim.defense.forEach((d) => { if (d.job.type === 'rush' || d.job.type === 'blitz') near = Math.min(near, dist(d, sim.qb)); });
    const pressure = clamp(Math.max((sim.t / sim.sackTime - 0.55) / 0.45, (3 - near) / 2.5), 0, 1);
    const errMag = pressure * (0.4 + 1.3 * sim.rng()) * (0.7 + 0.3 * mul);      // yards
    const along = sim.rng() < 0.5 ? -1 : 1;           // -1 underthrow, +1 sail
    const len = dist(from, to) || 1, ux = (to.x - from.x) / len, uy = (to.y - from.y) / len;
    const side = (sim.rng() - 0.5) * errMag * 0.8;
    to = { x: to.x + ux * along * errMag - uy * side, y: to.y + uy * along * errMag + ux * side };
    const miss = along > 0 && errMag > 0.6 ? 'sail' : along < 0 && errMag > 0.6 ? 'under' : null;
    sim.ball = { from, to, t0: sim.t, T, f: 0, x: from.x, y: from.y, h: 2.2, target: r, arriveH: miss === 'sail' ? 2.2 + errMag * 0.5 : 1.3 };
    const nd = nearestDefender(sim, r);
    sim.throwInfo = { id, time: sim.t, late: sim.t - (isFinite(sim.play.idealTime) ? sim.play.idealTime : 1.6), sepAtThrow: nd.d, pressure, errMag, miss, offRead, kept: !!r.kept };
    sim.intSurvive = 1;
    sim.phase = 'flight';
    return true;
  }

  /** Ball arrives: separation at the catch point, lateness, ball placement, leverage. */
  function resolveCatch(sim) {
    const b = sim.ball, r = b.target, qb = b.from, mul = (sim.opts && sim.opts.intMul) || 1, ti = sim.throwInfo;
    const { def, d } = nearestDefender(sim, b.to);
    const off = dist(r, b.to);                        // how far the ball is from the receiver's hands
    const undercut = def && dist(def, qb) < dist(r, qb) - 0.3;
    const late = Math.max(0, ti.late);
    // Contest: effective separation shrinks when the ball is off-target or late.
    const eff = d - off * 0.8 - late * 0.6;
    let pc, pi;
    if (off > 2.4) { pc = 0.05; pi = def && d < 2 ? 0.35 : 0.05; } // badly sailed / underthrown
    else if (eff >= 2.2) { pc = 0.94; pi = 0.005; }
    else if (eff >= 1.0) { pc = 0.2 + 0.6 * (eff - 1.0) / 1.2; pi = undercut ? 0.08 + 0.2 * late : 0.03; }
    else { pc = 0.12; pi = undercut ? 0.45 + 0.2 * late : 0.12 + 0.15 * late; }
    pi = Math.min(0.85, pi * 0.65 * mul);
    sim.intSurvive = (sim.intSurvive == null ? 1 : sim.intSurvive) * (1 - pi);
    const rnd = sim.rng();
    let type = rnd < pi ? 'interception' : rnd < pi + pc * (1 - pi) ? 'complete' : 'incomplete';
    let cause = null;
    if (type === 'interception') cause = ti.miss ? 'pressure' : late > 0.35 ? 'late' : 'cover';
    const yac = (r.route && r.route.yac) || 0;
    const yards = type === 'complete' ? Math.round(r.y + Math.min(d, 6) * 1.2 + yac * clamp(d / 4, 0.3, 1.1)) : 0;
    sim.phase = 'done';
    sim.result = { type, yards, sepAtCatch: dist(def || r, r), defender: def && def.id, defLabel: def && def.label, cause, at: { x: b.to.x, y: b.to.y }, f: 1,
      text: { complete: 'COMPLETE', incomplete: 'INCOMPLETE', interception: 'INTERCEPTED' }[type] };
  }

  /** Probability the throw could have been picked (0..1), accumulated over flight + catch point. */
  function intRisk(sim) { return sim.intSurvive == null ? 0 : 1 - sim.intSurvive; }

  /** Testing helper: separation of every receiver at catch point if thrown at time t. */
  function probeWindows(play, t, opts) {
    const out = {};
    (play.progression || []).forEach((id) => {
      const sim = createSim(play, () => 0.5, opts); snap(sim);
      if (sim.offense.find((p) => p.id === id).read < 0) { out[id] = 'kept'; return; }
      while (sim.t < t) step(sim, 1 / 60);
      if (sim.phase !== 'live') { out[id] = 'sack'; return; }
      throwTo(sim, id);
      while (sim.phase === 'flight') step(sim, 1 / 60);
      out[id] = sim.result.type === 'sack' ? 'sack' : +sim.result.sepAtCatch.toFixed(2);
    });
    return out;
  }

  /**
   * Auto best read: walk the progression and find, for each receiver, the earliest time his
   * catch-point separation is open (>= 2.4 yd) before the rush gets home. The first receiver in
   * the progression that opens (preferring earlier windows when the clock is short) is the answer.
   * Used for custom plays, audibles and the 'hot' rule when a blitz beats the protection.
   */
  function bestRead(play, opts, limit) {
    const probe = createSim(play, () => 0.5, opts);
    const sackT = probe.sackTime;
    const tMax = Math.min(limit != null ? limit : 3.1, sackT - 0.2);
    const pc = (sep) => clamp((sep - 0.8) / 2.2, 0, 1) * 0.95;
    const res = [];
    (play.progression || []).forEach((id, i) => {
      const p = probe.offense.find((x) => x.id === id); if (!p || p.read < 0) return;
      let best = null;
      for (let t = 0.6; t <= tMax + 1e-6; t += 0.2) {
        const sim = createSim(play, () => 0.5, opts); snap(sim);
        while (sim.t < t - 1e-6 && sim.phase === 'live') step(sim, 1 / 40);
        if (sim.phase !== 'live') break;
        throwTo(sim, id);
        while (sim.phase === 'flight') step(sim, 1 / 40);
        if (!sim.result || sim.result.type === 'sack') break;
        const sep = sim.result.sepAtCatch, depth = Math.max(0, sim.ball.to.y - probe.qb.sy * 0 - 0);
        const yac = (p.route && p.route.yac) || 0;
        const risk = clamp((t - (sackT - 0.9)) / 0.9, 0, 1) * 2; // throwing into the rush
        const ev = pc(sep) * (depth + 1.2 * Math.min(sep, 6) + yac * 0.6) - risk - (sim.result.intRisk || 0) * 8;
        if (!best || ev > best.ev + 0.05) best = { id, i, t: +t.toFixed(2), sep: +sep.toFixed(2), depth: +depth.toFixed(1), ev: +ev.toFixed(2), open: sep >= 2.4 };
      }
      if (best) res.push(best);
    });
    const top = Math.max(0, ...res.map((r) => r.ev));
    // progression order: the first read whose window is worth >= 80% of the best throw on the play
    const pick = res.find((r) => r.ev >= top * 0.8 && r.ev > 0) || res.sort((a, b) => b.ev - a.ev)[0] || null;
    return { pick, all: res, sackTime: sackT, ev: pick ? pick.ev : 0 };
  }

  const api = { createSim, step, snap, throwTo, intRisk, ballHeight, probeWindows, bestRead, nearestDefender, dist, resolveRoute, FEEL: { WR_SPEED, DB_SPEED, ZONE_SPEED, DEEP_DROP, MAN_LAG, BALL_SPEED, RELEASE, ACC_UP, ACC_DN, BREAK_V } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
