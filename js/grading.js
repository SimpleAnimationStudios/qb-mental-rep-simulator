/**
 * grading.js — pure grading for a finished rep (pass or run). Browser + Node.
 * gradeRep(ctx) -> { parts, max, score, lines:[[ok, html]], coach, correct, rec }
 * ctx: { sim, answers:{coverage, variant, pressFam, pressVar}, cfg:{timingSlack}, detailed, quickPressure,
 *        orig (play before audible, or null), audible:{id,label}|null, evals:{orig, alts:[{id,label,score}], chosen}, protTable }
 */
(function (root) {
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = root.QBData || req('./data.js'), E = root.QBEngine || req('./engine.js');
  const Prot = root.QBProt || req('./protections.js'), Run = root.QBRun || req('./runplay.js');
  const Reads = root.QBReads || req('./reads.js');
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const VAR = Object.fromEntries(D.VARIANTS.map((v) => [v.id, v]));
  const FAM = Object.fromEntries(D.PRESSURE_FAMILIES.map((f) => [f.id, f]));
  const POS = { C: 'cornerback', N: 'nickel', FS: 'free safety', SS: 'strong safety', W: 'Will linebacker', M: 'Mike linebacker', E: 'defensive end', T: 'defensive tackle', S: 'Sam linebacker', NT: 'nose tackle', DB: 'dime back' };
  const who = (sim, id) => { const d = sim.defense.find((x) => x.id === id); return d ? (POS[d.label] || d.label || id) : id; };

  /** v12: Crucible-style table/read-key first; bestRead fallback; hot overrides when blitz beats protection. */
  function correctRead(sim) {
    const play = sim.play;
    let correct = null, ideal = null, why = null, hot = false, source = 'authored';
    if (Reads && play.type !== 'run') {
      let base = Reads.resolveRead(play, sim.cov || play.coverage);
      if (base) base = Reads.applyReadKey(sim, base) || base;
      if (base && base.correct) { correct = base.correct; ideal = base.ideal; why = base.why; source = base.source; }
    }
    if (!correct) { correct = play.correct; ideal = play.idealTime; }
    const free = sim.prot ? sim.prot.free.filter((r) => r.arrive < (ideal || 2) + 0.15) : [];
    // Hot always wins when a free rusher beats the window; otherwise table stands; probe fills gaps / custom plays.
    if (free.length || !correct || play.probed || play.custom) {
      const b = E.bestRead(play, sim.opts, free.length ? free[0].arrive - 0.25 : undefined);
      if (b.pick) {
        if (free.length) {
          hot = true;
          if (b.pick.id !== correct) why = `${who(sim, free[0].rusher)} was unblocked and home at ${free[0].arrive.toFixed(1)}s — the hot answer is ${b.pick.id} at ${b.pick.t.toFixed(1)}s`;
          correct = b.pick.id; ideal = Math.min(b.pick.t, (ideal || 9)); source = 'hot';
        } else if (!correct || play.custom) {
          correct = b.pick.id; ideal = b.pick.t; source = 'probe'; why = why || 'probe fallback';
        }
      }
    }
    return { correct: correct || (play.progression || [])[0], ideal: ideal || 1.5, hot, why, source };
  }

  function pressureLine(sim, A, quick) {
    const bl = sim.blitz, famOk = A.pressFam === bl.family, varOk = famOk && (quick || A.pressVar === sim.play.pressure);
    const pts = quick ? (famOk ? 10 : 0) : (famOk ? 6 : 0) + (varOk ? 4 : 0);
    const called = A.pressFam ? (FAM[A.pressFam].name + (!quick && A.pressVar && D.BLITZES[A.pressVar] ? ' / ' + D.BLITZES[A.pressVar].name : '')) : 'no answer';
    return { pts, ok: varOk, line: `Pressure: you called <b>${called}</b> — it was <b>${bl.name}</b> (${sim.rushers} rushers)${famOk && !varOk ? ' (family credit)' : ''}`,
      tell: `${bl.name} tell: ${bl.tell}. Post-snap: ${bl.post}.` };
  }
  function coverageLine(sim, A, detailed) {
    const cov = sim.cov, covOk = A.coverage === cov.shell, varOk = covOk && A.variant === cov.variant;
    const aV = VAR[cov.variant], cV = VAR[A.variant];
    const label = (id) => (D.COVERAGE_OPTIONS.find((o) => o.id === id) || { label: 'no answer' }).label;
    const pts = detailed ? (covOk ? 12 : 0) + (varOk ? 8 : 0) : covOk ? 20 : 0;
    const lines = [[covOk, `Family: you called <b>${label(A.coverage)}</b> — it was <b>${label(cov.shell)}</b>`]];
    if (detailed) lines.push([varOk, `Variant: you called <b>${cV ? cV.name : 'no variant'}</b> — it was <b>${aV.name}</b>${covOk && !varOk ? ' (family credit only)' : ''}`]);
    let tell = `${aV.name}: ${aV.tell}. After the snap: ${aV.post}.`;
    if (detailed && covOk && !varOk && cV) tell = `That's ${aV.name} rather than ${cV.name} — tell: ${aV.tell}. ${cV.name} would show ${cV.tell}.`;
    else if (detailed && varOk) tell = `Nailed the variant. ${aV.name} tell: ${aV.tell}.`;
    // v11: front ID removed from the Coverage bubble / Coverage ID grade (fronts still align the defense; Film Room only)
    return { pts, covOk, varOk, lines, tell };
  }
  function protectionPart(sim, table) {
    if (!sim.prot || !table || !table.length) return null;
    const mine = table.find((r) => r.id === sim.protId), best = table[0];
    const P = Prot.PROT[sim.protId];
    let pts, ok;
    if (mine.value >= best.value - 0.6) { pts = 10; ok = true; } else if (!mine.freeEarly.length) { pts = 6; ok = false; } else if (mine.hotOk) { pts = 5; ok = false; } else { pts = 0; ok = false; }
    const fr = sim.prot.free[0];
    let expl = fr ? `Free rusher: <b>${who(sim, fr.rusher)}</b> (${fr.kind === 'late' ? 'picked up late' : fr.move}) home at ${fr.arrive.toFixed(1)}s.` : `Everyone blocked — pocket ${sim.prot.sackTime.toFixed(1)}s (${sim.prot.rows[0] ? who(sim, sim.prot.rows[0].rusher) + ' wins first with a ' + sim.prot.rows[0].move : ''}).`;
    const line = `Protection: <b>${P.name}</b> — ${ok ? 'right call' : 'best was <b>' + Prot.PROT[best.id].name + '</b>'}${best.freeEarly.length ? '' : ` (${best.sackTime.toFixed(1)}s, nobody free)`}. ${expl}`;
    return { pts, ok, line, best: best.id, note: `${P.desc}` };
  }
  function audiblePart(ctx) {
    const ev = ctx.evals; if (!ev) return { pts: 0, line: null, coach: '' };
    const best = [ev.orig, ...ev.alts].reduce((a, b) => (b.score > a.score ? b : a));
    const bestAlt = ev.alts.reduce((a, b) => (b.score > a.score ? b : a), { score: -99 });
    const ran = ctx.audible;
    const sneakOk = ev.orig.run === 'SNEAK' && ev.orig.score >= 1.5;
    const needed = !sneakOk && bestAlt.score > ev.orig.score + 1.5;
    if (ran) {
      const ch = ev.alts.find((a) => a.id === ran.id) || ev.chosen;
      if (ch.score >= best.score - 0.75 && ch.score > ev.orig.score + 0.5) return { pts: 10, ok: true, line: `Audible: <b>${ev.orig.label} → ${ch.label}</b> — right check (+10). ${ch.note}`, coach: `Good check: ${ch.note}.` };
      if (ch.score < ev.orig.score - 1) return { pts: -10, ok: false, line: `Audible: <b>${ev.orig.label} → ${ch.label}</b> — checked out of the better play (−10). Original: ${ev.orig.note}`, coach: `The original call was better here: ${ev.orig.note}.` };
      return { pts: 0, ok: true, line: `Audible: <b>${ev.orig.label} → ${ch.label}</b> — neutral (best was ${best.label}).`, coach: '' };
    }
    if (needed) return { pts: -5, ok: false, line: `Audible: kept <b>${ev.orig.label}</b> — should have checked to <b>${bestAlt.label}</b> (−5). ${bestAlt.note}`, coach: `Check-with-me: ${bestAlt.label} — ${bestAlt.note}.` };
    return { pts: 0, ok: true, line: `Audible: kept <b>${ev.orig.label}</b> — right to stay with it.`, coach: '' };
  }

  function gradeRep(ctx) {
    const { sim, answers: A, cfg } = ctx; const play = sim.play, res = sim.result;
    const justRead = !!ctx.justRead;
    const cv = coverageLine(sim, A, ctx.detailed), pr = pressureLine(sim, A, ctx.quickPressure);
    const au = audiblePart(ctx);
    const lines = justRead ? [[true, `Coverage (revealed): <b>${(D.VARIANTS.find((v)=>v.id===sim.cov.variant)||{}).name || sim.cov.shell}</b> — not graded in Just read`]] : [...cv.lines, [pr.ok, pr.line]];
    let parts, max, coach, correct = null;
    if (play.type === 'run' && !sim.rpoThrow) {
      const v = Run.verdict(sim, play.togo);
      const y = res.yards;
            if (justRead) {
        parts = { 'Run decision': v.good ? 55 : v.marginal ? 25 : 0, 'Outcome': res.type === 'fumble' ? 0 : Math.round(45 * clamp((y + 2) / 10, 0, 1)), 'Ball security': res.type === 'fumble' ? -25 : 0 };
        max = { 'Run decision': 55, 'Outcome': 45 };
      } else {
        parts = { 'Coverage ID': cv.pts, 'Pressure ID': pr.pts, 'Run decision': v.good ? 35 : v.marginal ? 15 : 0, 'Outcome': res.type === 'fumble' ? 0 : Math.round(35 * clamp((y + 2) / 10, 0, 1)), 'Audible': au.pts, 'Ball security': res.type === 'fumble' ? -25 : 0 };
        max = { 'Coverage ID': 20, 'Pressure ID': 10, 'Run decision': 35, 'Outcome': 35 };
      }
      lines.push([v.good, `Run call: <b>${Run.RUN_CONCEPTS[sim.run.concept].name}</b> — ${v.good ? 'right option' : v.marginal ? 'marginal' : 'wrong option'} (expected ${v.ev.toFixed(1)} yd). ${v.why}`]);
      lines.push([y >= 4, `Result: ${res.text}${res.tackler ? ' — tackled by the ' + who(sim, res.tackler) : ''}`]);
      coach = `${v.why} ${play.coaching || ''}`;
    } else {
      const ti = sim.throwInfo, cr = correctRead(sim); correct = cr.correct;
      const readOk = !!ti && ti.id === cr.correct;
      const rp = ti ? sim.offense.find((p) => p.id === ti.id) : null, readN = rp ? rp.read : -1;
      const time = ti ? ti.time : sim.t, late = ti ? time - cr.ideal : 99;
      const pp = protectionPart(sim, ctx.protTable);
      const risk = ti ? E.intRisk(sim) : 0;
      if (justRead) {
        parts = { 'Read': readOk ? 45 : ti && readN >= 0 ? 12 : 0,
          'Timing': ti ? Math.round(25 * clamp(1 - (Math.abs(late) - cfg.timingSlack) / 1.0, 0, 1)) : 0,
          'Outcome': res.type === 'complete' ? Math.min(30, 18 + Math.round(Math.min(res.yards, 16) / 2)) : res.type === 'incomplete' ? 8 : 0,
          'Ball security': res.type === 'interception' ? -15 : -Math.round(Math.min(15, risk * 40)) };
        max = { 'Read': 45, 'Timing': 25, 'Outcome': 30 };
      } else {
        parts = { 'Coverage ID': cv.pts, 'Pressure ID': pr.pts, 'Protection': pp ? pp.pts : 10, 'Read': readOk ? 25 : ti && readN >= 0 ? 8 : 0,
          'Timing': ti ? Math.round(15 * clamp(1 - (Math.abs(late) - cfg.timingSlack) / 1.0, 0, 1)) : 0,
          'Outcome': res.type === 'complete' ? Math.min(20, 12 + Math.round(Math.min(res.yards, 16) / 2)) : res.type === 'incomplete' ? 5 : 0,
          'Audible': au.pts, 'Ball security': res.type === 'interception' ? -10 : -Math.round(Math.min(15, risk * 40)) };
        max = { 'Coverage ID': 20, 'Pressure ID': 10, 'Protection': 10, 'Read': 25, 'Timing': 15, 'Outcome': 20 };
      }
      if (pp) lines.push([pp.ok, pp.line]);
      lines.push([readOk, ti ? `Read: threw to <b>${ti.id}</b> (${readN >= 0 ? ['1st', '2nd', '3rd', 'check-down', '5th'][Math.min(4, readN)] + ' read' : rp && rp.kept ? 'not in progression — kept in to block, released as a checkdown' : 'not in progression'}); best was <b>${cr.correct}</b>${cr.hot ? ' (HOT — blitz beat the protection)' : ''}` : `Read: no throw — best was <b>${cr.correct}</b>`]);
      lines.push([parts.Timing >= 10, ti ? `Timing: <b>${time.toFixed(2)}s</b> (on-time ≈ ${cr.ideal.toFixed(1)}s, ${late > 0 ? '+' : ''}${late.toFixed(2)}s)` : res.type === 'sack' ? `Sacked at ${sim.t.toFixed(1)}s${res.sackBy ? ' by the ' + who(sim, res.sackBy) + ' (' + res.sackMove + ')' : ''}` : 'No throw']);
      coach = (cr.why ? 'HOT: ' + cr.why + '. ' : '') + (play.coaching || '');
      if (!readOk && res.type === 'complete') coach = 'Completed, but not the best read — you got away with one. ' + coach;
      if (pp && !pp.ok) coach = `Protection: ${Prot.PROT[pp.best].name} was the call — ${Prot.PROT[pp.best].desc} ` + coach;
      if (ti && readN < 0) coach = (rp && rp.kept ? `${ti.id} was kept in to block — throwing to him means he has to come off his block first, so the ball is late to a covered flat. ` : `${ti.id} was not in the progression for this play (he's clearing space / a decoy) — legal, but you left the designed read. `) + coach;
      if (ti) coach += ` (Separation at throw ${ti.sepAtThrow.toFixed(1)} yd, at catch ${res.sepAtCatch.toFixed(1)} yd.)`;
      ctx.risk = risk; ctx.readOk = readOk; ctx.time = time; ctx.ideal = cr.ideal;
    }
    if (au.line) lines.push([au.ok, au.line]);
    coach = `${cv.tell} ${pr.tell} ${au.coach || ''} ${coach}`.replace(/\s+/g, ' ').trim();
    const score = clamp(Object.values(parts).reduce((a, b) => a + b, 0), 0, 100);
    return { parts, max, score, lines, coach, correct, covOk: cv.covOk, varOk: cv.varOk, presOk: pr.ok, readOk: !!ctx.readOk, risk: ctx.risk || 0, time: ctx.time || sim.t, ideal: ctx.ideal == null ? null : ctx.ideal };
  }

  const api = { gradeRep, correctRead };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBGrade = api;
})(typeof window !== 'undefined' ? window : globalThis);
