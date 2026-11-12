/**
 * routeart.js — v14 playbook-style route art for the hold-to-show ROUTES overlay (pure geometry; browser + Node).
 * Built from the authored route waypoints (the exact break points the engine runs), not from sampled sim positions:
 * straight segments with crisp breaks, rounded arcs only on routes that really curve (wheel, swing/flat, screens, arrow),
 * short comebacks kept visible as hooks, lines start at the receiver's feet, block assignments end in a T bar.
 * Falls back to a simplified (Douglas-Peucker) trace of posAt() if a path was rebuilt by something other than buildPath.
 * Display only; route mechanics are untouched.
 */
(function (root) {
  const req = (n) => (typeof require !== 'undefined' ? require(n) : null);
  const D = root.QBData || req('./data.js');
  const CURVED = /^(Wheel|Check-down|RB screen|Bubble|Arrow|Flat|Texas|Boot flat)/i;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function segDist(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = L ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L, 0, 1) : 0; return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }
  const polyDist = (p, pts) => { let m = Infinity; for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(p, pts[i - 1], pts[i])); return pts.length === 1 ? d2(p, pts[0]) : m; };
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let idx = 0, mx = 0; for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > mx) { mx = d; idx = i; } }
    if (mx <= eps) return [pts[0], pts[pts.length - 1]];
    const a = rdp(pts.slice(0, idx + 1), eps), b = rdp(pts.slice(idx), eps); return a.slice(0, -1).concat(b);
  }
  /** authored break points for a sim offense player, or null if its path isn't the plain waypoint path. */
  function waypoints(p) {
    const r = p.route; if (!r || !r.pts || !p.posAt) return null;
    const s = p.posAt(0), dir = p.dir || 1, W = (D && D.FIELD && D.FIELD.width) || 53.3;
    const wps = [{ x: s.x, y: s.y }].concat(r.pts.map(([dx, dy]) => ({ x: clamp(s.x + dx * dir, 1, W - 1), y: s.y + dy })));
    for (let t = 0; t <= 6; t += 0.1) { const q = p.posAt(t); if (polyDist(q, wps) > 0.08) return null; }
    return wps;
  }
  function trace(p) { const pts = []; for (let t = 0; t <= 4.2; t += 0.05) { const q = p.posAt(t); if (!pts.length || d2(q, pts[pts.length - 1]) > 0.05) pts.push({ x: q.x, y: q.y }); } return rdp(pts, 0.3); }
  const turn = (a, b, c) => { const u = Math.atan2(b.y - a.y, b.x - a.x), v = Math.atan2(c.y - b.y, c.x - b.x); let t = Math.abs(v - u); if (t > Math.PI) t = 2 * Math.PI - t; return t; };
  /** clean up: merge sub-yard jogs, keep comebacks visible (>= 1 yd), drop tiny settles. */
  function tidy(pts) {
    let out = [pts[0]];
    for (let i = 1; i < pts.length; i++) { const last = i === pts.length - 1, prev = out[out.length - 1], L = d2(prev, pts[i]);
      if (L < 0.05) continue;
      if (!last && L < 0.8 && out.length > 1) { out[out.length - 1] = { x: (prev.x + pts[i].x) / 2, y: (prev.y + pts[i].y) / 2 }; continue; }
      out.push(pts[i]); }
    if (out.length > 2) { const n = out.length, a = out[n - 3], b = out[n - 2], c = out[n - 1], L = d2(b, c);
      if (turn(a, b, c) > 2.0) { if (L < 1) out[n - 1] = { x: b.x + (c.x - b.x) / L * 1, y: b.y + (c.y - b.y) / L * 1 }; } // hook / comeback: at least 1 yd
      else if (L < 0.6) out.pop(); }
    return out;
  }
  /** fillet corners: radius r where the turn is gentle or the route curves; crisp elsewhere. */
  function fillet(pts, curved) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1], th = turn(a, b, c);
      const want = curved ? (th < 2.0 ? 3 : 0) : th < 0.35 ? 2 : 0; if (!want || th < 0.02) { out.push(b); continue; }
      const k = Math.min(want, d2(a, b) * 0.45, d2(b, c) * 0.45);
      const p0 = { x: b.x + (a.x - b.x) / d2(a, b) * k, y: b.y + (a.y - b.y) / d2(a, b) * k }, p1 = { x: b.x + (c.x - b.x) / d2(b, c) * k, y: b.y + (c.y - b.y) / d2(b, c) * k };
      for (let s = 0; s <= 8; s++) { const t = s / 8, u = 1 - t; out.push({ x: u * u * p0.x + 2 * u * t * b.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * b.y + t * t * p1.y }); }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  /** -> { pts:[{x,y}] (engine yards), end:'arrow'|'tbar', curved, source:'authored'|'trace', breaks } or null (nothing to draw) */
  function art(p) {
    const r = p.route || {}, wp = waypoints(p), raw = wp || trace(p), block = !!r.block;
    let pts = tidy(raw); if (pts.length < 2 || d2(pts[0], pts[pts.length - 1]) < 0.5) return null;
    const L0 = d2(pts[0], pts[1]); if (L0 > 1.2) pts[0] = { x: pts[0].x + (pts[1].x - pts[0].x) / L0 * 0.6, y: pts[0].y + (pts[1].y - pts[0].y) / L0 * 0.6 }; // start at the feet
    const curved = CURVED.test(r.name || '');
    return { pts: fillet(pts, curved), end: block ? 'tbar' : 'arrow', curved, source: wp ? 'authored' : 'trace', breaks: pts.length - 2 };
  }
  const api = { art, waypoints, tidy, fillet, rdp, CURVED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QBRouteArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
