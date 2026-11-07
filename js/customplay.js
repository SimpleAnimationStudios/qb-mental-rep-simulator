/**
 * customplay.js — Custom play designer (compact form + tap-to-place mini field).
 * Storage: localStorage 'pocketiq3d.customPlays.v1' = [play]. Export / import JSON.
 * Custom passes have no authored best read unless set: grading probes the engine (bestRead) vs the chosen defence.
 */
(function (root) {
  const KEY = 'pocketiq3d.customPlays.v1';
  const D = root.QBData;
  const ELIG = ['X', 'H', 'Y', 'Z', 'RB'];
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; } };
  const save = (a) => localStorage.setItem(KEY, JSON.stringify(a));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const routeIds = () => Object.keys(D.ROUTES);
  const blank = () => ({ id: 'c_' + Date.now().toString(36), name: 'My play', type: 'pass', formation: 'doubles', coverage: 'random', pressure: 'random', protection: 'BOB',
    routes: { X: 'go', H: 'slant', Y: 'stick', Z: 'curl', RB: 'flat' }, order: { X: 3, H: 1, Y: 2, Z: 0, RB: 4 }, correct: 'auto', idealTime: '', run: { concept: 'IZ', carrier: 'RB', scheme: '', dir: 'R' }, custom: true });
  let cur = blank(), sel = 'H';

  /** Convert a designer record to an engine play (resolving random defence). */
  function toPlay(c) {
    const covs = Object.keys(D.COVERAGES), bl = Object.keys(D.BLITZES);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    let coverage = c.coverage === 'random' ? pick(covs) : c.coverage;
    let pressure = c.pressure === 'random' ? pick(bl) : c.pressure;
    const ids = Object.keys((D.BLITZES[pressure] || {}).set || {});
    if (!ids.every((id) => D.COVERAGES[coverage].defenders.some((d) => d.id === id))) { // blitz needs its defenders: fall back to a compatible look
      const ok = covs.filter((k) => ids.every((id) => D.COVERAGES[k].defenders.some((d) => d.id === id)));
      if (c.coverage === 'random' && ok.length) coverage = pick(ok); else if (c.pressure === 'random') pressure = 'NONE'; else if (ok.length) coverage = ok[0];
    }
    if (pressure === 'ZERO' && c.coverage === 'random') coverage = 'cover0';
    const base = { id: c.id, name: c.name, custom: true, formation: c.formation, coverage, pressure, protection: c.protection || 'BOB', coaching: `Custom play "${c.name}" vs ${D.COVERAGES[coverage].name || coverage}. Best read and timing were probed by the engine against this look.` };
    if (c.type === 'run') {
      const R = { X: 'stalk', Z: 'stalk', H: c.formation === 'iform' ? 'lead' : 'stalk', Y: 'block', RB: 'block' };
      return { ...base, type: 'run', run: { concept: c.run.concept, carrier: c.run.concept === 'SNEAK' ? 'QB' : c.run.carrier || 'RB', scheme: c.run.scheme || undefined, dir: c.run.dir }, routes: R, progression: [], coaching: base.coaching.replace('Best read and timing were probed', 'Run grade compares box count, front and shell') };
    }
    const routes = {}; ELIG.forEach((id) => { const r = c.routes[id]; routes[id] = r; });
    const prog = ELIG.filter((id) => c.order[id] > 0 && !(D.ROUTES[typeof routes[id] === 'string' ? routes[id] : (routes[id].base || 'hitch')] || {}).block).sort((a, b) => c.order[a] - c.order[b]);
    return { ...base, type: 'pass', routes, progression: prog.length ? prog : ['H'], correct: c.correct && c.correct !== 'auto' ? c.correct : null, idealTime: c.idealTime ? +c.idealTime : null,
      pa: !!c.pa, screen: ELIG.some((id) => /Screen|bubble/i.test(typeof routes[id] === 'string' ? routes[id] : routes[id].base || '')) };
  }
  function validate(c) {
    if (!c || typeof c !== 'object' || !c.name || !D.FORMATIONS[c.formation]) return 'missing name/formation';
    if (c.coverage !== 'random' && !D.COVERAGES[c.coverage]) return 'unknown coverage ' + c.coverage;
    if (c.pressure !== 'random' && !D.BLITZES[c.pressure]) return 'unknown pressure ' + c.pressure;
    if (c.type !== 'run' && !ELIG.some((id) => c.order && c.order[id] > 0)) return 'set a progression';
    return null;
  }

  // ---------------- UI ----------------
  const $ = (id) => document.getElementById(id);
  function opt(list, v) { return list.map(([k, l]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(l)}</option>`).join(''); }
  function routeVal(r) { return typeof r === 'string' ? { base: r, depth: 1, flip: false } : { base: r.pts ? 'custom' : r.base, depth: r.depth || 1, flip: !!r.flip, pts: r.pts }; }
  function render() {
    const el = $('designer'); const c = cur, isRun = c.type === 'run';
    const forms = Object.entries(D.FORMATIONS).map(([k, f]) => [k, f.name]);
    const covs = [['random', 'Random'], ...Object.entries(D.COVERAGES).map(([k, v]) => [k, (v.name || k) + (v.front ? ' · ' + v.front : '')])];
    const prs = [['random', 'Random'], ...Object.entries(D.BLITZES).map(([k, b]) => [k, b.name])];
    const prots = (root.QBProt ? root.QBProt.PROTECTIONS : []).map((p) => [p.id, p.name]);
    const rlist = routeIds().map((k) => [k, D.ROUTES[k].name || k]);
    const rows = ELIG.map((id) => {
      const r = routeVal(c.routes[id]);
      return `<tr data-id="${id}" class="${sel === id ? 'sel' : ''}"><td><button class="ghost tiny pick" data-id="${id}">${id}</button></td>
        <td><select data-k="route" data-id="${id}">${opt([...rlist, ...(r.pts ? [['custom', 'Custom (tapped)']] : [])], r.base)}</select></td>
        <td><input type="range" min="0.6" max="1.5" step="0.1" value="${r.depth}" data-k="depth" data-id="${id}" title="depth ×${r.depth}"></td>
        <td><label><input type="checkbox" data-k="flip" data-id="${id}"${r.flip ? ' checked' : ''}>flip</label></td>
        <td><select data-k="order" data-id="${id}">${opt([[0, '—'], [1, '1st'], [2, '2nd'], [3, '3rd'], [4, 'CD']].map(([a, b]) => [String(a), b]), String(c.order[id] || 0))}</select></td></tr>`;
    }).join('');
    const lib = load();
    el.innerHTML = `<div class="ph"><span>CUSTOM PLAY DESIGNER</span><button id="cd-close" class="ghost small">✕</button></div>
      <div class="dgrid"><div>
        <label>Name <input type="text" id="cd-name" value="${esc(c.name)}" maxlength="40"></label>
        <label>Type <select id="cd-type">${opt([['pass', 'Pass'], ['run', 'Run']], c.type)}</select>
          Formation <select id="cd-form">${opt(forms, c.formation)}</select></label>
        <label>Defence <select id="cd-cov">${opt(covs, c.coverage)}</select></label>
        <label>Pressure <select id="cd-pres">${opt(prs, c.pressure)}</select></label>
        ${isRun ? `<label>Concept <select id="cd-con">${opt(Object.entries(root.QBRun.RUN_CONCEPTS).map(([k, v]) => [k, v.name]), c.run.concept)}</select>
          Dir <select id="cd-dir">${opt([['R', 'Right'], ['L', 'Left']], c.run.dir)}</select></label>
          <label>Carrier <select id="cd-car">${opt([['RB', 'RB'], ['QB', 'QB']], c.run.carrier)}</select>
          Blocking <select id="cd-sch">${opt([['', 'Concept default'], ['zone', 'Zone'], ['gap', 'Gap / power'], ['man', 'Man']], c.run.scheme || '')}</select></label>`
        : `<label>Protection <select id="cd-prot">${opt(prots, c.protection)}</select> <label style="display:inline"><input type="checkbox" id="cd-pa"${c.pa ? ' checked' : ''}> play-action</label></label>
          <table>${rows}</table>
          <label>Ideal read <select id="cd-cor">${opt([['auto', 'Auto (engine probe)'], ...ELIG.map((i) => [i, i])], c.correct || 'auto')}</select>
            time <input type="number" id="cd-it" step="0.1" min="0.4" max="4" value="${esc(c.idealTime || '')}" placeholder="auto" style="width:60px"></label>`}
      </div><div>
        ${isRun ? '<p>Runs are graded on the call: box count vs blockers, front and shell.</p>' : `<canvas id="cd-field" width="330" height="264"></canvas>
        <div class="hint">Tap a player (or the letter) to select · tap the field to add route points for <b>${sel}</b> · <button class="ghost tiny" id="cd-clr">Clear path</button></div>`}
        <div class="row" style="margin-top:6px"><button class="primary" id="cd-run">▶ Run it</button><button class="ghost" id="cd-save">Save</button><button class="ghost" id="cd-new">New</button></div>
        <div class="msg" id="cd-msg"></div>
        <div class="lbl">Saved plays (${lib.length})</div>
        <div class="lib">${lib.map((p, i) => `<div><span>${esc(p.name)} <small>${p.type}</small></span><button class="ghost tiny" data-a="load" data-i="${i}">Edit</button><button class="ghost tiny" data-a="play" data-i="${i}">▶</button><button class="ghost tiny" data-a="ren" data-i="${i}">Rename</button><button class="ghost tiny" data-a="del" data-i="${i}">✕</button></div>`).join('') || '<i>none yet</i>'}</div>
        <div class="row" style="margin-top:6px"><button class="ghost small" id="cd-exp">Export JSON</button><button class="ghost small" id="cd-imp">Import JSON</button></div>
        <textarea id="cd-json" rows="3" style="width:100%;display:none;font-size:10px;background:#0b1520;color:#e8eef5" placeholder="paste exported JSON here, then Import again"></textarea>
      </div></div>`;
    bind(); drawField();
  }
  function bind() {
    const c = cur, on = (id, ev, f) => { const e = $(id); if (e) e[ev] = f; };
    on('cd-close', 'onclick', close);
    on('cd-name', 'oninput', (e) => (c.name = e.target.value));
    on('cd-type', 'onchange', (e) => { c.type = e.target.value; render(); });
    on('cd-form', 'onchange', (e) => { c.formation = e.target.value; render(); });
    on('cd-cov', 'onchange', (e) => (c.coverage = e.target.value));
    on('cd-pres', 'onchange', (e) => (c.pressure = e.target.value));
    on('cd-prot', 'onchange', (e) => (c.protection = e.target.value));
    on('cd-pa', 'onchange', (e) => (c.pa = e.target.checked));
    on('cd-con', 'onchange', (e) => (c.run.concept = e.target.value));
    on('cd-dir', 'onchange', (e) => (c.run.dir = e.target.value));
    on('cd-car', 'onchange', (e) => (c.run.carrier = e.target.value));
    on('cd-sch', 'onchange', (e) => (c.run.scheme = e.target.value));
    on('cd-cor', 'onchange', (e) => (c.correct = e.target.value));
    on('cd-it', 'oninput', (e) => (c.idealTime = e.target.value));
    on('cd-clr', 'onclick', () => { c.routes[sel] = 'hitch'; render(); });
    on('cd-new', 'onclick', () => { cur = blank(); render(); });
    on('cd-save', 'onclick', () => { const err = validate(c); if (err) return msg(err); const lib = load(); const i = lib.findIndex((p) => p.id === c.id); if (i >= 0) lib[i] = JSON.parse(JSON.stringify(c)); else lib.push(JSON.parse(JSON.stringify(c))); save(lib); render(); msg('Saved.'); });
    on('cd-run', 'onclick', () => runIt(c));
    on('cd-exp', 'onclick', () => { const t = $('cd-json'); t.style.display = 'block'; t.value = JSON.stringify(load(), null, 1); t.select(); msg('Copy the JSON (also downloaded).'); try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t.value], { type: 'application/json' })); a.download = 'pocketiq-custom-plays.json'; a.click(); } catch (e) {} });
    on('cd-imp', 'onclick', () => { const t = $('cd-json'); if (t.style.display !== 'block' || !t.value.trim()) { t.style.display = 'block'; t.focus(); return msg('Paste JSON, then press Import again.'); } msg(importJSON(t.value)); render(); });
    document.querySelectorAll('#designer [data-k]').forEach((e) => {
      const id = e.dataset.id, k = e.dataset.k;
      e.onchange = e.oninput = () => {
        if (k === 'order') { c.order[id] = +e.value; return; }
        const r = routeVal(c.routes[id]);
        if (k === 'route') { c.routes[id] = e.value === 'custom' ? c.routes[id] : (r.depth !== 1 || r.flip ? { base: e.value, depth: r.depth, flip: r.flip } : e.value); }
        if (k === 'depth') { c.routes[id] = r.pts ? { ...c.routes[id], depth: +e.value } : { base: r.base, depth: +e.value, flip: r.flip }; e.title = 'depth ×' + e.value; }
        if (k === 'flip') { c.routes[id] = r.pts ? { ...c.routes[id], flip: e.checked } : { base: r.base, depth: r.depth, flip: e.checked }; }
        drawField();
      };
    });
    document.querySelectorAll('#designer .pick').forEach((b) => (b.onclick = () => { sel = b.dataset.id; render(); }));
    document.querySelectorAll('#designer .lib button').forEach((b) => (b.onclick = () => {
      const lib = load(), i = +b.dataset.i, p = lib[i];
      if (b.dataset.a === 'load') { cur = JSON.parse(JSON.stringify(p)); render(); }
      if (b.dataset.a === 'play') runIt(p);
      if (b.dataset.a === 'ren') { const n = prompt('Rename play', p.name); if (n) { p.name = n.slice(0, 40); save(lib); render(); } }
      if (b.dataset.a === 'del') { if (confirm(`Delete "${p.name}"?`)) { lib.splice(i, 1); save(lib); render(); } }
    }));
    const cv = $('cd-field'); if (cv) cv.onpointerdown = (e) => fieldTap(e, cv);
  }
  const msg = (t) => { const m = $('cd-msg'); if (m) m.textContent = t; };
  function importJSON(txt) {
    let arr; try { arr = JSON.parse(txt); } catch (e) { return 'Invalid JSON.'; }
    if (!Array.isArray(arr)) arr = [arr];
    const lib = load(); let n = 0; const errs = [];
    arr.forEach((p) => { const err = validate(p); if (err) { errs.push(err); return; } p.custom = true; if (!p.id) p.id = 'c_' + Math.random().toString(36).slice(2, 8); const i = lib.findIndex((q) => q.id === p.id); if (i >= 0) lib[i] = p; else lib.push(p); n++; });
    save(lib); return `Imported ${n} play(s)${errs.length ? ', skipped ' + errs.length + ' (' + errs[0] + ')' : ''}.`;
  }
  function runIt(c) {
    const err = validate(c); if (err) return msg(err);
    const play = toPlay(c); close();
    if (root.__qb3d) root.__qb3d.startPlay(play);
  }
  // ---- mini field (top-down): x 0..53.3 -> canvas, y -9..23 ----
  const FX = (x, w) => (x / 53.3) * w, FY = (y, h) => h - ((y + 9) / 32) * h;
  const IX = (px, w) => (px / w) * 53.3, IY = (py, h) => (h - py) / h * 32 - 9;
  function drawField() {
    const cv = $('cd-field'); if (!cv) return; const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.fillStyle = '#1f5a2a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff33'; for (let y = -5; y <= 20; y += 5) { g.beginPath(); g.moveTo(0, FY(y, h)); g.lineTo(w, FY(y, h)); g.stroke(); }
    g.strokeStyle = '#3b82f6'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, FY(0, h)); g.lineTo(w, FY(0, h)); g.stroke(); g.lineWidth = 1;
    const play = toPlay({ ...cur, coverage: cur.coverage === 'random' ? 'cover3' : cur.coverage, pressure: cur.pressure === 'random' ? 'NONE' : cur.pressure });
    let sim; try { sim = root.QBEngine.createSim(play, () => 0.5, { seed: 3, protection: play.protection, _probe: true }); } catch (e) { return; }
    sim.defense.forEach((d) => { g.fillStyle = '#ff6b6b'; g.font = 'bold 9px sans-serif'; g.fillText(d.label || d.id, FX(d.sx, w) - 5, FY(d.sy, h) + 3); });
    sim.ol.forEach((o) => { g.fillStyle = '#9db7ff'; g.fillRect(FX(o.sx, w) - 3, FY(o.sy, h) - 3, 6, 6); });
    const cols = { 1: '#3ee08f', 2: '#ffd23f', 3: '#4fb3ff', 4: '#ff7ad9' };
    sim.offense.forEach((p) => {
      const col = cols[cur.order[p.id]] || '#ffffff';
      g.strokeStyle = col; g.lineWidth = p.id === sel ? 3 : 1.6; g.beginPath();
      for (let t = 0; t <= 3.6; t += 0.1) { const q = p.posAt(t); const X = FX(q.x, w), Y = FY(q.y, h); t ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
      g.fillStyle = p.id === sel ? '#ffd23f' : '#fff'; g.beginPath(); g.arc(FX(p.sx0, w), FY(p.sy0, h), 6, 0, 7); g.fill();
      g.fillStyle = '#111'; g.font = 'bold 8px sans-serif'; g.fillText(p.id, FX(p.sx0, w) - (p.id.length > 1 ? 5 : 3), FY(p.sy0, h) + 3);
    });
    g.fillStyle = '#fff'; g.beginPath(); g.arc(FX(sim.qb.sx, w), FY(sim.qb.sy, h), 5, 0, 7); g.fill();
    cv._sim = sim;
  }
  function fieldTap(e, cv) {
    const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height;
    const sim = cv._sim; if (!sim) return;
    const hit = sim.offense.find((p) => Math.hypot(FX(p.sx0, cv.width) - px, FY(p.sy0, cv.height) - py) < 10);
    if (hit) { sel = hit.id; render(); return; }
    const p = sim.offense.find((q) => q.id === sel); if (!p) return;
    const x = IX(px, cv.width), y = IY(py, cv.height);
    const r0 = routeVal(cur.routes[sel]);
    const pts = r0.pts ? r0.pts.slice() : [];
    pts.push([+((x - p.sx0) / p.dir).toFixed(1), +(y - p.sy0).toFixed(1)]);
    cur.routes[sel] = { name: 'Custom', pts, depth: 1, flip: false };
    if (!cur.order[sel]) cur.order[sel] = Math.max(0, ...Object.values(cur.order).filter((v) => v < 4)) + 1;
    render();
  }
  function open() { render(); $('designer').hidden = false; }
  function close() { $('designer').hidden = true; }
  const api = { open, close, toPlay, load, save, importJSON, validate, KEY, get current() { return cur; }, set current(v) { cur = v; } };
  root.QBCustom = api;
})(window);
