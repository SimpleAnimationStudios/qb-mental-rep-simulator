/**
 * rig3d.js — v7 procedural football-player model + pose helpers (presentation only; never touches the sim).
 *
 * Model: one hierarchical rig per player (hips → thighs → knees, spine → head, shoulders → elbows → hands).
 * Every rigid bone is ONE merged, vertex-coloured mesh, so a player is ~12 draw calls (8 on Graphics: Low)
 * and the whole roster shares 2 materials (+1 alpha-tested number material per jersey number).
 * Geometry sets are cached per (team, build, skin tone) and warmed up once, so nothing is allocated per rep.
 *
 * Conventions: player faces local -Z. Positive pivot.rotation.x swings a hanging limb FORWARD; negative spine
 * rotation.x leans the torso forward. Right side is +X; rotation.z > 0 lifts the right arm outward.
 */
export function createRigKit(THREE, cfg) {
  const SIMPLE = !!cfg.simple, SEG = cfg.seg || (SIMPLE ? 0.6 : 1);
  const seg = (n) => Math.max(3, Math.round(n * SEG));
  const SKINS = [0xe9b98f, 0xb07a4e, 0x6e4529];
  const BUILDS = {
    skill: { w: 0.93, d: 0.92, leg: 1.03, arm: 1.0, belly: 0, neck: 0.95 },
    mid:   { w: 1.02, d: 1.04, leg: 1.0,  arm: 1.03, belly: 0.4, neck: 1.08 },
    big:   { w: 1.12, d: 1.22,  leg: 0.94, arm: 1.06, belly: 1, neck: 1.2 },
  };
  const THIGH = 0.46, SHIN = 0.43, FOOT = 0.065, UPPER = 0.31, FORE = 0.29;

  // ---- tiny merge utility: [{geo, mat4, color}] → one indexed BufferGeometry with position/normal/color(/uv) ----
  function merge(parts, withUV) {
    let nv = 0, ni = 0; const gs = parts.map((p) => { let g = p.geo.clone(); g.applyMatrix4(p.m); if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); } nv += g.attributes.position.count; ni += g.index.count; return g; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = withUV ? new Float32Array(nv * 2) : null, idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let ov = 0, oi = 0; const c = new THREE.Color();
    gs.forEach((g, k) => {
      const n = g.attributes.position.count; pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
      if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
      c.setHex(parts[k].color); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (ov + i) * 3);
      const gi = g.index.array; for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + ov;
      ov += n; oi += gi.length; g.dispose();
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere(); return out;
  }
  const M = (x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  // unit primitives shared by every set (cloned + baked during merge, then the clones are disposed)
  const P = {
    sph: new THREE.SphereGeometry(1, seg(10), seg(7)),
    cap: (r, l) => new THREE.CapsuleGeometry(r, l, seg(3), seg(8)),
    cyl: new THREE.CylinderGeometry(1, 1, 1, seg(8)),
    box: new THREE.BoxGeometry(1, 1, 1),
    arc: new THREE.TorusGeometry(1, 0.08, 3, seg(10), Math.PI),
  };

  const sets = new Map();
  function geoSet(team, build, skin) {
    const key = team.jersey + '|' + build + '|' + skin; if (sets.has(key)) return sets.get(key);
    const B = BUILDS[build], w = B.w, d = B.d, J = team.jersey, PA = team.pants, ST = team.stripe, SO = team.sock, SK = SKINS[skin];
    const thighL = THIGH * B.leg, shinL = SHIN * B.leg, upL = UPPER * B.arm, foL = FORE * B.arm;
    const thighR = 0.092 * w, shinR = 0.066 * (0.9 + w * 0.1);
    // hips/pelvis
    const pelvis = merge([{ geo: P.sph, m: M(0, 0.03, 0, 0.2 * w, 0.15, 0.15 * d), color: PA }, { geo: P.cyl, m: M(0, 0.12, 0, 0.19 * w, 0.05, 0.14 * d), color: team.belt || 0x111111 }]);
    const cleat = { geo: P.box, m: M(0, -shinL - 0.025, -0.05, 0.11, 0.065, 0.24), color: 0x15171c };
    const shinParts = [{ geo: P.cap(shinR, shinL - shinR), m: M(0, -shinL / 2, 0), color: SO }, { geo: P.cyl, m: M(0, -0.05, 0, shinR * 1.25, 0.1, shinR * 1.25), color: PA }, cleat,
      { geo: P.cyl, m: M(0, -shinL + 0.07, 0, shinR * 1.03, 0.06, shinR * 1.03), color: 0xf3f4f6 }];
    const thighParts = [{ geo: P.cap(thighR, thighL - thighR * 0.6), m: M(0, -thighL / 2, 0), color: PA },
      { geo: P.box, m: M(thighR * 0.97, -thighL / 2, 0, 0.015, thighL * 0.9, 0.035), color: ST }, { geo: P.box, m: M(-thighR * 0.97, -thighL / 2, 0, 0.015, thighL * 0.9, 0.035), color: ST }];
    let thigh, shin;
    if (SIMPLE) { thigh = merge([...thighParts, ...shinParts.map((p) => ({ ...p, m: new THREE.Matrix4().makeTranslation(0, -thighL, 0).multiply(p.m) }))]); shin = null; }
    else { thigh = merge(thighParts); shin = merge(shinParts); }
    // torso: jersey over shoulder pads, collar + neck
    const torsoParts = [
      { geo: P.cap(0.2, 0.3), m: M(0, 0.32, 0, 1.25 * w, 1, 0.82 * d), color: J },
      { geo: P.sph, m: M(0, 0.6, 0, 0.41 * w, 0.115, 0.24 * d), color: J },              // pads (wide, rounded)
      { geo: P.sph, m: M(0.31 * w, 0.585, 0, 0.13 * w, 0.105, 0.16 * d), color: J },      // shoulder caps
      { geo: P.sph, m: M(-0.31 * w, 0.585, 0, 0.13 * w, 0.105, 0.16 * d), color: J },
      { geo: P.cyl, m: M(0, 0.71, 0, 0.085 * B.neck, 0.05, 0.085 * B.neck), color: ST },  // collar trim
      { geo: P.cyl, m: M(0, 0.78, 0, 0.065 * B.neck, 0.12, 0.065 * B.neck), color: SK },  // neck
      { geo: P.cyl, m: M(0, 0.08, 0, 0.215 * w, 0.06, 0.17 * d), color: J },             // jersey hem
    ];
    if (B.belly) torsoParts.push({ geo: P.sph, m: M(0, 0.2, -0.03, 0.235 * w, 0.2, 0.19 * d * (0.9 + 0.1 * B.belly)), color: J });
    if (!SIMPLE) torsoParts.push({ geo: P.box, m: M(0.31 * w, 0.62, 0, 0.03, 0.02, 0.3 * d), color: ST }, { geo: P.box, m: M(-0.31 * w, 0.62, 0, 0.03, 0.02, 0.3 * d), color: ST }); // shoulder stripes
    const spine = merge(torsoParts);
    // helmet: shell, centre stripe, side decals, face, 2-bar mask + centre bar, chin strap
    const HC = team.helmet, MK = team.mask, hy = 0.15;
    const headParts = [
      { geo: P.sph, m: M(0, hy, 0.01, 0.2, 0.205, 0.225), color: HC },
      { geo: P.sph, m: M(0, hy - 0.03, -0.09, 0.13, 0.13, 0.12), color: SK },              // face behind the mask
      { geo: P.arc, m: M(0, hy, 0.01, 0.206, 0.211, 0.231, 0, Math.PI / 2, 0), color: ST }, // centre stripe front→back
      { geo: P.arc, m: M(0, hy - 0.035, -0.06, 0.165, 0.165, 0.17, -Math.PI / 2, 0, 0), color: MK }, // mask bars
      { geo: P.arc, m: M(0, hy - 0.095, -0.05, 0.15, 0.15, 0.16, -Math.PI / 2, 0, 0), color: MK },
      { geo: P.cyl, m: M(0, hy - 0.07, -0.205, 0.012, 0.13, 0.012), color: MK },
      { geo: P.box, m: M(0, hy - 0.16, -0.12, 0.12, 0.03, 0.07), color: 0xf3f4f6 },           // chin strap cup
    ];
    if (!SIMPLE) headParts.push({ geo: P.cyl, m: M(0.198, hy + 0.01, 0.02, 0.06, 0.012, 0.06, 0, 0, Math.PI / 2), color: team.decal },
      { geo: P.cyl, m: M(-0.198, hy + 0.01, 0.02, 0.06, 0.012, 0.06, 0, 0, Math.PI / 2), color: team.decal },
      { geo: P.box, m: M(0.13, hy - 0.11, -0.03, 0.012, 0.012, 0.16, 0.5, 0, 0), color: 0xf3f4f6 }, { geo: P.box, m: M(-0.13, hy - 0.11, -0.03, 0.012, 0.012, 0.16, 0.5, 0, 0), color: 0xf3f4f6 });
    const head = merge(headParts);
    // arms: sleeve over the pad, sleeve stripe, bicep / forearm skin, glove
    const glove = { geo: P.sph, m: M(0, -foL - 0.02, -0.005, 0.055, 0.07, 0.045), color: team.glove };
    const upperParts = [{ geo: P.cap(0.085 * w, 0.08), m: M(0, -0.06, 0), color: J }, { geo: P.cyl, m: M(0, -0.12, 0, 0.088 * w, 0.03, 0.088 * w), color: ST },
      { geo: P.cap(0.058 * B.arm, upL - 0.12), m: M(0, -upL / 2 - 0.02, 0), color: SK }];
    const foreParts = [{ geo: P.cap(0.05 * B.arm, foL - 0.1), m: M(0, -foL / 2, 0), color: SK }, { geo: P.cyl, m: M(0, -foL + 0.05, 0, 0.053, 0.05, 0.053), color: 0xf3f4f6 }, glove];
    let upper, fore;
    if (SIMPLE) { upper = merge([...upperParts, ...foreParts.map((p) => ({ ...p, m: new THREE.Matrix4().makeTranslation(0, -upL, 0).multiply(p.m) }))]); fore = null; }
    else { upper = merge(upperParts); fore = merge(foreParts); }
    const s = { pelvis, thigh, shin, spine, head, upper, fore, dims: { w, d, thighL, shinL, upL, foL, hipY: thighL + shinL + FOOT } };
    sets.set(key, s); return s;
  }

  // numbers: chest + back (+ shoulder tops on High/Auto) in one quad mesh per build width, uv-mapped to the number texture
  const numGeos = {};
  function numberGeo(build) {
    if (numGeos[build]) return numGeos[build];
    const B = BUILDS[build], pl = new THREE.PlaneGeometry(1, 1), zf = 0.168 * B.d * (B.belly ? 1.12 : 1) + 0.012;
    const parts = [{ geo: pl, m: M(0, 0.36, zf + 0.012, 0.3 * B.w, 0.3, 1), color: 0xffffff }, { geo: pl, m: M(0, 0.36, -zf - (B.belly ? 0.03 : 0), 0.28 * B.w, 0.28, 1, 0, Math.PI, 0), color: 0xffffff }];
    if (!SIMPLE) parts.push({ geo: pl, m: M(0.3 * B.w, 0.715, 0, 0.13, 0.13, 1, -Math.PI / 2, 0, 0), color: 0xffffff }, { geo: pl, m: M(-0.3 * B.w, 0.715, 0, 0.13, 0.13, 1, -Math.PI / 2, 0, 0), color: 0xffffff });
    return (numGeos[build] = merge(parts, true));
  }
  const numTex = {}, numMats = {};
  function numberMat(num, team) {
    const k = num + '|' + team.num + '|' + team.jersey; if (numMats[k]) return numMats[k];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.font = '900 84px system-ui,Arial Black,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = team.numOutline; x.lineJoin = 'round'; x.strokeText(String(num), 64, 70); x.fillStyle = team.num; x.fillText(String(num), 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; numTex[k] = t;
    return (numMats[k] = new THREE.MeshBasicMaterial({ map: t, alphaTest: 0.45, polygonOffset: true, polygonOffsetFactor: -2 }));
  }

  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0 });
  const helmetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.28 });
  if (cfg.rim) [bodyMat, helmetMat].forEach((m) => { // cheap fresnel rim light for readability against the turf
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  { float rim = 1.0 - saturate(dot(normal, normalize(vViewPosition))); totalEmissiveRadiance += vec3(0.55, 0.62, 0.75) * pow(rim, 3.0) * 0.38; }'); };
    m.customProgramCacheKey = () => 'rim';
  });

  /** Build one player rig. Returns root Group with userData.rig (bones + dims). */
  // standing height (sole to helmet top) of the unscaled rig, in yards
  function naturalHeight(build) { const B = BUILDS[build]; return (THIGH + SHIN) * B.leg + FOOT + 0.1 + 0.83 + 0.15 + 0.205; }
  function build(team, num, build, skin, castShadow) {
    const S = geoSet(team, build, skin), dm = S.dims;
    const g = new THREE.Group();
    const mesh = (geo, mat, cast) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!cast && castShadow !== 'none'; return m; };
    const body = new THREE.Group(); g.add(body); // v8: uniform per-position scale lives here (ring/hit areas stay unscaled)
    const hips = new THREE.Group(); hips.position.y = dm.hipY; body.add(hips);
    hips.add(mesh(S.pelvis, bodyMat, false));
    const leg = (side) => {
      const t = new THREE.Group(); t.position.set(side * 0.105 * dm.w, -0.02, 0); hips.add(t); t.add(mesh(S.thigh, bodyMat, castShadow === 'full'));
      const k = new THREE.Group(); k.position.y = -dm.thighL; t.add(k); if (S.shin) k.add(mesh(S.shin, bodyMat, castShadow === 'full'));
      return [t, k];
    };
    const [thL, knL] = leg(-1), [thR, knR] = leg(1);
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine);
    spine.add(mesh(S.spine, bodyMat, true));
    const nm = new THREE.Mesh(numberGeo(build), numberMat(num, team)); spine.add(nm);
    const head = new THREE.Group(); head.position.y = 0.83; spine.add(head); head.add(mesh(S.head, helmetMat, true));
    const arm = (side) => {
      const s = new THREE.Group(); s.position.set(side * 0.33 * dm.w, 0.6, 0); spine.add(s); s.add(mesh(S.upper, bodyMat, castShadow === 'full'));
      const e = new THREE.Group(); e.position.y = -dm.upL; s.add(e); if (S.fore) e.add(mesh(S.fore, bodyMat, false));
      const h = new THREE.Object3D(); h.position.set(0, -dm.foL - 0.02, -0.06);
      if (S.fore) e.add(h); else { h.position.y = -dm.upL - dm.foL - 0.02; s.add(h); }
      return [s, e, h];
    };
    const [shL, elL, haL] = arm(-1), [shR, elR, haR] = arm(1);
    g.userData.rig = { body, height: naturalHeight(build), hips, spine, head, thL, knL, thR, knR, shL, elL, haL, shR, elR, haR, dims: dm, simple: SIMPLE };
    return g;
  }
  function warm(teams) { teams.forEach((t) => Object.keys(BUILDS).forEach((b) => { for (let s = 0; s < SKINS.length; s++) geoSet(t, b, s); numberGeo(b); })); }

  // ---- pose: a flat bag of joint angles, damped toward a target each frame ----
  const KEYS = ['hy', 'fall', 'hipYaw', 'lean', 'twist', 'roll', 'hYaw', 'hPitch', 'tL', 'tLz', 'kL', 'tR', 'tRz', 'kR', 'sLx', 'sLz', 'eLx', 'eLz', 'sRx', 'sRz', 'eRx', 'eRz'];
  const zeroPose = () => Object.fromEntries(KEYS.map((k) => [k, 0]));
  /** two-bone leg IK: hip at height h above the ground, foot fz yards in front (−) / behind (+) → [thigh, kneeFlex] */
  function legIK(dm, h, fz) {
    const T = dm.thighL, Sh = dm.shinL + 0.065, dd = Math.min(T + Sh - 1e-3, Math.max(0.2, Math.hypot(h, fz)));
    const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, (T * T + Sh * Sh - dd * dd) / (2 * T * Sh))));
    const a = Math.acos(Math.min(1, Math.max(-1, (T * T + dd * dd - Sh * Sh) / (2 * T * dd))));
    return [a + Math.atan2(-fz, h), knee];
  }
  function apply(rig, p) {
    const r = rig;
    r.hips.position.y = r.dims.hipY + p.hy; r.hips.rotation.set(p.fall, p.hipYaw, 0);
    r.spine.rotation.set(p.lean, p.twist, p.roll);
    r.head.rotation.set(p.hPitch, p.hYaw, 0);
    r.thL.rotation.set(p.tL, 0, -p.tLz); r.knL.rotation.x = -p.kL; r.thR.rotation.set(p.tR, 0, p.tRz); r.knR.rotation.x = -p.kR;
    r.shL.rotation.set(p.sLx, 0, -p.sLz); r.elL.rotation.set(p.eLx, 0, -p.eLz); r.shR.rotation.set(p.sRx, 0, p.sRz); r.elR.rotation.set(p.eRx, 0, p.eRz);
  }
  return { naturalHeight, build, warm, legIK, apply, zeroPose, KEYS, BUILDS, SKINS };
}
