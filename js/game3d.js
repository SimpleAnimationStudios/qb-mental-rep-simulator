/**
 * game3d.js — Three.js presentation + game flow for the 3D QB simulator.
 * Simulation lives in engine.js (pure, data-driven, shared with the 2D build).
 * World mapping: 1 unit = 1 yard. worldX = fieldX - 26.65, worldZ = -fieldY (LOS at z = 0, downfield = -Z).
 */
import * as THREE from '../vendor/three.module.js';
import { createRigKit } from './rig3d.js';

const D = window.QBData, E = window.QBEngine, M = window.QBModes, G = window.QBGrade, Prot = window.QBProt, Run = window.QBRun;
const $ = (id) => document.getElementById(id);
const HISTORY_KEY = 'pocketiq3d.history.v2'; // v1 is migrated by QBModes.loadHistory (left untouched)
const DIFF = {
  youth:   { label: 'Youth',   pocketMul: 1.45, disguise: 0,    timingSlack: 0.75, intMul: 0.45, react: 0.5, disc: 0.55 }, // v8 level
  rookie:  { label: 'High School',  pocketMul: 1.3,  disguise: 0,    timingSlack: 0.6, intMul: 0.6, react: 0.4, disc: 0.7 },
  starter: { label: 'College', pocketMul: 1.0,  disguise: 0.4,  timingSlack: 0.4, intMul: 1.0, react: 0.3, disc: 0.82 },
  pro:     { label: 'Pro',     pocketMul: 0.85, disguise: 0.85, timingSlack: 0.25, intMul: 1.4, react: 0.2, disc: 0.95 },
};
const TEAM_O = { jersey: 0x1d4ed8, pants: 0xe5e7eb, helmet: 0x0f2a6b, num: '#ffffff', numOutline: '#0b1f5c', stripe: 0xf8fafc, sock: 0x1d4ed8, mask: 0xd1d5db, decal: 0xf8fafc, glove: 0xf3f4f6, belt: 0x0f172a };
const TEAM_D = { jersey: 0xb91c1c, pants: 0x111827, helmet: 0xd1d5db, num: '#ffffff', numOutline: '#3f0b0b', stripe: 0xb91c1c, sock: 0xb91c1c, mask: 0x1f2937, decal: 0xb91c1c, glove: 0x111111, belt: 0x0b0b0b };
// v8 scale: 1 world unit = 1 yard. The engine spaces the box on a 2.5-yd grid (OL 2.5 yd centre-to-centre), about 1.6x real
// NFL splits. To keep every engine result identical, the renderer compresses lateral spacing inside the box only
// (|dx| <= 6 yd is drawn at 0.62x; 6..12 yd blends back to 1:1, so wide receivers, hashes and sidelines stay true).
// Pre-v8 behaviour: window.__boxK = 1 (or the scale-debug toggle shows both). See docs/scale-audit.md.
const BOX_K = 0.62, BOX_IN = 6, BOX_OUT = 12;
function boxMap(d) { const k = window.__boxK != null ? window.__boxK : BOX_K; const a = Math.abs(d), s = Math.sign(d);
  if (a <= BOX_IN) return d * k;
  if (a >= BOX_OUT) return d;
  return s * (BOX_IN * k + (a - BOX_IN) * (BOX_OUT - BOX_IN * k) / (BOX_OUT - BOX_IN)); }
const W = (x) => boxMap(x - D.FIELD.ballX);
const Z = (y) => -y;

// ---------------- renderer / scene ----------------
// Software GL (SwiftShader / llvmpipe): start in a lighter profile so we hold >= 30 fps.
const SOFT_GL = (() => { try { const gl = document.createElement('canvas').getContext('webgl'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { return false; } })();
// v6 Graphics setting: 'auto' (adaptive resolution scaler; light profile on software GL), 'high' (full look, fixed), 'low'.
const camMode = () => { const v = localStorage.getItem('pocketiq3d.camera'); return v === 'classic' || v === 'eye' ? v : 'pulled'; }; // v8: + 'eye' (true QB eye level)
const GFX = ['auto', 'high', 'low'].includes(localStorage.getItem('pocketiq3d.graphics')) ? localStorage.getItem('pocketiq3d.graphics') : 'auto';
const LIGHT = GFX === 'low' || (GFX === 'auto' && SOFT_GL); // light profile: no MSAA, basic shadows, 1024 map, fewer shadow casters
const DPR_CAP = Math.min(window.devicePixelRatio || 1, 2);
const renderer = new THREE.WebGLRenderer({ antialias: !LIGHT, powerPreference: 'high-performance' });
renderer.setPixelRatio(GFX === 'low' ? Math.min(DPR_CAP, 1) * 0.6 : GFX === 'auto' && SOFT_GL ? 0.6 : DPR_CAP);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LIGHT ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1424);
scene.fog = new THREE.Fog(0x0a1424, 70, 190);
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 400);

scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x22331c, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-25, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(LIGHT ? 1024 : 2048, LIGHT ? 1024 : 2048);
// tight shadow frustum around the play area (players live within ~±30 x, -15..45 downfield; field casts no shadows)
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 40, bottom: -36, near: 20, far: 110 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// ---------------- field ----------------
let LOS = 35; // absolute yard line (own goal = 0)
const fieldGroup = new THREE.Group(); scene.add(fieldGroup);

function fieldTexture() {
  const PX = 16, w = Math.round(53.33 * PX), h = 120 * PX;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rowOf = (abs) => (120 - (abs + 10)) * PX; // abs: -10..110
  for (let yd = 0; yd < 100; yd += 5) { g.fillStyle = (yd / 5) % 2 ? '#2f7a3a' : '#2a7035'; g.fillRect(0, rowOf(yd + 5), w, 5 * PX); }
  g.fillStyle = '#123f86'; g.fillRect(0, rowOf(110), w, 10 * PX); // opponent EZ (top)
  g.fillStyle = '#7d1414'; g.fillRect(0, rowOf(0), w, 10 * PX);
  g.fillStyle = '#ffffffcc'; g.font = `bold ${PX * 6}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  [[rowOf(105), 'VISITORS'], [rowOf(-5), 'HOME']].forEach(([r, t]) => { g.save(); g.translate(w / 2, r); g.fillText(t, 0, 0); g.restore(); });
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = PX * 0.35; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  for (let yd = 0; yd <= 100; yd++) {
    const r = rowOf(yd);
    if (yd % 5 === 0) { g.fillRect(0, r - PX * 0.06, w, PX * 0.12); continue; } // lines 4 in wide
    const hl = PX * 0.667, hw = PX * 0.11; // 2 ft x 4 in ticks: sidelines (4 in in) and NFL hashes 70 ft 9 in from each sideline
    [0.11, 23.583 - 0.667, 29.75, 53.33 - 0.11 - 0.667].forEach((x) => g.fillRect(x * PX, r - hw / 2, hl, hw));
  }
  g.font = `bold ${PX * 2.75}px system-ui,sans-serif`; // ~6 ft cap height
  for (let yd = 10; yd <= 90; yd += 10) {
    const n = String(yd <= 50 ? yd : 100 - yd);
    [[8 * PX, Math.PI / 2], [w - 8 * PX, -Math.PI / 2]].forEach(([x, rot]) => { g.save(); g.translate(x, rowOf(yd)); g.rotate(rot); g.fillText(n.split('').join(' '), 0, 0); g.restore(); });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const turf = new THREE.Mesh(new THREE.PlaneGeometry(53.33, 120), new THREE.MeshStandardMaterial({ map: fieldTexture(), roughness: 0.95 }));
turf.rotation.x = -Math.PI / 2; turf.receiveShadow = true; fieldGroup.add(turf);
const apron = new THREE.Mesh(new THREE.PlaneGeometry(110, 170), new THREE.MeshStandardMaterial({ color: 0x1f5a2a, roughness: 1 }));
apron.rotation.x = -Math.PI / 2; apron.position.y = -0.02; apron.receiveShadow = true; fieldGroup.add(apron);
// v8: 6-ft white border around the field + yellow team-area restraining line (6 ft outside it) on both sidelines
(function border() {
  const wm = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }), ym = new THREE.MeshBasicMaterial({ color: 0xe8c521 });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), wm, 4), ym4 = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), ym, 2), o = new THREE.Object3D();
  o.rotation.x = -Math.PI / 2; o.position.y = -0.01;
  [[-(26.665 + 1), 0, 2, 124], [26.665 + 1, 0, 2, 124], [0, -(60 + 1), 57.33, 2], [0, 60 + 1, 57.33, 2]].forEach(([x, z, sx, sz], i) => { o.position.x = x; o.position.z = z; o.scale.set(sx, sz, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
  [-1, 1].forEach((sd, i) => { o.position.set(sd * (26.665 + 4.1), -0.01, 0); o.scale.set(0.11, 100, 1); o.updateMatrix(); ym4.setMatrixAt(i, o.matrix); });
  fieldGroup.add(im, ym4);
})();

// v9: switchable stadium surroundings (dome / hs / bowl). ONLY the surroundings change; turf, apron, borders and goal posts are shared.
const STADIUMS = { bowl: 'Outdoor Bowl', dome: 'Indoor Dome', hs: 'High School' };
const stadiumKey = () => { const v = localStorage.getItem('pocketiq3d.stadium'); return STADIUMS[v] ? v : 'bowl'; };
let stadiumGroup = null, stadiumCur = null;
function disposeGroup(g) {
  const seen = new Set();
  g.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => { if (seen.has(m)) return; seen.add(m); if (m.map) m.map.dispose(); m.dispose(); });
    if (o.dispose && o.isInstancedMesh) o.dispose();
  });
}
function crowdTex(base, n) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 64);
  const cols = ['#b91c1c', '#1d4ed8', '#e5e7eb', '#f59e0b', '#111827', '#7f1d1d', '#334155'];
  for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(Math.random() * 256, Math.random() * 64, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ribbonBoards(g, h) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#04121f'; x.fillRect(0, 0, 512, 32);
  x.font = 'bold 20px sans-serif'; x.textBaseline = 'middle'; x.fillStyle = '#e5e7eb'; x.fillText('POCKET IQ', 16, 17); x.fillStyle = '#3ee08f'; x.fillText('READ · REACT · DELIVER', 190, 17);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.repeat.set(6, 1); t.colorSpace = THREE.SRGBColorSpace;
  const rm = new THREE.MeshBasicMaterial({ map: t }), rg = new THREE.PlaneGeometry(150, 1.2);
  [-1, 1].forEach((sd) => { const r = new THREE.Mesh(rg, rm); r.position.set(sd * 37.2, h, 0); r.rotation.y = -sd * Math.PI / 2; g.add(r); });
}
function instBoxes(g, list, m) {
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, list.length);
  list.forEach(([x, y, z, sx, sy, sz, ry], i) => im.setMatrixAt(i, M4.compose(P.set(x, y, z), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0), Sc.set(sx, sy, sz))));
  g.add(im); return im;
}
function lightTowers(g, towers, h, mat) {
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), o = new THREE.Object3D();
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, h), mat, towers.length), lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(h / 4, h / 10, 1), lampMat, towers.length);
  towers.forEach(([x, z], i) => { o.position.set(x, h / 2, z); o.rotation.set(0, 0, 0); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); o.position.set(x, h + 1, z); o.lookAt(0, 0, 0); o.updateMatrix(); lamps.setMatrixAt(i, o.matrix); });
  g.add(poles, lamps);
}
const STADIUM_BUILD = {
  bowl(g, rich) { // huge open-air bowl at night: 6 tiers, light towers, ribbon boards
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.9 }), seat = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.8 });
    if (rich) { seat.map = crowdTex('#26324a', 1400); seat.color.set(0xffffff); }
    const parts = { 0: [], 1: [] }, T = rich ? 6 : 4;
    for (let tier = 0; tier < T; tier++) {
      const d = 40 + tier * 6, hgt = 3 + tier * 3.5;
      [-1, 1].forEach((sd) => parts[tier % 2].push([sd * d, hgt / 2, 0, 5.5, hgt, 150 + tier * 6]));
      [-1, 1].forEach((sd) => parts[tier % 2].push([0, hgt / 2, sd * (78 + tier * 6), 80 + tier * 12, hgt, 5.5]));
    }
    instBoxes(g, parts[0], mat); instBoxes(g, parts[1], seat); ribbonBoards(g, 2.4);
    lightTowers(g, [[-72, -60], [72, -60], [-72, 60], [72, 60]], 44, mat);
    return { bg: 0x0a1424, fog: [70, 190] };
  },
  dome(g, rich) { // huge indoor stadium: closed bowl, roof with truss ring + light ring, bright even lighting
    const mat = new THREE.MeshStandardMaterial({ color: 0x232a36, roughness: 0.85 }), seat = new THREE.MeshStandardMaterial({ color: 0x3a4660, roughness: 0.8 });
    if (rich) { seat.map = crowdTex('#2c3650', 1800); seat.color.set(0xffffff); }
    const parts = { 0: [], 1: [] };
    for (let tier = 0; tier < 7; tier++) {
      const d = 38 + tier * 5.5, hgt = 3 + tier * 3.2;
      [-1, 1].forEach((sd) => parts[tier % 2].push([sd * d, hgt / 2, 0, 5, hgt, 160 + tier * 10]));
      [-1, 1].forEach((sd) => parts[tier % 2].push([0, hgt / 2, sd * (76 + tier * 5.5), 76 + tier * 11, hgt, 5]));
    }
    instBoxes(g, parts[0], mat); instBoxes(g, parts[1], seat); ribbonBoards(g, 2.4); ribbonBoards(g, 14);
    const roof = new THREE.Mesh(new THREE.SphereGeometry(150, rich ? 32 : 16, rich ? 12 : 6, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.9, side: THREE.BackSide }));
    roof.scale.set(0.85, 0.42, 1); roof.position.y = -4; g.add(roof);
    const trusses = []; for (let i = 0; i < (rich ? 12 : 6); i++) { const a = (i / (rich ? 12 : 6)) * Math.PI; trusses.push([0, 58, 0, 1.2, 1.2, 210, a]); }
    instBoxes(g, trusses, new THREE.MeshStandardMaterial({ color: 0x5b6474, roughness: 0.6 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(46, 0.8, 6, rich ? 64 : 24), new THREE.MeshBasicMaterial({ color: 0xfff7e0 })); ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1.6, 1); ring.position.y = 52; g.add(ring);
    return { bg: 0x39404c, fog: [90, 230] };
  },
  hs(g, rich) { // typical high school field: aluminium home bleachers + press box, small visitor bleachers, fence, trees, 4 poles, dusk sky
    const al = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5, metalness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.8 });
    const rows = []; for (let r = 0; r < 10; r++) rows.push([-(36 + r * 0.9), 0.45 + r * 0.45, 0, 0.9, 0.12, 60]);
    for (let r = 0; r < 5; r++) rows.push([36 + r * 0.9, 0.45 + r * 0.45, 0, 0.9, 0.12, 36]);
    instBoxes(g, rows, al);
    const sup = [[-40.5, 2.2, 0, 9, 4.4, 60], [38.2, 1.1, 0, 4.5, 2.2, 36], [-46, 6.5, 0, 3.5, 3.4, 24]]; // understructure + press box
    instBoxes(g, sup, dark);
    const fence = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6b7280, transparent: true, opacity: 0.35, roughness: 1 }));
    const fl = []; [-1, 1].forEach((sd) => { fl.push([sd * 33, 0.6, 0, 0.05, 1.2, 130]); fl.push([0, 0.6, sd * 65, 66, 1.2, 0.05]); });
    instBoxes(g, fl, fence.material); fence.geometry.dispose();
    const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(3.5, 12, rich ? 8 : 5), new THREE.MeshStandardMaterial({ color: 0x1f3d2a, roughness: 1 }), rich ? 60 : 24), o = new THREE.Object3D();
    for (let i = 0; i < trees.count; i++) { const a = (i / trees.count) * Math.PI * 2, r = 95 + ((i * 37) % 23); o.position.set(Math.cos(a) * r * 0.8, 6, Math.sin(a) * r); o.scale.setScalar(0.8 + ((i * 13) % 7) / 10); o.updateMatrix(); trees.setMatrixAt(i, o.matrix); }
    g.add(trees);
    const sb = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.6), new THREE.MeshBasicMaterial({ color: 0x111827 })); sb.position.set(0, 7, 72); g.add(sb);
    instBoxes(g, [[-5, 2.5, 72, 0.5, 5, 0.5], [5, 2.5, 72, 0.5, 5, 0.5]], dark);
    lightTowers(g, [[-42, -35], [42, -35], [-42, 35], [42, 35]], 26, dark);
    return { bg: 0x1c2747, fog: [80, 210] };
  },
};
function setStadium(key) {
  key = STADIUMS[key] ? key : 'bowl';
  if (stadiumGroup) { fieldGroup.remove(stadiumGroup); disposeGroup(stadiumGroup); }
  stadiumGroup = new THREE.Group(); stadiumGroup.name = 'stadium-' + key;
  const env = STADIUM_BUILD[key](stadiumGroup, !LIGHT || GFX === 'high');
  scene.background.set(env.bg); scene.fog.color.set(env.bg); scene.fog.near = env.fog[0]; scene.fog.far = env.fog[1];
  fieldGroup.add(stadiumGroup); stadiumCur = key;
  try { localStorage.setItem('pocketiq3d.stadium', key); } catch (e) {}
  document.querySelectorAll('[data-stadium]').forEach((b) => b.classList.toggle('on', b.dataset.stadium === key));
  const sel = document.getElementById('set-stadium'); if (sel) sel.value = key;
  return key;
}
window.__setStadium = setStadium; window.__stadium = () => stadiumCur; window.__STADIUMS = STADIUMS;
setStadium(stadiumKey());
// Goal posts (part of the field: never change)
[-1, 1].forEach((s) => {
  const gp = new THREE.Group(), ym = new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x332a00 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.333), ym); post.position.y = 1.667; gp.add(post);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.167), ym); bar.rotation.z = Math.PI / 2; bar.position.y = 3.333; gp.add(bar); // crossbar 10 ft
  [-3.083, 3.083].forEach((x) => { const u = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 11.67), ym); u.position.set(x, 3.333 + 5.835, 0); gp.add(u); }); // 18'6" apart, 35 ft tall
  gp.position.z = s * 60; gp.userData.goal = true; fieldGroup.add(gp);
});

// Line of scrimmage + line to gain overlays (live in world space at LOS).
const losLine = new THREE.Mesh(new THREE.PlaneGeometry(53.3, 0.25), new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.85 }));
losLine.rotation.x = -Math.PI / 2; losLine.position.y = 0.02; scene.add(losLine);
const ltgLine = new THREE.Mesh(new THREE.PlaneGeometry(53.3, 0.25), new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.9 }));
ltgLine.rotation.x = -Math.PI / 2; ltgLine.position.y = 0.021; scene.add(ltgLine);

function placeField(losAbs, toGo) {
  LOS = losAbs;
  fieldGroup.position.z = (losAbs + 10) - 60; // field centre (abs 50) relative to LOS
  ltgLine.position.z = -toGo;
}

// ---------------- players ----------------
const numTexCache = {};
function numberTexture(txt, color) {
  const k = txt + color; if (numTexCache[k]) return numTexCache[k];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = color; g.font = 'bold 40px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (numTexCache[k] = t);
}
// v7: procedural rigged players (js/rig3d.js). Low graphics = simpler model (no knee/elbow segments, fewer parts).
const geo = { hit: new THREE.CylinderGeometry(1.4, 1.4, 2.6, 8), ring: new THREE.RingGeometry(0.55, 0.75, 24) };
const RK = createRigKit(THREE, { simple: GFX === 'low', rim: GFX !== 'low', seg: LIGHT && GFX !== 'low' ? 0.75 : 0 }); // auto on software GL: same jointed model, lighter tessellation
RK.warm([TEAM_O, TEAM_D]);
const playerPool = new Map();
function resetPose(g) {
  const u = g.userData; g.rotation.set(0, 0, 0); g.position.set(0, 0, 0);
  for (const k of RK.KEYS) u.cur[k] = 0; u.first = true; u.vx = u.vz = u.acc = u.pvf = u.angV = 0; u.fallT = 0; u.t = 0;
  u.ring.material.opacity = 0; u.ring.visible = false; u.heading = 0; u.stance = true;
}
// v8: real average heights by position (NFL combine-era averages, + ~1.5 in for helmet/cleats), yards. See docs/scale-audit.md.
const HEIGHT_FT = { QB: 6.25, WR: 6.08, TE: 6.33, RB: 5.92, OL: 6.42, DL: 6.33, LB: 6.17, DB: 6.0 };
function posGroup(kind, src) {
  if (kind === 'qb') return 'QB'; if (kind === 'ol') return 'OL'; if (kind === 'dl') return 'DL';
  if (kind === 'wr') return src.id === 'RB' || (src.id === 'H' && src.y <= -2.5) ? 'RB' : src.id === 'Y' ? 'TE' : 'WR';
  if (src.role === 'DB') return 'DB'; if (src.role === 'LB') return 'LB';
  return SECONDARY.has(src.label) ? 'DB' : 'LB';
}
function heightYd(pos) { return (HEIGHT_FT[pos] + 0.125) / 3; }
function makePlayer(team, num, opts = {}) {
  const g0 = makePlayer0(team, num, opts);
  const r = g0.userData.rig, pos = opts.pos || 'WR', h = heightYd(pos);
  r.body.scale.setScalar(h / r.height); r.pos = pos; r.heightYd = h;
  return g0;
}
function makePlayer0(team, num, opts = {}) {
  const build = opts.build || 'skill', skin = (num * 7 + (team === TEAM_D ? 1 : 0)) % 3;
  const key = team.jersey + '|' + num + '|' + build + '|' + (opts.hit || '');
  const pool = playerPool.get(key);
  if (pool && pool.length) { const g = pool.pop(); resetPose(g); scene.add(g); return g; }
  const g = RK.build(team, num, build, skin, LIGHT ? 'core' : 'full');
  const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false; g.add(ring);
  Object.assign(g.userData, { ring, poolKey: key, phase: Math.random() * 6, heading: 0, cur: RK.zeroPose(), tgt: RK.zeroPose(), vx: 0, vz: 0, acc: 0, pvf: 0, angV: 0, fallT: 0, t: 0, first: true });
  if (opts.hit) { const h = new THREE.Mesh(geo.hit, new THREE.MeshBasicMaterial({ visible: false })); h.position.y = 1.2; h.userData.hitFor = opts.hit; g.add(h); g.userData.hit = h; }
  scene.add(g);
  return g;
}

const NUMS = { X: 11, H: 83, Y: 87, Z: 13, RB: 28, QB: 9, OL0: 71, OL1: 66, OL2: 60, OL3: 64, OL4: 76,
  DE1: 91, DT1: 97, DT2: 93, DE2: 99, CB1: 24, CB2: 21, S1: 32, S2: 20, NB: 31, W: 54, M: 52, NT: 95, SAM: 56, DB: 23 };
const actors = []; // {g, src, kind}
const hitMeshes = [];
function clearActors() { actors.forEach((a) => { scene.remove(a.g); const k = a.g.userData.poolKey; if (!playerPool.has(k)) playerPool.set(k, []); playerPool.get(k).push(a.g); }); actors.length = 0; hitMeshes.length = 0; }

// ---------------- hold-to-show routes ----------------
const routeGroup = new THREE.Group(); routeGroup.visible = false; scene.add(routeGroup);
// v9: screen-space route overlay (constant pixel width + dark outline + arrowheads + read label, drawn on top), so short
// sideline routes (flats/outs/swings seen edge-on from behind the QB) never shrink to a sliver.
const routeLines = [];
const rcv = document.createElement('canvas'); rcv.id = 'route-cv'; document.body.appendChild(rcv); const rctx = rcv.getContext('2d');
const _rv = new THREE.Vector3(), _rw = new THREE.Vector3();
function drawRouteOverlay() {
  // v14: playbook-style art — fixed pixel width at any camera distance, dark outline + faint halo, crisp mitred breaks,
  // arrowheads (T bars for blocks) sized in pixels. Geometry comes from js/routeart.js (authored waypoints).
  const on = routeGroup.visible && routeLines.length;
  if (!on) { if (rcv._on) { rctx.clearRect(0, 0, rcv.width, rcv.height); rcv._on = false; rcv.style.display = 'none'; } return; }
  const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (rcv.width !== Math.round(w * dpr) || rcv.height !== Math.round(h * dpr)) { rcv.width = Math.round(w * dpr); rcv.height = Math.round(h * dpr); }
  rcv.style.display = ''; rcv._on = true; rctx.setTransform(dpr, 0, 0, dpr, 0, 0); rctx.clearRect(0, 0, w, h);
  camera.updateMatrixWorld(); const inv = camera.matrixWorldInverse, P = camera.projectionMatrix;
  const scr = (v) => { _rw.copy(v).applyMatrix4(P); return { x: (_rw.x + 1) / 2 * w, y: (1 - _rw.y) / 2 * h }; };
  const lw = Math.max(3.6, Math.min(5.5, Math.min(w, h * 1.2) / 150)), A = lw * 2.7;
  routeLines.forEach((R) => {
    const path = []; let prev = null;
    for (let i = 0; i < R.pts.length; i++) { // view space, clipped at the near plane
      const cur = _rv.copy(R.pts[i]).applyMatrix4(inv).clone();
      if (prev && (prev.z < -0.2) !== (cur.z < -0.2)) { const k = (-0.2 - prev.z) / (cur.z - prev.z); const c = prev.clone().lerp(cur, k); path.push(c.z < -0.19 ? scr(c) : null); }
      path.push(cur.z < -0.2 ? scr(cur) : null); prev = cur;
    }
    const last = path[path.length - 1]; let pen = null;
    for (let i = path.length - 2; i >= 0 && path[i]; i--) if (Math.hypot(path[i].x - last.x, path[i].y - last.y) > 2) { pen = path[i]; break; }
    let dx = 0, dy = 0; if (last && pen) { dx = last.x - pen.x; dy = last.y - pen.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
    const tip = R.end === 'arrow' && last && pen ? { x: last.x - dx * A * 0.75, y: last.y - dy * A * 0.75 } : null; // line stops at the arrow's base
    const segs = []; let sg = [];
    path.forEach((q, i) => { if (q) sg.push(i === path.length - 1 && tip ? tip : q); else if (sg.length) { segs.push(sg); sg = []; } }); if (sg.length) segs.push(sg);
    rctx.lineJoin = 'miter'; rctx.miterLimit = 3;
    segs.forEach((pts) => {
      if (pts.length < 2) return;
      rctx.beginPath(); pts.forEach((q, i) => (i ? rctx.lineTo(q.x, q.y) : rctx.moveTo(q.x, q.y)));
      rctx.lineCap = 'round'; rctx.strokeStyle = R.col; rctx.globalAlpha = 0.18; rctx.lineWidth = lw + 7; rctx.stroke(); rctx.globalAlpha = 1;
      rctx.lineCap = 'butt'; rctx.strokeStyle = 'rgba(4,8,16,.82)'; rctx.lineWidth = lw + 3.5; rctx.stroke();
      rctx.strokeStyle = R.col; rctx.lineWidth = lw; rctx.stroke();
    });
    if (!last || !pen) return;
    rctx.lineJoin = 'miter';
    if (R.end === 'tbar') {
      const T = lw * 2.2; rctx.beginPath(); rctx.moveTo(last.x - dy * T, last.y + dx * T); rctx.lineTo(last.x + dy * T, last.y - dx * T);
      rctx.lineCap = 'butt'; rctx.strokeStyle = 'rgba(4,8,16,.82)'; rctx.lineWidth = lw + 3.5; rctx.stroke(); rctx.strokeStyle = R.col; rctx.lineWidth = lw; rctx.stroke();
    } else {
      const bx = last.x - dx * A, by = last.y - dy * A, s = A * 0.55;
      rctx.beginPath(); rctx.moveTo(last.x, last.y); rctx.lineTo(bx - dy * s, by + dx * s); rctx.lineTo(bx + dy * s, by - dx * s); rctx.closePath();
      rctx.fillStyle = R.col; rctx.strokeStyle = 'rgba(4,8,16,.85)'; rctx.lineWidth = 1.75; rctx.fill(); rctx.stroke();
    }
    if (R.lbl) { rctx.font = `900 ${Math.round(lw * 2.6)}px system-ui,sans-serif`; rctx.textAlign = 'center'; rctx.textBaseline = 'middle'; const tx = last.x + dx * A * 1.1, ty = last.y + dy * A * 1.1 - 2; rctx.lineJoin = 'round'; rctx.lineWidth = 4; rctx.strokeStyle = '#000'; rctx.strokeText(R.lbl, tx, ty); rctx.fillStyle = '#fff'; rctx.fillText(R.lbl, tx, ty); }
  });
}
const READ_COLORS = [0x3ee08f, 0xffd23f, 0x4fb3ff, 0xff7ad9];
function readColor(sim, p) { if (p.read < 0) return 0xffffff; return p.read === sim.play.progression.length - 1 ? READ_COLORS[3] : READ_COLORS[Math.min(2, p.read)]; }
function ribbon(pts, w, mat) {
  // flat strip on the turf following the polyline
  const pos = [], idx = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    pos.push(p.x - dz * w / 2, 0.1, p.z + dx * w / 2, p.x + dz * w / 2, 0.1, p.z - dx * w / 2); // v9: lifted off the turf
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}
function buildRoutes(sim) {
  // v14: no field meshes any more (the ribbons z-fought / doubled the canvas art); routeGroup only carries the visible flag.
  while (routeGroup.children.length) disposeTree(routeGroup.children.pop());
  routeLines.length = 0;
  const RA = window.QBRouteArt;
  sim.offense.forEach((p) => {
    const art = RA ? RA.art(p) : null; if (!art) return;
    const col = readColor(sim, p);
    routeLines.push({ pts: art.pts.map((q) => new THREE.Vector3(W(q.x), 0.15, Z(q.y))), end: art.end, curved: art.curved, source: art.source, col: '#' + col.toString(16).padStart(6, '0'), read: p.read, lbl: p.read < 0 ? '' : p.read === sim.play.progression.length - 1 ? 'CD' : String(p.read + 1), id: p.id });
  });
}
const routesAllowed = () => !(state.diff === 'pro' && localStorage.getItem('pocketiq3d.routesAtPro') === 'off');
function setRoutes(on) { routeGroup.visible = !!on && routesAllowed(); const b = document.getElementById('routes-btn'); if (b) b.classList.toggle('on', routeGroup.visible); }

// ---------------- v8 scale debug overlay (K; Shift+K = draw the engine's raw, uncompressed box) ----------------
const scaleDbg = { on: false, group: null, bars: [], hud: null };
function setScaleDebug(on) {
  scaleDbg.on = on;
  if (on && !scaleDbg.group) {
    const g = scaleDbg.group = new THREE.Group(); g.renderOrder = 5;
    const grid = new THREE.GridHelper(60, 60, 0x00e5ff, 0x00e5ff); grid.material.transparent = true; grid.material.opacity = 0.28; grid.position.set(0, 0.03, -18); g.add(grid);
    const grid5 = new THREE.GridHelper(60, 12, 0xffffff, 0xffffff); grid5.material.transparent = true; grid5.material.opacity = 0.55; grid5.position.set(0, 0.035, -18); g.add(grid5);
    // lateral ruler along the LOS: ticks every yard, labels every 5
    const tickG = new THREE.BoxGeometry(0.04, 0.02, 0.5), tm = new THREE.MeshBasicMaterial({ color: 0xffea00 });
    const ticks = new THREE.InstancedMesh(tickG, tm, 61), o = new THREE.Object3D();
    for (let i = 0; i <= 60; i++) { o.position.set(i - 30, 0.05, 0.6); o.scale.set(1, 1, i % 5 ? 0.5 : 1.4); o.updateMatrix(); ticks.setMatrixAt(i, o.matrix); }
    g.add(ticks);
    scaleDbg.barGeo = new THREE.BoxGeometry(0.05, 1, 0.05); scaleDbg.barGeo.translate(0, 0.5, 0);
    scaleDbg.barMat = new THREE.MeshBasicMaterial({ color: 0xff3df2, depthTest: false, transparent: true, opacity: 0.85 });
    scaleDbg.footGeo = new THREE.BoxGeometry(0.22, 0.012, 0.012); scaleDbg.footMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    scene.add(g);
    const hud = scaleDbg.hud = document.createElement('div'); hud.id = 'scale-hud';
    hud.style.cssText = 'position:fixed;left:12px;bottom:84px;z-index:30;background:rgba(5,12,20,.82);color:#dff;font:12px/1.45 system-ui;padding:8px 10px;border-radius:10px;border:1px solid #0ee3;pointer-events:none;max-width:300px';
    document.body.appendChild(hud);
  }
  if (scaleDbg.group) scaleDbg.group.visible = on;
  if (scaleDbg.hud) scaleDbg.hud.hidden = !on;
  scaleDbg.bars.forEach((b) => (b.visible = on));
}
function updateScaleDebug() {
  const g = scaleDbg.group; g.position.z = 0;
  while (scaleDbg.bars.length < actors.length) {
    const b = new THREE.Group(), bar = new THREE.Mesh(scaleDbg.barGeo, scaleDbg.barMat); bar.renderOrder = 6; b.add(bar);
    const feet = new THREE.InstancedMesh(scaleDbg.footGeo, scaleDbg.footMat, 7), o = new THREE.Object3D(); feet.renderOrder = 7;
    for (let f = 0; f < 7; f++) { o.position.set(0, (f + 1) / 3, 0); o.updateMatrix(); feet.setMatrixAt(f, o.matrix); } b.add(feet);
    b.userData.bar = bar; scene.add(b); scaleDbg.bars.push(b);
  }
  scaleDbg.bars.forEach((b, i) => {
    const a = actors[i]; b.visible = !!a; if (!a) return;
    const r = a.g.userData.rig; b.position.set(a.g.position.x + 0.45, 0, a.g.position.z); b.userData.bar.scale.y = r.heightYd;
  });
  const ol = actors.filter((a) => a.kind === 'ol'), qb = actors[0];
  const split = ol.length > 1 ? Math.abs(ol[1].g.position.x - ol[0].g.position.x) : 0;
  const fmt = (yd) => `${yd.toFixed(2)} yd (${Math.floor(yd * 3)}'${Math.round((yd * 3 % 1) * 12)}")`;
  const hs = {}; actors.forEach((a) => { const r = a.g.userData.rig; hs[r.pos] = r.heightYd; });
  const k = window.__boxK != null ? window.__boxK : BOX_K;
  scaleDbg.hud.innerHTML = `<b>Scale debug</b> (K) · 1 grid square = 1 yd, bright lines every 5 yd<br>` +
    `Bars = player height, white ticks every 1 ft<br>` + Object.entries(hs).map(([p, h]) => `${p} ${fmt(h)}`).join(' · ') +
    `<br>OL centre-to-centre ${fmt(split)} · QB depth ${Math.abs(qb.g.position.z).toFixed(1)} yd<br>Box spacing ×${k} ${k === 1 ? '(engine raw)' : '(Shift+K: raw)'} · ball 11 in · hashes 18'6" apart`;
}

// ---------------- ball ----------------
// v9 fix: in v8 a comment swallowed `ballMesh.castShadow = true; ball.add(ballMesh);`, so the ball mesh was never in the scene.
// True size is 6.7 x 11 in; for readability on a phone the ball group is drawn at BALL_VIS x (documented in README v9).
const BALL_VIS = 1.45;
const ball = new THREE.Group();
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.093, 18, 12), new THREE.MeshStandardMaterial({ color: 0x9a4a16, roughness: 0.55, emissive: 0x5a2810, depthTest: false, depthWrite: false, transparent: true }));
ballMesh.scale.set(1, 1, 1.645); ballMesh.castShadow = true; ballMesh.frustumCulled = false; ballMesh.renderOrder = 20; ball.add(ballMesh); // v11: transparent+no depth so sideline/result ball stays readable over bodies
const laceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: true });
const lace = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.014, 0.1), laceMat); lace.position.y = 0.09; ballMesh.add(lace);
[-0.07, 0.07].forEach((z) => { const st = new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.006, 4, 18), laceMat); st.position.z = z * 0.62; ballMesh.add(st); }); // white stripes
ball.scale.setScalar(BALL_VIS); ball.name = 'football'; ball.renderOrder = 20; scene.add(ball);
// flight trail: fixed-size ring buffer, no per-frame allocation
const TRAIL_N = 14, trailPos = new Float32Array(TRAIL_N * 3), trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.55, depthWrite: false }));
trail.frustumCulled = false; trail.visible = false; scene.add(trail);
let trailHead = 0, trailFill = 0;
function pushTrail(p) {
  if (trailFill && Math.hypot(trailPos[0] - p.x, trailPos[1] - p.y, trailPos[2] - p.z) < 0.15) return;
  trailPos.copyWithin(3, 0, TRAIL_N * 3 - 3); trailPos[0] = p.x; trailPos[1] = p.y; trailPos[2] = p.z;
  trailFill = Math.min(TRAIL_N, trailFill + 1); trailGeo.setDrawRange(0, trailFill); trailGeo.attributes.position.needsUpdate = true;
}
function resetTrail() { trailFill = 0; trailHead = 0; trailGeo.setDrawRange(0, 0); trail.visible = false; }
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
ballShadow.rotation.x = -Math.PI / 2; ballShadow.position.y = 0.025; scene.add(ballShadow);

// ---------------- replay overlays ----------------
const overlay = new THREE.Group(); overlay.name = 'overlay'; scene.add(overlay);
// v6.1: deep dispose — nested arrow-head geometries, per-rep materials and label CanvasTextures used to leak (~4 geometries + 1 texture per rep)
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry && !c.isSprite && c.geometry.dispose) c.geometry.dispose();
    const ms = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
    ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}
function clearOverlay() { while (overlay.children.length) { const c = overlay.children.pop(); disposeTree(c); } }
function drawCoverage(sim) {
  // v12: analysis/replay overlay uses ORIGINAL authored jobs + pre-snap alignments (job0 / sx0),
  // not live-mutated prefer/read resolutions or post-throw rush→tiny-zone. Live v11 AI unchanged.
  clearOverlay();
  sim.defense.forEach((d) => {
    let j = d.job0 ? JSON.parse(JSON.stringify(d.job0)) : (d.job.type === 'read' ? d.job.no : d.job);
    if (j && j.type === 'read') j = j.no || j.yes || j; // authored read: show the default drop
    const ax = d.sx0 != null ? d.sx0 : d.sx, ay = d.sy0 != null ? d.sy0 : d.sy;
    if (j.type === 'zone') {
      const m = new THREE.Mesh(new THREE.CircleGeometry(j.r, 40), new THREE.MeshBasicMaterial({ color: j.deep ? 0x3b82f6 : 0xf59e0b, transparent: true, opacity: 0.22, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(W(j.x), 0.04, Z(j.y)); overlay.add(m);
      const edge = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.2, j.r - 0.12), j.r, 48), new THREE.MeshBasicMaterial({ color: j.deep ? 0x60a5fa : 0xfbbf24, transparent: true, opacity: 0.8, depthWrite: false }));
      edge.rotation.x = -Math.PI / 2; edge.position.copy(m.position); edge.position.y = 0.05; overlay.add(edge);
    } else if (j.type === 'man') {
      const r = sim.refs[j.ref]; if (!r) return;
      const pts = [new THREE.Vector3(W(ax), 0.1, Z(ay)), new THREE.Vector3(W(r.posAt(0).x), 0.1, Z(r.posAt(0).y))];
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xff5a5a, dashSize: 0.6, gapSize: 0.4 })); ln.computeLineDistances(); overlay.add(ln);
    } else {
      const pts = [new THREE.Vector3(W(ax), 0.1, Z(ay)), new THREE.Vector3(W(sim.qb.sx), 0.1, Z(sim.qb.sy - 2))];
      overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff2d2d })));
    }
  });
  drawProtection(sim, overlay);
  sim.offense.forEach((p) => {
    if (p.read < 0 && !p.route.yac) return;
    const pts = []; for (let t = 0; t <= 4; t += 0.1) { const q = p.posAt(t); pts.push(new THREE.Vector3(W(q.x), 0.08, Z(q.y))); }
    const best = p.id === sim.play.correct;
    overlay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: best ? 0x3ee08f : 0xffffff, transparent: true, opacity: best ? 1 : 0.55 })));
  });
}

// protection arrows: blocker -> rusher (white = blocked, amber = late pickup), FREE rusher -> QB in red
function textSprite(txt, color, bg) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = bg || '#000a'; x.beginPath(); x.roundRect ? x.roundRect(4, 8, 248, 48, 14) : x.rect(4, 8, 248, 48); x.fill();
  x.font = 'bold 34px system-ui,sans-serif'; x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 128, 33);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true })); sp.scale.set(4, 1, 1); sp.renderOrder = 9;
  sp.geometry = sp.geometry || { dispose() {} }; return sp;
}
function arrow(group, a, b, color, width) {
  const pts = [new THREE.Vector3(W(a.x), 0.12, Z(a.y)), new THREE.Vector3(W(b.x), 0.12, Z(b.y))];
  const m = ribbon(pts.map((p) => ({ x: p.x, z: p.z })), width || 0.25, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  m.renderOrder = 7; group.add(m);
  const tri = new THREE.Shape(); tri.moveTo(0, 0.7); tri.lineTo(-0.45, -0.3); tri.lineTo(0.45, -0.3); tri.lineTo(0, 0.7);
  const h = new THREE.Mesh(new THREE.ShapeGeometry(tri), m.material); h.rotation.x = -Math.PI / 2; h.renderOrder = 7;
  const hold = new THREE.Group(); hold.add(h); hold.position.set(W(b.x), 0.13, Z(b.y)); hold.rotation.y = Math.atan2(-(W(b.x) - W(a.x)), -(Z(b.y) - Z(a.y))); hold.geometry = { dispose() {} }; group.add(hold);
}
function drawProtection(sim, group) {
  if (!sim.prot) return;
  const home = (id) => { const o = sim.ol.find((q) => q.id === id) || sim.offense.find((q) => q.id === id); return o ? { x: o.sx != null && o.sx0 == null ? o.sx : o.sx0, y: o.sy != null && o.sy0 == null ? o.sy : o.sy0 } : null; };
  sim.prot.rows.forEach((r) => {
    const d = sim.defense.find((q) => q.id === r.rusher); if (!d) return;
    const from = { x: d.sx, y: d.sy };
    if (!r.blocker) { arrow(group, from, { x: sim.qb.sx, y: sim.qb.sy - 1.5 }, 0xff2d2d, 0.45); const t = textSprite('FREE ' + (d.label || d.id), '#fff', '#d11a2acc'); t.position.set(W(d.sx), 3.4, Z(d.sy)); group.add(t); return; }
    const b = home(r.blocker); if (!b) return;
    arrow(group, b, { x: from.x, y: from.y - 0.5 }, r.kind === 'late' ? 0xffb020 : r.blocker[0] === 'O' ? 0xe5e7eb : 0x60a5fa, r.kind === 'late' ? 0.35 : 0.22);
    if (r.kind === 'late') { const t = textSprite('LATE', '#111', '#ffb020dd'); t.position.set(W(d.sx), 3.2, Z(d.sy)); group.add(t); }
  });
  sim.prot.kept.forEach((id) => { const p = sim.offense.find((q) => q.id === id); if (!p) return; const t = textSprite(id + ' BLOCKS', '#bfe3ff', '#0b2540cc'); t.scale.set(3.2, 0.8, 1); t.position.set(W(p.sx0), 2.9, Z(p.sy0)); group.add(t); });
  const lab = textSprite('PROT: ' + Prot.PROT[sim.protId].label, '#3ee08f', '#000c'); lab.position.set(0, 0.8, Z(-9)); lab.scale.set(5, 1.25, 1); group.add(lab);
}

// ---------------- state ----------------
const state = {
  diff: localStorage.getItem('pocketiq3d.diff') || 'starter',
  sim: null, answers: {}, order: [], view: 'qb',
  yaw: 0, yawTarget: 0, shake: 0, acc: 0, prev: new Map(),
  rec: [], replay: null, graded: false, dd: null, session: { reps: 0, streak: 0 },
  mode: M.getMode(), orig: null, audible: null, prot: null, seed: 1, custom: null,
};
$('difficulty').value = state.diff;
$('difficulty').onchange = (e) => { state.diff = e.target.value; localStorage.setItem('pocketiq3d.diff', state.diff); nextPlay(window.PocketHub && window.PocketHub.nextForced ? window.PocketHub.nextForced() : undefined); };

const SHORT = { C0: 'Cov 0', C1: 'Cov 1', C2: 'Cov 2', C3: 'Cov 3', C4: 'Cov 4', none: 'None', left: 'Blitz L', middle: 'A-gap', right: 'Blitz R' };
function buildChoices(elId, options, key) {
  const el = $(elId);
  options.forEach((o) => {
    const b = document.createElement('button'); b.textContent = SHORT[o.id] || o.label; b.title = o.label; b.dataset.id = o.id; b.className = 'choice';
    b.onclick = () => { if (!state.sim || state.sim.phase !== 'presnap') return; state.answers[key] = o.id; el.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b)); };
    el.appendChild(b);
  });
}
// ---- coverage picker: family chips, then variant chips (detailed calls) ----
const VAR = Object.fromEntries(D.VARIANTS.map((v) => [v.id, v]));
const detailedOn = () => { const v = localStorage.getItem('pocketiq3d.detailed'); return v ? v === 'on' : state.diff !== 'rookie' && state.diff !== 'youth'; };
// v14: pre-snap time is always unlimited (no timer, no auto-snap, no toggle). The old v3 setting is ignored and cleared.
try { localStorage.removeItem('pocketiq3d.unlimited'); } catch (e) {}
const gameType = () => localStorage.getItem('pocketiq3d.gameType') === 'read' ? 'read' : 'call'; // v12: 'call' = predict, 'read' = just throw
window.__gameType = gameType;
window.__setGameType = (t) => { localStorage.setItem('pocketiq3d.gameType', t === 'read' ? 'read' : 'call'); };
function buildCoveragePicker() {
  const fam = $('cov-choices'), vr = $('var-choices');
  D.COVERAGE_OPTIONS.forEach((o) => {
    const b = document.createElement('button'); b.textContent = SHORT[o.id]; b.title = o.label; b.dataset.id = o.id; b.className = 'choice fam';
    b.onclick = () => {
      if (!state.sim || state.sim.phase !== 'presnap') return;
      state.answers.coverage = o.id; state.answers.variant = null;
      fam.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b));
      renderVariants();
    };
    fam.appendChild(b);
  });
  function renderVariants() {
    vr.innerHTML = '';
    const f = state.answers.coverage, on = detailedOn();
    $('var-grp').hidden = !on;
    if (!on) return;
    if (!f) { vr.innerHTML = '<span class="hint">pick a family →</span>'; return; }
    const list = D.VARIANTS.filter((v) => v.family === f);
    if (list.length === 1) state.answers.variant = list[0].id;
    list.forEach((v) => {
      const b = document.createElement('button'); b.textContent = v.label; b.title = v.name + ' — ' + v.tell; b.className = 'choice var' + (state.answers.variant === v.id ? ' selected' : '');
      b.onclick = () => { if (!state.sim || state.sim.phase !== 'presnap') return; state.answers.variant = v.id; vr.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b)); };
      vr.appendChild(b);
    });
  }
  state.renderVariants = renderVariants;
}
buildCoveragePicker();
// v11: Front picker removed from Coverage bubble (fronts still drive alignment via state.front)
function syncToggles() {
  $('opt-detailed').checked = detailedOn();
  $('q-det').classList.toggle('on', detailedOn());
  if (state.renderVariants) state.renderVariants();
  if (state.renderPVar) state.renderPVar();
}
const setDet = (v) => { localStorage.setItem('pocketiq3d.detailed', v ? 'on' : 'off'); syncToggles(); };
$('opt-detailed').onchange = (e) => setDet(e.target.checked);
$('q-det').onclick = () => setDet(!detailedOn());
$('opt-detailed-auto').onclick = () => { localStorage.removeItem('pocketiq3d.detailed'); syncToggles(); };
// ---- pressure picker: family chips, then blitz variant chips (family-only quick mode when detail is off / Rookie) ----
const quickPressure = () => !detailedOn();
function buildPressurePicker() {
  const fam = $('pres-choices'), vr = $('pvar-choices');
  D.PRESSURE_FAMILIES.forEach((f) => {
    const b = document.createElement('button'); b.textContent = f.label; b.title = f.name; b.dataset.id = f.id; b.className = 'choice fam';
    b.onclick = () => { if (!state.sim || state.sim.phase !== 'presnap') return; state.answers.pressFam = f.id; state.answers.pressVar = null; fam.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b)); renderP(); };
    fam.appendChild(b);
  });
  function renderP() {
    vr.innerHTML = ''; const on = !quickPressure(); $('pvar-grp').hidden = !on; if (!on) return;
    const f = state.answers.pressFam; if (!f) { vr.innerHTML = '<span class="hint">family →</span>'; return; }
    const list = Object.entries(D.BLITZES).filter(([, b]) => b.family === f);
    if (list.length === 1) state.answers.pressVar = list[0][0];
    list.forEach(([id, bl]) => {
      const b = document.createElement('button'); b.textContent = bl.label; b.title = bl.name + ' — tell: ' + bl.tell; b.className = 'choice var' + (state.answers.pressVar === id ? ' selected' : '');
      b.onclick = () => { if (!state.sim || state.sim.phase !== 'presnap') return; state.answers.pressVar = id; vr.querySelectorAll('button').forEach((x) => x.classList.toggle('selected', x === b)); };
      vr.appendChild(b);
    });
  }
  state.renderPVar = renderP;
}
buildPressurePicker();
// ---- protection call ----
const protSel = $('prot-sel');
Prot.PROTECTIONS.forEach((p) => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.label; o.title = p.name; protSel.appendChild(o); });
protSel.onchange = () => setProtection(protSel.value);
// v5: protection options as detailed buttons in the Protection popover
Prot.PROTECTIONS.forEach((p) => { const b = document.createElement('button'); b.className = 'choice prot'; b.dataset.id = p.id; b.innerHTML = `<b>${p.label}</b> <small>${p.name}</small>`; b.title = p.name;
  b.onclick = () => setProtection(p.id); $('prot-choices').appendChild(b); });
function syncProtButtons() { document.querySelectorAll('#prot-choices .choice').forEach((b) => b.classList.toggle('selected', b.dataset.id === protSel.value)); }
function setProtection(id) {
  const sim = state.sim; if (!sim || sim.phase !== 'presnap' || sim.play.type === 'run') return;
  state.prot = id; state.protTouched = true; protSel.value = id; rebuildSim(); updateBubbles();
}
// ---- audibles ----
function audMenu() { if (!state.audMenu || !state.orig) state.audMenu = state.orig ? M.audibleTree(state.orig, state.mode, state.audRep || 0) : []; return state.audMenu; }
function renderAudibles() {
  const el = $('aud-choices'); el.innerHTML = '';
  const base = state.orig; if (!base) return;
  const opts = [{ id: null, label: 'Keep play', desc: 'Stay with the called play' }, ...audMenu()];
  opts.forEach((o) => {
    const b = document.createElement('button'); b.className = 'choice aud' + ((state.audible || null) === o.id ? ' selected' : '') + (o.type === 'run' ? ' run' : o.type === 'pass' ? ' pass' : '');
    b.innerHTML = `<span class="an">${o.label}</span><span class="ad">${o.type ? (o.type === 'run' ? 'RUN · ' : 'PASS · ') : ''}${o.desc || ''}</span>`; b.dataset.aud = o.id || 'keep'; b.title = o.id ? `Audible to ${o.label} (${o.type}) — ${o.desc || ''}` : 'Stay with the called play';
    b.onclick = () => setAudible(o.id); el.appendChild(b);
  });
}
function setAudible(id) {
  const sim = state.sim; if (!sim || sim.phase !== 'presnap') return;
  state.audible = id || null; state.audAnswered = true; rebuildSim(); renderAudibles(); updateBubbles();
}
function currentPlay() { return state.audible ? M.makeAudible(state.orig, state.audible) : state.orig; }
function simOpts() { const cfg = DIFF[state.diff]; return { pocketMul: cfg.pocketMul, disguise: cfg.disguise, intMul: cfg.intMul, react: cfg.react, disc: cfg.disc, seed: state.seed, protection: state.prot, front: state.front || undefined }; }
function rebuildSim() {
  const play = currentPlay();
  if (play.protection && !state.protTouched) state.prot = play.protection;
  const sim = E.createSim(play, Math.random, simOpts());
  state.sim = sim; clearOverlay(); buildActors(sim); snapshotPrev(); setClock(0, sim.sackTime);
  $('prot-grp').hidden = play.type === 'run'; $('b-prot').hidden = play.type === 'run'; protSel.value = sim.protId || 'BOB'; syncProtButtons();
  $('concept').textContent = `${state.audible ? state.orig.name + ' → ' : ''}${play.name.replace(' (audible)', '')} · ${D.FORMATIONS[play.formation].name}`;
}
protSel.addEventListener('change', () => (state.protTouched = true));
// ---- v5 bubbles: one popover at a time; tap bubble again / outside / Esc closes; snap closes ----
function closePops() { document.querySelectorAll('#presnap .pop').forEach((p) => (p.hidden = true)); document.querySelectorAll('#presnap .bubble').forEach((b) => b.classList.remove('open')); }
function togglePop(id) {
  const p = $(id), open = p.hidden; closePops();
  if (open && state.sim && state.sim.phase === 'presnap') { p.hidden = false; document.querySelector(`.bubble[data-pop="${id}"]`).classList.add('open'); }
}
document.querySelectorAll('#presnap .bubble[data-pop]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); togglePop(b.dataset.pop); }));
document.addEventListener('pointerdown', (e) => { if (!e.target.closest || e.target.closest('#presnap .pop') || e.target.closest('#presnap .bubble')) return; closePops(); }, true);
$('presnap').addEventListener('click', () => setTimeout(updateBubbles, 0)); // any answer chip → refresh glow/labels
const PFAM = Object.fromEntries(D.PRESSURE_FAMILIES.map((f) => [f.id, f]));
function updateBubbles() {
  const A = state.answers || {};
  const fam = A.coverage ? SHORT[A.coverage] || A.coverage : '';
  const cov = A.variant && VAR[A.variant] ? `${fam} ${VAR[A.variant].label}` : fam;
  const pr = A.pressVar && D.BLITZES[A.pressVar] ? D.BLITZES[A.pressVar].label : A.pressFam ? (PFAM[A.pressFam] || {}).label || A.pressFam : '';
  const bc = $('b-cov'); bc.classList.toggle('ans', !!(cov || pr)); bc.classList.toggle('full', !!(cov && pr));
  bc.querySelector('small').textContent = [cov, pr].filter(Boolean).join(' · ');
  const bp = $('b-prot'); bp.classList.toggle('ans', !!state.protTouched); bp.querySelector('small').textContent = state.sim && state.sim.protId ? Prot.PROT[state.sim.protId].label : '';
  const ba = $('b-aud'); ba.classList.toggle('ans', !!state.audAnswered);
  ba.querySelector('small').textContent = state.audAnswered ? (state.audible ? currentPlay().name.replace(' (audible)', '').slice(0, 18) : 'Keep') : '';
  $('aud-mode').textContent = M.MODES.find((m) => m.id === state.mode).label + ' checks';
  const d = A.variant && VAR[A.variant] ? `${VAR[A.variant].name}: ${VAR[A.variant].tell}` : '';
  const bz = A.pressVar && D.BLITZES[A.pressVar] ? `${D.BLITZES[A.pressVar].name}: ${D.BLITZES[A.pressVar].tell || ''}` : '';
  $('cov-desc').innerHTML = [d, bz].filter(Boolean).map((t) => `<div>${t}</div>`).join('');
}
// ---- modes ----
const modeSel = $('mode-sel');
M.MODES.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; modeSel.appendChild(o); });
modeSel.value = state.mode;
function setMode(m) { state.mode = m; M.setMode(m); modeSel.value = m; state.order = []; renderMenu(); nextPlay(); }
modeSel.onchange = () => setMode(modeSel.value);
function renderMenu() {
  $('menu-modes').innerHTML = M.MODES.map((m) => `<button class="mode-card${m.id === state.mode ? ' on' : ''}" data-mode="${m.id}"><b>${m.label}</b><span>${m.desc}</span><small>${M.pool(m.id).length} plays</small></button>`).join('');
  $('menu-modes').querySelectorAll('button').forEach((b) => (b.onclick = () => { setMode(b.dataset.mode); $('menu').hidden = true; }));
}
renderMenu();
$('menu-btn').onclick = () => { renderMenu(); $('menu').hidden = !$('menu').hidden; };
$('menu-close').onclick = () => ($('menu').hidden = true);
$('menu-progress').onclick = () => { $('menu').hidden = true; updateStats(); $('history').hidden = false; };
// v6 settings in the ☰ menu: Camera + Graphics (persisted)
$('cam-sel').value = camMode(); $('cam-sel').onchange = (e) => { localStorage.setItem('pocketiq3d.camera', e.target.value); };
$('set-stadium').value = stadiumCur; $('set-stadium').onchange = (e) => setStadium(e.target.value);
window.__gfxInfo = () => ({ geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls });
$('gfx-sel').value = GFX; $('gfx-sel').onchange = (e) => { localStorage.setItem('pocketiq3d.graphics', e.target.value); $('gfx-note').textContent = 'Reloading to apply…'; setTimeout(() => location.reload(), 250); };
$('menu-custom').onclick = () => { $('menu').hidden = true; if (window.QBCustom) window.QBCustom.open(); };

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
function fieldPosLabel(abs) { return abs < 50 ? `OWN ${abs}` : abs === 50 ? 'MIDFIELD' : `OPP ${100 - abs}`; }

// ---------------- flow ----------------
function nextPlay(forced) {
  let play = forced;
  if (!play) {
    const all = M.pool(state.mode), flt = state.poolFilter ? all.filter(state.poolFilter) : all, pool = flt.length ? flt : all;
    if (!state.order.length) state.order = shuffle(pool.map((_, i) => i));
    play = pool[state.order.pop()] || pool[0];
  }
  const cfg = DIFF[state.diff];
  state.orig = play; state.audRep = (state.audRep || 0) + 1; state.audMenu = M.audibleTree(play, state.mode, state.audRep, (state.audMenu || []).map((x) => x.id)); state.audible = null; state.custom = forced && forced.custom ? forced : null; state.protTouched = false; state.audAnswered = false;
  state.prot = play.protection || 'BOB'; state.seed = 1 + Math.floor(Math.random() * 1e9); state.front = (forced && forced.front) || play.front || (window.QBDefense ? window.QBDefense.pick(play, state.seed) : null);
  state.answers = {}; setTimeout(syncToggles, 0); state.graded = false; state.autoReplayed = false; state.replay = null; state.intT = null; state.celebrate = null; state.intPending = null; state.postT = null; POSTP.plan = null; resetTrail(); { const c = $('caption'); if (c) c.hidden = true; }
  $('banner').hidden = true; $('taunt').hidden = true; $('prot-chip').hidden = true; setRoutes(false); state.rec = []; state.acc = 0;
  state.gradeWait = null; clearTimeout(state.gradeWD); state.pre = null;
  rebuildSim();
  const sim = state.sim;
  setTimeout(() => { if (state.sim === sim && sim.phase === 'presnap') precompute(sim); }, 0); // v10: start the worker analysis pre-snap
  state.dd = { down: play.togo ? 3 : 1 + Math.floor(Math.random() * 3), togo: play.togo || [3, 5, 7, 8, 10, 6][Math.floor(Math.random() * 6)], los: 20 + Math.floor(Math.random() * 35) };
  placeField(state.dd.los, state.dd.togo);
  document.querySelectorAll('#presnap .choice').forEach((b) => b.classList.remove('selected'));
  $('result').hidden = true; $('presnap').hidden = false; $('presnap').classList.remove('live'); closePops(); $('call-chip').hidden = true; $('history').hidden = true; $('snap-btn').disabled = false;
  renderAudibles(); updateBubbles();
  $('dd').textContent = `${ordinal(state.dd.down)} & ${state.dd.togo} · ${fieldPosLabel(state.dd.los)}`;
  $('mode-tag').textContent = (forced && forced.custom ? 'CUSTOM · ' : '') + M.MODES.find((m) => m.id === state.mode).label.toUpperCase();
  const gt = gameType();
  $('presnap').classList.toggle('just-read', gt === 'read');
  if (gt === 'read') setPhase(`PRE-SNAP · ${cfg.label.toUpperCase()} · JUST READ — no ID needed · throw the right receiver`);
  else setPhase(`PRE-SNAP · ${cfg.label.toUpperCase()} · ${detailedOn() ? 'family + variant' : 'ID the coverage'} · pressure · protection / audible`);
  state.view = 'qb'; state.yawTarget = 0; $('view-btn').textContent = 'Coach view';
  void sim;
}

function buildActors(sim) {
  clearActors();
  const add = (src, team, kind, opts) => { const g = makePlayer(team, NUMS[src.id] || 0, opts); actors.push({ g, src, kind }); if (opts && opts.hit) hitMeshes.push(g.userData.hit); return g; };
  add(sim.qb, TEAM_O, 'qb', { build: 'skill', pos: 'QB' });
  sim.ol.forEach((o) => add(o, TEAM_O, 'ol', { build: 'big', pos: 'OL' }));
  sim.offense.forEach((o) => add(o, TEAM_O, 'wr', { hit: o.id, build: buildFor('wr', o), pos: posGroup('wr', o) }));
  sim.defense.forEach((d) => { const k = (d.down != null ? d.down : /^(DE|DT|NT)/.test(d.id)) ? 'dl' : 'def'; // v10: stance from the front (hands down vs stand-up)
    add(d, TEAM_D, k, { build: buildFor(k, d), pos: posGroup(k, d) }); });
  buildBadges(sim); buildRoutes(sim); updateRoutesBtn();
  actors.forEach((a) => { const p = a.src; a.g.position.set(W(p.x), 0, Z(p.y)); a.g.rotation.y = a.kind === 'def' || a.kind === 'dl' ? Math.PI : 0; a.g.userData.heading = a.g.rotation.y; a.g.userData.stance = true; });
}

function doSnap() {
  const sim = state.sim; if (!sim || sim.phase !== 'presnap') return;
  E.snap(sim);
  precompute(sim); // v10: async (worker) — never blocks the frame loop
  closePops(); $('presnap').classList.add('live'); $('snap-btn').disabled = true;
  const sc = state.answers.variant && VAR[state.answers.variant] ? VAR[state.answers.variant].name : (state.answers.coverage || '—');
  const sp = state.answers.pressVar && D.BLITZES[state.answers.pressVar] ? D.BLITZES[state.answers.pressVar].label : ((D.PRESSURE_FAMILIES.find((o) => o.id === state.answers.pressFam) || {}).label || '—');
  const pl = sim.play;
  if (gameType() === 'read') $('call-chip').textContent = 'Just read · make the throw'; else $('call-chip').textContent = `Your call: ${sc} · ${sp}${state.audible ? ' · AUDIBLE ' + pl.name.replace(' (audible)', '') : ''}`; $('call-chip').hidden = false;
  if (sim.prot) {
    const pr = sim.prot, hot = pr.free.some((r) => r.arrive < 2.6);
    $('prot-chip').innerHTML = `PROT <b>${Prot.PROT[sim.protId].label}</b> · ${pr.blockers} blk vs ${pr.rushers} rush${pr.kept.length ? ' · ' + pr.kept.join('+') + ' in' : ''}${hot ? ' · <span class="hot">HOT!</span>' : ''}`;
    $('prot-chip').className = hot ? 'hot' : ''; $('prot-chip').hidden = false;
  } else { $('prot-chip').innerHTML = `RUN <b>${Run.RUN_CONCEPTS[sim.run.concept].name}</b>${pl.rpo ? ' · RPO: tap ' + pl.rpo.target + ' before the mesh' : ''}`; $('prot-chip').className = 'run'; $('prot-chip').hidden = false; }
  setPhase(pl.type === 'run' ? (pl.rpo ? 'LIVE · RPO: throw ' + pl.rpo.target + ' now or let it hand off' : 'LIVE · handoff…') : 'LIVE · tap a receiver or press 1–4');
}

function throwTo(id) {
  const sim = state.sim; if (!sim || sim.phase !== 'live') return;
  if (E.throwTo(sim, id)) { setPhase(`Ball out to ${id}…`); markBadge(id, 'thrown'); }
}

function setPhase(t) { $('phase').textContent = t; }
// v6: DOM writes are cached — a style/text is only touched when its value actually changes.
const domCache = new Map();
function setText(el, v) { if (domCache.get(el) !== v) { domCache.set(el, v); el.textContent = v; } }
function setStyle(el, k, v) { const key = el.id + ':' + k; if (domCache.get(key) !== v) { domCache.set(key, v); el.style[k] = v; } }
const clockFill = $('clock-fill'), clockLabel = $('clock-label');
function setClock(t, max) {
  const f = Math.min(1, t / max);
  setStyle(clockFill, 'width', (f * 100).toFixed(1) + '%');
  setStyle(clockFill, 'background', f < 0.6 ? '#3ee08f' : f < 0.85 ? '#ffb020' : '#ff4d4d');
  setText(clockLabel, `Pocket ${Math.max(0, max - t).toFixed(1)}s`);
}

// ---------------- grading (SIM score 0-100) — pure logic lives in js/grading.js ----------------
function evalsFor(sim) { return M.audibleEvals(state.orig, audMenu(), sim.opts); }
// v10: analysis runs in a Web Worker (js/analysis-worker.js). Fallback (no Worker, e.g. file://) = sliced on idle, never inside a frame.
let AW = null, awSeq = 0; const awJobs = new Map();
try { AW = new Worker('js/analysis-worker.js'); AW.onmessage = (e) => { const j = awJobs.get(e.data.id); awJobs.delete(e.data.id); if (j) j(e.data); }; AW.onerror = (e) => { console.warn('analysis worker failed, using fallback', e.message); AW = null; awJobs.forEach((cb) => cb(null)); awJobs.clear(); }; } catch (e) { AW = null; }
const preKey = (sim) => [state.orig && state.orig.id, sim.play.id, sim.play.name, sim.cov && sim.cov.variant, sim.play.pressure, state.mode, state.diff, state.audRep, state.front].join('|');
function plain(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
function precompute(sim) { // async; resolves state.pre for this sim
  const key = preKey(sim);
  if (state.pre && state.pre.sim === sim && state.pre.key === key) return state.pre;
  if (state.preReq && state.preReq.key === key && state.preReq.sim === sim) return null;
  const req = state.preReq = { sim, key, t0: performance.now() };
  const done = (r) => {
    if (state.preReq !== req) return;
    state.preReq = null;
    if (!r) { setTimeout(() => done(syncCompute(sim)), 0); return; } // worker died: compute once, off the frame
    if (r.err) console.warn('analysis', r.err);
    state.pre = { sim, key, evals: r.evals, protTable: r.protTable, ms: Math.round(performance.now() - req.t0) };
    if (state.gradeWait === sim) finishGrade();
  };
  const msg = { base: plain(state.orig), play: plain(sim.play), opts: plain({ ...sim.opts }), mode: state.mode, menu: audMenu().map((a) => ({ id: a.id, label: a.label })) };
  if (AW && msg.base && msg.play && msg.opts) { const id = ++awSeq; msg.id = id; awJobs.set(id, done); AW.postMessage(msg); }
  else setTimeout(() => done(syncCompute(sim)), 0);
  return null;
}
function syncCompute(sim) {
  let evals = null, protTable = null;
  try { evals = evalsFor(sim); } catch (e) { console.warn('eval failed', e); }
  try { protTable = sim.prot ? M.protectionTable(sim.play, { ...sim.opts }) : null; } catch (e) { console.warn('prot table failed', e); }
  return { evals, protTable };
}
// v9 result caption: big, colour-coded, pops in the frame the engine resolves the play
function showCaption(sim) {
  const res = sim.result, el = $('caption'); if (!el || !res) return;
  let txt = res.text || res.type.toUpperCase(), cls = res.type, sub = '';
  const td = (res.type === 'complete' || res.type === 'run') && LOS + (res.yards || 0) >= 100;
  if (res.type === 'complete') sub = `+${res.yards} YDS`;
  if (res.type === 'run') { txt = res.yards > 0 ? `+${res.yards} YDS` : res.yards < 0 ? `${res.yards} YDS` : 'NO GAIN'; cls = res.yards >= 4 ? 'complete' : res.yards >= 1 ? 'incomplete' : 'sack'; }
  if (res.type === 'sack') { txt = 'SACKED'; sub = '−7 YDS'; }
  if (res.type === 'interception') txt = 'INTERCEPTED';
  if (res.cause === 'pbu') txt = 'BROKEN UP';
  if (res.type === 'fumble') { txt = 'FUMBLE'; cls = 'interception'; }
  if (td) { txt = 'TOUCHDOWN'; cls = 'td'; }
  el.innerHTML = `<b>${txt}</b>${sub ? `<i>${sub}</i>` : ''}`;
  el.className = 'cap-' + cls; el.hidden = false; void el.offsetWidth; el.classList.add('go');
  state.captionAt = performance.now(); window.__captionAt = state.captionAt;
  clearTimeout(state.capTimer); state.capTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
function grade() {
  const sim = state.sim, play = sim.play, res = sim.result, cfg = DIFF[state.diff];
  const detailed = detailedOn();
  showCaption(sim); // v9: instant result caption (same frame the play ends)
  POSTP.plan = makePostPlan(sim); POSTP.lastT = -1; state.postT = 0;
  // v10: the caption + outcome + panel show NOW; the full grade waits for the worker analysis (watchdog 2.5 s → grade without EV table)
  const out0 = res.type === 'interception' ? `INTERCEPTED · ${posName(res.defLabel)}` : res.cause === 'pbu' ? 'BROKEN UP' : res.text + (res.type === 'complete' ? ` +${res.yards}` : res.type === 'sack' ? ' −7' : '');
  $('res-outcome').textContent = out0; $('result').hidden = false;
  const ready = state.pre && state.pre.sim === sim && state.pre.key === preKey(sim);
  if (!ready) {
    precompute(sim); state.gradeWait = sim; state.gradeAt = performance.now();
    $('sim-score').textContent = '…'; $('bars').innerHTML = '<div class="pi-small analyzing">Analyzing the rep…</div>'; $('res-list').innerHTML = ''; $('res-coach').textContent = ''; const _w=$('res-why'); if(_w)_w.textContent=''; const _s=$('res-sections'); if(_s)_s.innerHTML=''; const _m=$('res-more'); if(_m)_m.hidden=true;
    clearTimeout(state.gradeWD); state.gradeWD = setTimeout(() => { if (state.gradeWait === sim) { console.warn('analysis watchdog: grading without EV table'); state.pre = { sim, key: preKey(sim), evals: null, protTable: null, timedOut: true }; finishGrade(); } }, 2500);
    return;
  }
  finishGrade();
}
function finishGrade() {
  const sim = state.sim; if (!sim || !sim.result) return;
  state.gradeWait = null; clearTimeout(state.gradeWD);
  const play = sim.play, res = sim.result, cfg = DIFF[state.diff], detailed = detailedOn();
  const pre = state.pre || {}, evals = pre.evals, protTable = pre.protTable;
  const g = G.gradeRep({ sim, answers: state.answers, cfg, detailed, quickPressure: quickPressure(), evals, audible: state.audible ? { id: state.audible } : null, protTable, justRead: gameType() === 'read' });
  const parts = g.parts, max = g.max, sim100 = Math.round(g.score);
  state.session.reps++; state.session.streak = (play.type === 'run' ? parts['Run decision'] >= 35 : g.readOk) && res.type !== 'interception' && res.type !== 'fumble' ? state.session.streak + 1 : 0;
  let outcome = res.text + (res.type === 'complete' ? ` +${res.yards}` : res.type === 'sack' ? ' −7' : '');
  if (res.type === 'interception') outcome = `INTERCEPTED · ${posName(res.defLabel)}`;
  if (res.cause === 'pbu') outcome = 'BROKEN UP';
  $('res-outcome').textContent = outcome; $('res-outcome').className = res.type === 'run' ? (res.yards >= 4 ? 'complete' : res.yards >= 1 ? 'incomplete' : 'sack') : res.type === 'fumble' ? 'interception' : res.type;
  $('sim-score').textContent = sim100;
  const risk = g.risk;
  $('bars').innerHTML = Object.entries(parts).map(([k, v]) => (max[k] ? `<div class="bar"><span>${k}</span><div class="track"><div class="fill" style="width:${100 * Math.max(0, v) / max[k]}%"></div></div><span>${v}/${max[k]}</span></div>` : (v || k === 'Ball security') ? `<div class="bar risk"><span>${k}</span><div class="track"><div class="fill ${v < 0 ? 'bad' : ''}" style="width:${k === 'Ball security' ? Math.min(100, risk * 100) : Math.min(100, Math.abs(v) * 10)}%"></div></div><span>${v > 0 ? '+' : ''}${v}</span></div>` : '')).join('');
  const playsLine = state.audible ? `<li class="info">Called <b>${state.orig.name}</b> → audibled to <b>${play.name.replace(' (audible)', '')}</b></li>` : '';
  $('res-list').innerHTML = playsLine + g.lines.map(([ok, t]) => `<li class="${ok === 'info' ? 'info' : ok ? 'ok' : 'bad'}">${t}</li>`).join('');
  let coach = g.coach;
  const why = intWhy(sim), ti = sim.throwInfo;
  if (res.type === 'interception') coach = `Why it was picked: ${why} ` + coach;
  else if (res.type === 'complete' && risk > 0.12) coach = `Got away with it — ${Math.round(risk * 100)}% INT risk on that throw (${why}) ` + coach;
  else if (res.cause === 'pbu') coach = `Broken up by the ${posName(sim.defense.find((d) => d.id === res.defender).label)} in the throwing lane. ` + coach;
  if (ti && ti.miss && res.type !== 'interception') coach += ` Pressure (${Math.round(ti.pressure * 100)}%) made the ball ${ti.miss === 'sail' ? 'sail' : 'die short'} by ~${ti.errMag.toFixed(1)} yd.`;
  if (res.type === 'sack' && res.sackBy) coach = `Sacked by the ${posName((sim.defense.find((d) => d.id === res.sackBy) || {}).label)} (${res.sackKind === 'free' ? 'unblocked' : res.sackMove}). ` + coach;
  $('res-coach').textContent = coach;
  // INT: result + replay are driven by celebration game-time (state.intT), so slow frames never cut the dance short
  $('result').hidden = false; // v9: never gated by the INT celebration or the replay
  if (res.type === 'interception') state.intPending = { sim, shown: true };
  setPhase('REP COMPLETE · replay with coverage & protection shown');
  if (g.correct) markBadge(g.correct, 'best');
  state.lastGrade = g;
  const h = loadHistory();
  h.push({ v: 2, at: new Date().toISOString(), mode: state.mode, type: play.type || 'pass', play: play.id, orig: state.orig.id, audible: state.audible, custom: !!state.custom, diff: state.diff,
    coverage: sim.cov.shell, variant: sim.cov.variant, calledVariant: state.answers.variant || null, detailed, varOk: g.varOk, covOk: g.covOk, presOk: g.presOk, pressure: play.pressure,
    protection: sim.protId || null, protOk: parts.Protection == null ? null : parts.Protection >= 10, readOk: g.readOk, runOk: parts['Run decision'] == null ? null : parts['Run decision'] >= 35,
    audOk: parts.Audible == null ? null : parts.Audible >= 0, result: res.type, yards: res.yards || 0, int: res.type === 'interception', cause: res.cause || null, risk: +risk.toFixed(2), time: +g.time.toFixed(2), sim: sim100 });
  saveHistory(h); updateStats();
  try { window.dispatchEvent(new CustomEvent('pocketiq:rep', { detail: { rec: h[h.length - 1], g, play, sim, thrown: sim.throwInfo ? sim.throwInfo.id : null } })); } catch (e) { console.warn('rep hook', e); }
  drawCoverage(sim);
  if (res.at && (res.type === 'interception' || res.cause === 'pbu')) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 32), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.95, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(W(res.at.x), 0.07, Z(res.at.y)); overlay.add(m);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3), new THREE.MeshBasicMaterial({ color: 0xff2d55 })); pole.position.set(W(res.at.x), 1.5, Z(res.at.y)); overlay.add(pole);
  }
  if (res.type === 'interception') { $('banner').textContent = `INTERCEPTED by ${posName(res.defLabel)}`; $('banner').hidden = false; }
}

const POS = { C: 'cornerback', N: 'nickel', FS: 'free safety', SS: 'strong safety', W: 'Will linebacker', M: 'Mike linebacker', E: 'defensive end', T: 'defensive tackle', S: 'Sam linebacker', NT: 'nose tackle', DB: 'dime back' };
const posName = (l) => POS[l] || l || 'defender';
function intWhy(sim) {
  const r = sim.result, ti = sim.throwInfo; if (!ti) return '';
  const d = sim.defense.find((x) => x.id === r.defender), who = d ? `the ${posName(d.label)}` : 'a defender';
  const parts = [];
  if (ti.late > 0.35) parts.push(`late read (${ti.late.toFixed(2)}s after on-time) let ${who} close`);
  if (r.cause === 'lane') parts.push(`${who} was sitting in the throwing lane`);
  if (r.cause === 'tip') parts.push(`ball was tipped by ${who} and popped up`);
  if (r.cause === 'cover' || (!parts.length && r.type === 'interception')) parts.push(`threw into coverage — ${who} had leverage on the receiver`);
  if (ti.miss) parts.push(`pressure made the ball ${ti.miss === 'sail' ? 'sail high' : 'come out short'}`);
  if (!parts.length) parts.push(`tight window, ${ti.sepAtThrow.toFixed(1)} yd separation at release`);
  return parts.join('; ') + '.';
}
const loadHistory = () => M.loadHistory();
const saveHistory = (h) => M.saveHistory(h);
function updateStats() {
  const all = loadHistory();
  $('streak').textContent = state.session.streak;
  const h = all.filter((r) => (r.mode || 'passing') === state.mode);
  $('avg').textContent = h.length ? Math.round(h.slice(-20).reduce((a, r) => a + (r.sim || 0), 0) / Math.min(20, h.length)) : '—';
  const pct = (arr, k) => { const a = arr.filter((r) => r[k] != null); return a.length ? Math.round(100 * a.filter((r) => r[k]).length / a.length) + '%' : '—'; };
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, r) => a + (r.sim || 0), 0) / arr.length) : '—');
  const modeRow = M.MODES.map((m) => { const a = all.filter((r) => (r.mode || 'passing') === m.id); return `<tr${m.id === state.mode ? ' class="cur"' : ''}><td>${m.label}</td><td>${a.length}</td><td>${avg(a)}</td><td>${pct(a, 'covOk')}</td><td>${pct(a, 'presOk')}</td><td>${pct(a, 'protOk')}</td><td>${pct(a, 'readOk')}</td><td>${pct(a, 'runOk')}</td><td>${pct(a, 'audOk')}</td></tr>`; }).join('');
  let html = `<div class="lbl">By mode</div><table><tr><th>Mode</th><th>Reps</th><th>SIM</th><th>Cov</th><th>Press</th><th>Prot</th><th>Read</th><th>Run</th><th>Aud</th></tr>${modeRow}</table>`;
  if (h.length) {
    const by = {}; h.forEach((r) => { const k = r.variant && VAR[r.variant] ? VAR[r.variant].name : r.coverage; (by[k] = by[k] || []).push(r); });
    const dh = h.filter((r) => r.detailed);
    html += `<div class="lbl">${M.MODES.find((m) => m.id === state.mode).label}: ${h.length} reps · avg SIM ${avg(h)} · best ${Math.max(...h.map((r) => r.sim || 0))} · variant ID ${dh.length ? pct(dh, 'varOk') : '—'} · INTs ${h.filter((r) => r.int).length}</div>
    <table><tr><th>Variant</th><th>Reps</th><th>Family</th><th>Read/Run</th><th>INT</th><th>SIM</th></tr>${Object.entries(by).sort().map(([c, a]) => `<tr><td>${c}</td><td>${a.length}</td><td>${pct(a, 'covOk')}</td><td>${a[0].type === 'run' ? pct(a, 'runOk') : pct(a, 'readOk')}</td><td>${a.filter((r) => r.int).length}</td><td>${avg(a)}</td></tr>`).join('')}</table>
    <div>Last 10: ${h.slice(-10).map((r) => r.sim).join(' · ')}</div>`;
  } else html += `<div>No ${state.mode} reps yet.</div>`;
  $('hist-body').innerHTML = html;
}

// ---------------- replay ----------------
function startReplay() {
  if (!state.rec.length) return;
  state.replay = { i: 0, t: 0 };
  setView('coach');
}
$('replay-btn').onclick = () => { if (state.sim && state.sim.phase === 'done') { state.replay = null; startReplay(); } };

// ---------------- badges (read indicators) ----------------
let badgeEls = {}; const tgtEls = new Map();
function buildBadges(sim) {
  const root = $('badges'); root.innerHTML = ''; badgeEls = {}; tgtEls.clear();
  sim.offense.forEach((p) => {
    const el = document.createElement('div'); el.className = 'badge'; el.dataset.id = p.id;
    const n = p.read; const lbl = n < 0 ? '' : n === sim.play.progression.length - 1 ? 'CD' : String(n + 1);
    el.innerHTML = (lbl ? `<span class="n">${lbl}</span>` : '') + `<span class="id">${p.id}</span>`;
    root.appendChild(el); badgeEls[p.id] = el;
  });
}
function markBadge(id, cls) { const el = badgeEls[id]; if (el) el.classList.add(cls); }
const v3 = new THREE.Vector3();
function updateBadges() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const live = canThrowNow(), touchUI = state.touchUI;
  if (live) hitTest(-1e4, -1e4, touchUI); // refresh each eligible receiver's projected hit circle (_hitP/_hitR)
  actors.forEach((a) => {
    let el = tgtEls.get(a); const show = live && a.kind === 'wr' && eligible(a) && a._hitP;
    if (!show) { if (el && el._on) { el.style.display = 'none'; el._on = false; } return; }
    if (!el) { el = document.createElement('div'); el.className = 'tgt'; $('badges').appendChild(el); tgtEls.set(a, el); }
    if (!el._on) { el.style.display = ''; el._on = true; }
    const d = Math.round(a._hitR * 2);
    el.style.transform = `translate(${(a._hitP.x - d / 2).toFixed(0)}px,${(a._hitP.y - d / 2).toFixed(0)}px)`; el.style.width = el.style.height = d + 'px';
    el.classList.toggle('hov', hoverId === a.src.id);
  });
  const items = [];
  actors.forEach((a) => {
    const el = a.kind === 'wr' && badgeEls[a.src.id]; if (!el) return;
    v3.set(a.g.position.x, 2.6, a.g.position.z).project(camera);
    // v9: badges never vanish near the sidelines: off-screen (or behind the camera) receivers become edge chips with an arrow
    let sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h; const behind = v3.z > 1;
    if (behind) { sx = w - sx; sy = h - 40; }
    const M = 34, edge = behind || sx < M || sx > w - M || sy < 70 || sy > h - 30;
    let ang = 0;
    if (edge) { const cx = w / 2, cy = h / 2; ang = Math.atan2(sy - cy, sx - cx); sx = clampN(sx, M, w - M); sy = clampN(sy, 70, h - 30); }
    items.push({ el, sx, sy, edge, ang });
  });
  // v10: de-overlap — edge chips (and badges) never sit on top of another badge, so every receiver stays clickable
  items.sort((p, q) => p.edge - q.edge); const placed = [];
  items.forEach((it) => {
    const dir = it.sy > h / 2 ? -1 : 1; for (let k = 0; k < 12; k++) { const hit = placed.find((q) => Math.abs(q.sx - it.sx) < 44 && Math.abs(q.sy - it.sy) < 40); if (!hit) break; it.sy = clampN(it.sy + dir * 40, 70, h - 30); if (!it.edge) it.sx += (it.sx >= hit.sx ? 6 : -6); }
    placed.push(it);
  });
  items.forEach(({ el, sx, sy, edge, ang }) => {
    const c = el._c || (el._c = {}), L = sx.toFixed(1) + 'px', T = sy.toFixed(1) + 'px', E2 = edge ? 'e' : '';
    if (c.o !== '1') el.style.opacity = c.o = '1';
    if (c.e !== E2) { el.classList.toggle('edge', edge); c.e = E2; }
    if (edge) { const A = (ang * 180 / Math.PI).toFixed(0); if (c.a !== A) { el.style.setProperty('--ang', A + 'deg'); c.a = A; } }
    if (c.l !== L || c.t !== T) { el.style.left = c.l = L; el.style.top = c.t = T; }
  });
}

// ---------------- camera ----------------
function setView(v) { state.view = v; $('view-btn').textContent = v === 'coach' ? 'QB view' : 'Coach view'; }
$('view-btn').onclick = () => setView(state.view === 'coach' ? 'qb' : 'coach');
const camPos = new THREE.Vector3(0, 3, 8), camLook = new THREE.Vector3(0, 1, -20);
const tPos = new THREE.Vector3(), tLook = new THREE.Vector3();
const CAM_ANCHOR_Y = -5;
// v9 framing assist: widen the vertical FOV (62° → up to 80°) just enough to keep every eligible receiver's spot and
// first ~1.2 s of route (flats, outs, swings to the sideline) in frame at the snap; eases back once routes stretch downfield.
let baseFov = 62, fovT = 62, dolly = 0, dollyT = 0;
const _fbv = new THREE.Vector3(), _fsv = new THREE.Vector3();
function frameAssist(dt) {
  { const fb = scene.getObjectByName('football'); if (fb && overlay.children.length) { // v11: fade tags near the ball so flight/result screenshots see it
    fb.getWorldPosition(_fbv).project(camera); const bx = _fbv.x, by = _fbv.y, fl = !!(state.sim && state.sim.ball);
    overlay.children.forEach((c) => {
      const mats = c.isSprite ? [c.material] : (c.material ? [c.material] : []);
      if (!mats.length && c.traverse) { c.traverse((o) => { if (o.material) mats.push(o.material); }); }
      _fsv.copy(c.position).project(camera); const near = fb.visible && Math.abs(_fsv.x - bx) < 0.22 && Math.abs(_fsv.y - by) < 0.18;
      mats.forEach((m) => { if (!m) return; m.transparent = true; m.opacity = near || (fl && c.isSprite) ? (near ? 0.08 : 0.35) : 1; });
    });
  } }
  const s = state.sim; if (!s || state.view !== 'qb' || camMode() === 'eye' || window.__camOverride || state.camHold) { fovT = baseFov; dollyT = 0; }
  else if (s.phase === 'presnap' || (s.phase === 'live' && s.t < 2.2 && !s.ball)) {
    camera.updateMatrixWorld(); const inv = camera.matrixWorldInverse, asp = camera.aspect, tMax = Math.tan(40 * Math.PI / 180); let need = 0, back = 0;
    s.offense.forEach((o) => {
      if (o.read < 0 && s.run) return; // v10: off-progression receivers are throwable too — keep them in frame
      for (let t = s.phase === 'presnap' ? 0 : s.t; t <= (s.phase === 'presnap' ? 1.2 : s.t + 0.6); t += 0.3) {
        const q = o.posAt(t); _rv.set(W(q.x), 1, Z(q.y)).applyMatrix4(inv); if (_rv.z > -2) continue;
        need = Math.max(need, Math.abs(_rv.x) / -_rv.z / asp / 0.9, Math.abs(_rv.y) / -_rv.z / 0.92);
        back = Math.max(back, Math.abs(_rv.x) / (asp * 0.9 * tMax) + _rv.z + dolly); // extra pull-back if even 80° can't hold it
      }
    });
    fovT = clampN(2 * Math.atan(need) * 180 / Math.PI, baseFov, 80); dollyT = clampN(back, 0, 12);
    if (s.phase === 'presnap') { s._preFov = fovT; s._preDolly = dollyT; }
    else { // never zoom in vs the pre-snap frame; classic also freezes the first 0.35s so the snap isn't a camera pop (v6)
      fovT = Math.max(fovT, s._preFov || 0); dollyT = Math.max(dollyT, s._preDolly || 0);
      if (camMode() === 'classic' && s.t < 0.35) { fovT = s._preFov || fovT; dollyT = s._preDolly || dollyT; }
    }
  } else { fovT = baseFov; dollyT = 0; }
  dolly += (dollyT - dolly) * Math.min(1, dt * 3);
  const f = camera.fov + (fovT - camera.fov) * Math.min(1, dt * 4);
  if (Math.abs(f - camera.fov) > 0.02) { camera.fov = f; camera.updateProjectionMatrix(); }
}
function updateCamera(dt, qb) {
  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(...o.pos); camera.lookAt(...o.look); return; } // test/screenshot hook
  state.yaw += (state.yawTarget - state.yaw) * Math.min(1, dt * 8);
  if (state.view === 'coach') { tPos.set(0, 46, 14); tLook.set(0, 0, -8); }
  else {
    // v5: never closer than the shotgun spot (y = -5): under-centre plays get the same pre-snap framing
    if (camMode() === 'eye') { // v8: QB eye level (~6 ft), just behind and right of the helmet, ~62° vertical FOV
      const qx = W(qb.x), qz = Z(qb.y), h = actors[0] ? actors[0].g.userData.rig.heightYd - 0.08 : 2.0;
      tPos.set(qx + Math.sin(state.yaw) * 0.1, h, qz - Math.cos(state.yaw) * 0.1); // inside the QB's helmet (his head/torso are hidden in this mode)
      tLook.set(qx + Math.sin(state.yaw) * 20, 0.9, qz - Math.cos(state.yaw) * 20);
    } else {
    const classic = camMode() === 'classic'; // classic = v3/v4 QB cam: follows the QB from his own spot, no pre-snap lift, no snap transition
    const qx = W(qb.x), qz = Z(classic ? qb.y : Math.min(qb.y, CAM_ANCHOR_Y));
    // over the QB's right shoulder, elevated like a raised QB-eye view
    // pre-snap: same raised, pulled-back framing for every formation so both wideouts + backfield routes are in view;
    // after the snap ease into the normal over-the-shoulder follow.
    const pre = !classic && state.sim && state.sim.phase === 'presnap' && state.yawTarget === 0 ? 1 : 0;
    const back = 6.5 + pre * 9.5, up = 4.6 + pre * 9.4;
    tPos.set(qx + 0.7 * (1 - pre) - Math.sin(state.yaw) * (6 + pre * 4), up, qz + Math.cos(state.yaw) * back);
    const look = 24;
    tLook.set(qx + Math.sin(state.yaw) * look, 0, qz - Math.cos(state.yaw) * look);
    if (dolly > 0.01) { tPos.x -= Math.sin(state.yaw) * dolly; tPos.z += Math.cos(state.yaw) * dolly; tPos.y += dolly * 0.45; } // v9 framing assist
    }
  }
  if (interceptor && intT != null && intT > 0.4 && !state.replay && state.view === 'qb') { // hold the shot on the celebration
    if (!state.camHold) state.camHold = { p: camPos.clone() };
    tPos.copy(state.camHold.p); tLook.set(interceptor.g.position.x, 1.4, interceptor.g.position.z);
  } else state.camHold = null;
  const k = Math.min(1, dt * (state.view === 'coach' ? 3 : 7));
  camPos.lerp(tPos, k); camLook.lerp(tLook, k);
  camera.position.copy(camPos);
  if (state.shake > 0 && state.view === 'qb') {
    const s = state.shake * 0.09, t = performance.now() / 1000;
    camera.position.x += Math.sin(t * 47) * s; camera.position.y += Math.sin(t * 61 + 1) * s * 0.7;
  }
  camera.lookAt(camLook);
  frameAssist(dt);
  const qa = actors[0], eye = camMode() === 'eye' && state.view === 'qb' && !window.__camOverride && !state.camHold;
  if (qa && qa.kind === 'qb') { const r = qa.g.userData.rig; r.head.visible = r.spine.children[0].visible = r.spine.children[1].visible = !eye; }
}
// look-around input
// Per-pointer tracking so a second finger (e.g. holding ROUTES) never breaks a tap/drag.
const drags = new Map();
// v9 throw input. Root causes of "clicks don't work": (1) only taps that *started on the canvas* were seen, so the
// phase line, clock, call/protection chips, HUD bar and badges swallowed them; (2) the throw fired on pointerup and any
// >8 px finger drift turned the tap into a look-around drag; (3) only phase 'live' with a 70 px radius around one point.
// Now: window-level pointerdown, screen-space hit test against each eligible receiver's projected body (feet→helmet
// segment), radius 56 px desktop / 72 px touch (larger when the player is big on screen), nearest wins; read badges
// are clickable; real controls (buttons/selects/panels) keep their clicks; multi-touch safe (per-pointer state).
const HIT_DESK = 64, HIT_TOUCH = 80; // v11: slightly larger so edge/sideline badges still register
const _ha = new THREE.Vector3(), _hb = new THREE.Vector3();
function isUI(t) {
  return !!(t && t.closest && t.closest('button:not(:disabled), select, input, textarea, a, label, .pop:not([hidden]), #menu:not([hidden]), #designer:not([hidden]), #result:not([hidden]), [id^="pi-"]:not(#pi-hud):not(#pi-toast), [data-ui]'));
}
function canThrowNow() { const s = state.sim; return !!s && !state.replay && s.phase === 'live' && !s.ball && !s.throwInfo; }
function eligible(a) { const s = state.sim; if (a.kind !== 'wr') return false; if (s.run && !s.rpoThrow) return !!(s.play.rpo && s.play.rpo.target === a.src.id); return true; } // v10: every WR/TE/RB on the field
function hitTest(cx, cy, touch) {
  const r = renderer.domElement.getBoundingClientRect(); let best = null, bd = Infinity;
  const toS = (v) => ({ x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height });
  actors.forEach((a) => {
    if (!eligible(a)) return;
    _ha.set(a.g.position.x, 0.1, a.g.position.z).project(camera); _hb.set(a.g.position.x, 2.1, a.g.position.z).project(camera);
    if (_ha.z > 1 || _hb.z > 1) return;
    const A = toS(_ha), B = toS(_hb), dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
    const k = clampN(((cx - A.x) * dx + (cy - A.y) * dy) / L2, 0, 1), d = Math.hypot(cx - (A.x + dx * k), cy - (A.y + dy * k));
    const rad = Math.max(touch ? HIT_TOUCH : HIT_DESK, Math.sqrt(L2) * 0.55); // scales up when the receiver is close / large
    a._hitR = rad; a._hitP = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    if (d <= rad && d < bd) { bd = d; best = a; }
  });
  const be = document.elementFromPoint(cx, cy), badge = be && be.closest && be.closest('.badge');
  if (badge && badge.dataset.id) { const a = actors.find((x) => x.kind === 'wr' && x.src.id === badge.dataset.id); if (a && eligible(a)) return { a, d: 0 }; }
  return best ? { a: best, d: bd } : null;
}
window.__hitTest = (x, y, t) => { const h = hitTest(x, y, t); return h && h.a.src.id; };
function tryThrowAt(cx, cy, touch) {
  const s = state.sim; if (!s || state.replay) return false;
  if (!canThrowNow()) return false;
  const h = hitTest(cx, cy, touch); if (!h) return false;
  throwTo(h.a.src.id); return true;
}
window.addEventListener('pointerdown', (e) => {
  if (isUI(e.target)) return;
  const touch = e.pointerType === 'touch' || e.pointerType === 'pen'; state.touchUI = touch;
  if (tryThrowAt(e.clientX, e.clientY, touch)) { e.preventDefault(); return; } // throw fires on press: no drag threshold, no lost taps
  drags.set(e.pointerId, { x: e.clientX, y: e.clientY, yaw: state.yawTarget, moved: false });
});
// hover: highlight the receiver a click would pick (desktop)
let hoverId = null;
window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const h = canThrowNow() && !isUI(e.target) ? hitTest(e.clientX, e.clientY, false) : null; hoverId = h ? h.a.src.id : null; document.body.style.cursor = hoverId ? 'pointer' : ''; });
window.addEventListener('pointermove', (e) => {
  const drag = drags.get(e.pointerId); if (!drag) return; const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 8) drag.moved = true;
  if (drag.moved) state.yawTarget = Math.max(-0.95, Math.min(0.95, drag.yaw - dx / window.innerWidth * 2.2));
});
window.addEventListener('pointerup', (e) => drags.delete(e.pointerId));
window.addEventListener('pointercancel', (e) => drags.delete(e.pointerId));
// ROUTES hold button: pointer capture + hide on up/cancel/leave/lost capture/blur.
const rb = $('routes-btn');
rb.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); try { rb.setPointerCapture(e.pointerId); } catch {} rb.dataset.pid = e.pointerId; setRoutes(true); });
['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((ev) => rb.addEventListener(ev, (e) => { if (String(e.pointerId) === rb.dataset.pid) { rb.dataset.pid = ''; setRoutes(false); } }));
rb.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keyup', (e) => { if (e.code === 'KeyR') setRoutes(false); });
window.addEventListener('blur', () => setRoutes(false));
function updateRoutesBtn() { rb.hidden = !routesAllowed(); }
$('routes-pro').checked = localStorage.getItem('pocketiq3d.routesAtPro') !== 'off';
$('routes-pro').onchange = (e) => { localStorage.setItem('pocketiq3d.routesAtPro', e.target.checked ? 'on' : 'off'); updateRoutesBtn(); };
window.addEventListener('keydown', (e) => {
  const sim = state.sim; if (!sim) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.code === 'Escape') { closePops(); $('menu').hidden = true; }
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); if (sim.phase === 'presnap') doSnap(); else if (sim.phase === 'done' && !$('result').hidden) goNext(); }
  if (e.code === 'KeyN' && sim.phase === 'done') goNext();
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0 && sim.phase === 'live') throwTo(sim.play.progression[n]);
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') state.yawTarget = Math.max(-0.95, state.yawTarget - 0.3);
  if (e.code === 'ArrowRight' || e.code === 'KeyD') state.yawTarget = Math.min(0.95, state.yawTarget + 0.3);
  if (e.code === 'ArrowUp' || e.code === 'KeyW') state.yawTarget = 0;
  if (e.code === 'KeyC') setView(state.view === 'coach' ? 'qb' : 'coach');
  if (e.code === 'KeyR' && !e.repeat) setRoutes(true);
  if (e.code === 'KeyP' && sim.phase === 'done') { state.replay = null; startReplay(); }
  if (e.code === 'KeyK') { if (e.shiftKey) window.__boxK = window.__boxK === 1 ? null : 1; else setScaleDebug(!scaleDbg.on); }
});
$('snap-btn').onclick = doSnap;
// v6.1: Next rep was attached as `onclick = nextPlay`, so the click Event was passed in as the forced play.
// goNext() is idempotent: ignores double-fire within 300 ms, cancels replay / INT celebration / pending timers, resets the view.
let lastNext = 0;
function goNext(e) {
  if (e && e.preventDefault) e.preventDefault();
  const now = performance.now(); if (now - lastNext < 300) return; lastNext = now;
  const nb = $('next-btn'); nb.classList.add('pressed'); setTimeout(() => nb.classList.remove('pressed'), 160); nb.blur();
  state.replay = null; state.intPending = null; state.intT = null; state.celebrate = null; state.postT = null; setView('qb');
  if (window.PocketHub && window.PocketHub.beforeNext && window.PocketHub.beforeNext()) return; // v8: session end / practice
  nextPlay(window.PocketHub && window.PocketHub.nextForced ? window.PocketHub.nextForced() : undefined);
}
$('next-btn').addEventListener('click', goNext);
$('history-btn').onclick = () => { updateStats(); $('history').hidden = false; };
$('hist-close').onclick = () => ($('history').hidden = true);
$('reset-btn').onclick = () => { if (confirm('Clear all saved history?')) { localStorage.setItem(HISTORY_KEY, '[]'); updateStats(); } };

function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; baseFov = camera.fov = w / h < 1 ? 75 : 62; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize); resize();

// ---------------- simulation stepping w/ interpolation ----------------
const STEP = 1 / 120;
function snapshotPrev() { actors.forEach((a) => state.prev.set(a.src, { x: a.src.x, y: a.src.y })); if (state.sim && state.sim.ball) state.prev.set('ball', { f: state.sim.ball.f }); }
function record(sim) {
  state.rec.push({ pos: actors.map((a) => [a.src.x, a.src.y]), ball: sim.ball ? { f: sim.ball.f } : null, t: sim.t, h: !!(sim.run && sim.run.handed && !sim.rpoThrow) });
}

// ---------------- v7 procedural animation (render-side only: driven by interpolated positions + render time) ----------------
const C = { sim: null, presnap: false, ended: false, tNow: 0, ti: null, throwT: -1, hasBall: false, ballF: 0, runPlay: false, handed: false, res: null, carrierId: null, tacklerId: null, rowBy: null, qbA: null };
const rowCache = new WeakMap();
const wrapA = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth01 = (x) => { x = clampN(x, 0, 1); return x * x * (3 - 2 * x); };
const lerpN = (a, b, k) => a + (b - a) * k;
const SECONDARY = new Set(['C', 'N', 'FS', 'SS', 'DB', 'CB', '$', 'Q']);
function buildFor(kind, src) {
  if (kind === 'ol' || kind === 'dl') return 'big';
  if (kind === 'wr') return src.id === 'Y' || src.id === 'RB' ? 'mid' : 'skill';
  if (kind === 'def') return SECONDARY.has(src.label) ? 'skill' : 'mid';
  return 'skill';
}
function frameContext(sim, hasBall, ballF) {
  C.sim = sim; C.presnap = sim.phase === 'presnap' && !state.replay;
  const tEnd = state.rec.length * STEP;
  C.ended = state.replay ? state.replay.t >= tEnd : sim.phase === 'done';
  C.tNow = state.replay ? Math.min(state.replay.t, tEnd) : sim.t;
  C.ti = sim.throwInfo; C.throwT = C.ti && !C.presnap ? C.tNow - C.ti.time : -1;
  C.hasBall = hasBall; C.ballF = ballF; C.runPlay = !!(sim.run && !sim.rpoThrow);
  C.handed = state.replay ? !!state.replayHanded : !!(sim.run && sim.run.handed);
  C.res = sim.result; C.qbA = actors[0];
  if (!rowCache.has(sim)) { const m = {}; ((sim.prot && sim.prot.rows) || []).forEach((r) => (m[r.rusher] = r)); rowCache.set(sim, m); }
  C.rowBy = rowCache.get(sim);
  C.carrierId = null; C.tacklerId = null;
  if (C.ended && C.res) {
    const r = C.res;
    if (r.type === 'sack') { C.carrierId = 'QB'; C.tacklerId = r.sackBy || null; }
    else if (r.type === 'complete' && C.ti) {
      const pl = POSTP.plan, pT = postT();
      C.carrierId = !pl || pT >= pl.dur ? C.ti.id : null; // v9: down only after the cosmetic YAC run
      if (pl && C.carrierId) C.tacklerId = pl.tackler || (pl.oob ? '__oob' : null);
    }
    else if (C.runPlay && sim.run && r.type !== 'interception') C.carrierId = sim.run.carrierId;
    if (C.carrierId && !C.tacklerId) {
      const car = actors.find((x) => x.src.id === C.carrierId && x.kind !== 'dl' && x.kind !== 'def');
      let bd = 2.6; if (car) actors.forEach((x) => { if (x.kind !== 'def' && x.kind !== 'dl') return; const d = Math.hypot(x.g.position.x - car.g.position.x, x.g.position.z - car.g.position.z); if (d < bd) { bd = d; C.tacklerId = x.src.id; } });
    }
  }
}
function nearestOf(a, kinds, maxD) {
  let best = null, bd = maxD; const p = a.g.position;
  for (let i = 0; i < actors.length; i++) { const o = actors[i]; if (!kinds.includes(o.kind)) continue; const d = Math.hypot(o.g.position.x - p.x, o.g.position.z - p.z); if (d < bd) { bd = d; best = o; } }
  return best;
}
function lookAt(T, u, gx, gz, px, pz, lim = 1.15) { T.hYaw = clampN(wrapA(Math.atan2(-(px - gx), -(pz - gz)) - u.heading - T.twist - T.hipYaw), -lim, lim); }
function legsFor(T, dm, fzL, fzR) { const h = dm.hipY + T.hy; const L = RK.legIK(dm, h, fzL), R = RK.legIK(dm, h, fzR); T.tL = L[0]; T.kL = L[1]; T.tR = R[0]; T.kR = R[1]; }
function gait(T, u, dm, speed, vf, vr, dt) {
  const back = vf < -0.8 && -vf > Math.abs(vr) * 0.8, lat = !back && Math.abs(vr) > Math.max(1, Math.abs(vf) * 1.3);
  const stride = back ? 0.5 : lat ? 0.55 : 0.75 + 0.09 * speed;
  u.phase += dt * speed / stride * Math.PI * (back ? -1 : 1);
  const s = Math.sin(u.phase), c = Math.cos(u.phase), sp = Math.min(1.25, speed / 7.5);
  if (back) T.hy -= 0.13; if (lat) T.hy -= 0.1;
  T.hy += -0.03 * sp + 0.05 * sp * Math.abs(c);
  legsFor(T, dm, 0, 0);
  if (lat) { // shuffle: feet slide apart/together, no crossing
    T.tLz = 0.18 + 0.16 * s; T.tRz = 0.18 - 0.16 * s; T.kL += 0.2 * Math.max(0, s); T.kR += 0.2 * Math.max(0, -s);
    T.sLx = T.sRx = 0.55; T.eLx = T.eRx = 1.4; T.lean = -0.3; return;
  }
  const A = back ? 0.3 : Math.min(0.8, 0.18 + speed * 0.075), Bk = back ? 0.55 : Math.min(1.65, 0.3 + speed * 0.16);
  T.tL += A * s; T.tR -= A * s; T.kL += Bk * Math.max(0, c); T.kR += Bk * Math.max(0, -c);
  const Aa = back ? 0.35 : Math.min(1.05, 0.22 + speed * 0.1);
  T.sLx = -Aa * s + 0.1; T.sRx = Aa * s + 0.1; T.eLx = T.eRx = back ? 1.5 : 0.45 + 0.95 * Math.min(1, sp);
  T.hipYaw = 0.14 * s * sp; T.twist = -0.22 * s * sp;
  T.lean = back ? -0.38 : -(0.05 + 0.045 * speed) - clampN(u.acc * 0.035, -0.2, 0.25);
  // cut / break: lean into the turn, sink the hips and plant the outside foot
  const turn = u.angV * Math.min(speed, 9);
  T.roll = clampN(-turn * 0.025, -0.38, 0.38); T.hy -= Math.min(0.14, Math.abs(turn) * 0.008);
  if (Math.abs(u.angV) > 2.2 && speed > 3) { if (u.angV > 0) { T.tRz += 0.32; T.kR += 0.25; } else { T.tLz += 0.32; T.kL += 0.25; } }
}
function stance(a, T, u, dm) {
  const id = a.src.id, lab = a.src.label, p = a.g.position;
  if (a.kind === 'qb') {
    if (a.src.y > -2.5) { T.hy = -0.3; T.lean = -0.55; T.sLx = T.sRx = 1.05; T.eLx = T.eRx = 0.35; T.sLz = T.sRz = -0.14; T.hPitch = 0.45; legsFor(T, dm, -0.02, 0.05); T.tLz = T.tRz = 0.1; }
    else { T.hy = -0.1; T.lean = -0.2; T.sLx = T.sRx = 0.55; T.eLx = T.eRx = 1.25; T.sLz = T.sRz = -0.12; T.hPitch = 0.15; legsFor(T, dm, -0.05, 0.08); T.tLz = T.tRz = 0.1; T.hYaw = Math.sin(performance.now() / 1300) * 0.7; }
    return;
  }
  if (a.kind === 'ol' || (id === 'Y' && Math.abs(p.x) < 7.5 && Math.abs(p.z) < 2.2)) { // 3-point
    T.hy = -0.42; T.lean = -1.05; T.sRx = 1.25; T.eRx = 0.05; T.sLx = 0.95; T.eLx = 0.55; T.hPitch = 0.85; legsFor(T, dm, -0.08, 0.28); T.tLz = T.tRz = 0.16; return;
  }
  if (a.kind === 'dl') { const de = /^DE/.test(id); T.hy = -0.48; T.lean = -1.15; T.sRx = 1.35; T.eRx = 0.05; T.sLx = de ? 0.7 : 1.35; T.eLx = de ? 0.7 : 0.05; T.hPitch = 0.95; legsFor(T, dm, -0.05, 0.32); T.tLz = T.tRz = 0.15; return; }
  if (id === 'RB') { T.hy = -0.18; T.lean = -0.6; T.sLx = T.sRx = 0.72; T.eLx = T.eRx = 0.2; T.sLz = T.sRz = 0.1; T.hPitch = 0.5; legsFor(T, dm, 0, 0); T.tLz = T.tRz = 0.14; return; }
  if (a.kind === 'wr') { T.hy = -0.13; T.lean = -0.42; T.sLx = 0.45; T.sRx = -0.3; T.eLx = 0.9; T.eRx = 0.7; T.hPitch = 0.35; legsFor(T, dm, -0.26, 0.22); lookAt(T, u, p.x, p.z, 0, 0, 1.0); return; }
  // defense
  const wr = nearestOf(a, ['wr'], 2.4);
  if (SECONDARY.has(lab) && wr && !/S$/.test(lab)) { T.hy = -0.25; T.lean = -0.55; T.sLx = T.sRx = 0.95; T.eLx = T.eRx = 0.85; T.hPitch = 0.5; legsFor(T, dm, -0.12, 0.12); T.tLz = T.tRz = 0.12; return; } // press
  if (SECONDARY.has(lab)) { const s = /S$/.test(lab); T.hy = s ? -0.08 : -0.13; T.lean = s ? -0.22 : -0.34; T.sLx = T.sRx = 0.35; T.eLx = T.eRx = 0.9; T.hPitch = 0.3; legsFor(T, dm, -0.16, 0.18); lookAt(T, u, p.x, p.z, 0, 4); return; }
  T.hy = -0.22; T.lean = -0.5; T.sLx = T.sRx = 0.7; T.eLx = T.eRx = 1.0; T.hPitch = 0.45; legsFor(T, dm, -0.06, 0.06); T.tLz = T.tRz = 0.14; lookAt(T, u, p.x, p.z, 0, 4); // LB
}
function qbLive(a, T, u, dm, speed, vf, vr, dt) {
  const p = a.g.position;
  if (C.runPlay) { // mesh / handoff, then carry out the fake
    if (speed > 0.4) gait(T, u, dm, speed, vf, vr, dt); else legsFor(T, dm, -0.05, 0.08);
    if (!C.handed) { T.sRx = T.sLx = 0.95; T.eRx = T.eLx = 0.45; T.sRz = -0.05; T.sLz = -0.3; T.twist = 0.35; }
    else { T.sRx = T.sLx = 0.45; T.eRx = T.eLx = 1.8; }
    return;
  }
  const tgt = C.ti && actors.find((x) => x.src.id === C.ti.id && x.kind === 'wr');
  if (C.throwT >= 0) { // throwing motion synced to the release time: whip (0–0.12 s), follow-through (–0.5 s), settle
    const f = C.throwT, k1 = smooth01(f / 0.12), k2 = smooth01((f - 0.12) / 0.38), k3 = smooth01((f - 0.7) / 0.5);
    legsFor(T, dm, -0.32 * k1, 0.2 + 0.12 * k1); T.kR += 0.45 * k2;
    T.sRz = lerpN(lerpN(1.15, 0.45, k1), -0.35, k2); T.sRx = lerpN(lerpN(-0.15, 1.7, k1), 0.95, k2); T.eRz = lerpN(1.6, 0.15, k1); T.eRx = lerpN(0.1, 0.35, k1);
    T.sLx = lerpN(0.9, -0.35, k1); T.sLz = lerpN(-0.1, -0.35, k1); T.eLx = 1.3;
    T.twist = lerpN(lerpN(-0.4, 0.55, k1), 0.35, k2); T.lean = lerpN(lerpN(-0.12, -0.5, k1), -0.3, k2);
    if (k3 > 0) { T.sRx = lerpN(T.sRx, 0.2, k3); T.sRz = lerpN(T.sRz, 0.15, k3); T.eRz = lerpN(T.eRz, 0, k3); T.eRx = lerpN(T.eRx, 0.5, k3); T.twist = lerpN(T.twist, 0, k3); T.lean = lerpN(T.lean, -0.1, k3); }
    if (tgt) lookAt(T, u, p.x, p.z, tgt.g.position.x, tgt.g.position.z);
    return;
  }
  if (speed > 0.8) { gait(T, u, dm, speed, vf, vr, dt); T.sRx = 0.55; T.sRz = 0.25; T.eRx = 1.9; T.sLx = 0.7; T.sLz = -0.25; T.eLx = 1.7; T.twist = -0.2; T.lean = Math.max(T.lean, -0.2); }
  else { // set in the pocket: ball at the ear, off hand on the ball, shoulders coiled, feet under him
    T.hy = -0.08; legsFor(T, dm, -0.12, 0.18); T.sRz = 1.15; T.sRx = -0.15; T.eRz = 1.6; T.eRx = 0.1; T.sLx = 0.9; T.sLz = -0.1; T.eLx = 1.3; T.twist = -0.4; T.lean = -0.12;
    const bounce = Math.sin(performance.now() / 120) * 0.02; T.hy += bounce; // happy feet
  }
  // eyes: the camera look-around steers the head; otherwise scan the progression
  const prog = C.sim.play.progression || [], k = Math.min(prog.length - 1, Math.max(0, Math.floor((C.tNow - 0.8) / 0.75)));
  const r = Math.abs(state.yaw) > 0.08 ? null : actors.find((x) => x.src.id === prog[k] && x.kind === 'wr');
  if (r) lookAt(T, u, p.x, p.z, r.g.position.x, r.g.position.z); else T.hYaw = clampN(-state.yaw * 1.1 - T.twist, -1.1, 1.1);
}
function animateActor(a, x, y, dt, qbW) {
  const g = a.g, u = g.userData, rig = u.rig, dm = rig.dims, T = u.tgt, cur = u.cur, sim = C.sim;
  const nx = W(x), nz = Z(y), dxp = nx - g.position.x, dzp = nz - g.position.z, idt = 1 / Math.max(dt, 1e-4);
  if (dxp * dxp + dzp * dzp > 9) { u.vx = u.vz = 0; } else { const kv = 1 - Math.exp(-dt * 12); u.vx += (dxp * idt - u.vx) * kv; u.vz += (dzp * idt - u.vz) * kv; }
  g.position.x = nx; g.position.z = nz;
  const speed = Math.hypot(u.vx, u.vz);
  // heading: movers face travel dir; zone DBs backpedal facing QB; turn rate is limited (no snapping on breaks)
  let want = u.heading;
  if (speed > 0.6) want = Math.atan2(-u.vx, -u.vz);
  if ((a.kind === 'def') && speed < 6.2 && sim.phase !== 'presnap') want = Math.atan2(-(qbW.x - nx), -(qbW.z - nz));
  if (a.kind === 'ol') want = 0;
  if (a.kind === 'qb') want = sim.ball && sim.ball.f < 0.2 ? Math.atan2(-(W(sim.ball.to.x) - nx), -(Z(sim.ball.to.y) - nz)) : state.yaw * -0.8;
  if (C.presnap) want = a.kind === 'def' || a.kind === 'dl' ? Math.PI : 0;
  const dh = wrapA(want - u.heading), maxR = (speed > 5 ? 6 : 10) * dt, stp = clampN(dh * Math.min(1, dt * 10), -maxR, maxR);
  u.heading += stp; g.rotation.y = u.heading;
  u.angV += (stp * idt - u.angV) * (1 - Math.exp(-dt * 8));
  const sh = Math.sin(u.heading), ch = Math.cos(u.heading), vf = -u.vx * sh - u.vz * ch, vr = u.vx * ch - u.vz * sh;
  u.acc += (((vf - u.pvf) * idt) - u.acc) * (1 - Math.exp(-dt * 6)); u.pvf = vf;
  u.t += dt;
  for (let i = 0; i < RK.KEYS.length; i++) T[RK.KEYS[i]] = 0;
  T.sLz = T.sRz = 0.12; T.eLx = T.eRx = 0.3;
  const id = a.src.id, isBallTeam = a.kind === 'wr' || a.kind === 'qb';
  let rate = 16;
  if (C.presnap) stance(a, T, u, dm);
  else if (a.kind === 'qb') qbLive(a, T, u, dm, speed, vf, vr, dt);
  else {
    if (speed > 0.35) gait(T, u, dm, speed, vf, vr, dt); else { T.hy = -0.05; legsFor(T, dm, -0.08, 0.1); }
    const p = g.position;
    if (a.kind === 'ol') {
      const opp = nearestOf(a, ['dl', 'def'], 1.7);
      T.hy -= C.runPlay ? 0.2 : 0.28; T.lean = C.runPlay ? -0.65 : -0.35; legsFor(T, dm, -0.1, 0.22);
      if (speed > 0.35) { u.phase += dt * 7; const s = Math.sin(u.phase); T.tL += 0.12 * s; T.tR -= 0.12 * s; T.tLz = T.tRz = 0.2 + 0.08 * s; } // kick-slide / choppy feet
      if (opp) { T.sLx = T.sRx = 1.4; T.eLx = T.eRx = 0.25; T.sLz = T.sRz = -0.1; T.lean -= 0.1; lookAt(T, u, p.x, p.z, opp.g.position.x, opp.g.position.z, 0.6); }
      else { T.sLx = T.sRx = 0.95; T.eLx = T.eRx = 1.3; T.sLz = T.sRz = 0.05; }
    } else if (a.kind === 'dl') {
      const row = C.rowBy[id], mv = (row && row.move) || '', ol = nearestOf(a, ['ol'], 1.7), qbp = C.qbA.g.position, dq = Math.hypot(qbp.x - p.x, qbp.z - p.z);
      if (ol && !C.ended) {
        T.lean = -0.7; T.hy -= 0.22; legsFor(T, dm, -0.05, 0.35); u.phase += dt * 8; const s = Math.sin(u.phase); T.tL += 0.15 * s; T.tR -= 0.15 * s;
        if (/swim/.test(mv)) { const w = Math.max(0, Math.sin(u.t * 4.2)); T.sRx = 1.3 + 1.5 * w; T.sRz = 0.35 * w; T.eRx = 0.4 + 0.7 * w; T.sLx = 1.35; T.eLx = 0.3; T.sLz = -0.15; }
        else if (/bull/.test(mv)) { T.sLx = T.sRx = 1.45; T.eLx = T.eRx = 0.2; T.sLz = T.sRz = -0.12; T.lean = -0.8; }
        else if (/rip|speed/.test(mv)) { const side = p.x < qbp.x ? 1 : -1, w = Math.max(0, Math.sin(u.t * 5)); T.roll = side * 0.35; T.sRx = 0.2 + 2.0 * w; T.eRx = 1.7; T.sLx = 1.2; T.eLx = 0.3; T.lean = -0.75; }
        else { T.sLx = T.sRx = 1.3; T.eLx = T.eRx = 0.35; }
      } else if (dq < 2.6 && !C.ended) { T.sLx = T.sRx = 1.35; T.eLx = T.eRx = 0.3; T.sLz = T.sRz = -0.2; }
      lookAt(T, u, p.x, p.z, qbp.x, qbp.z, 0.8);
    } else if (a.kind === 'wr') {
      const carrying = (C.runPlay && C.handed && sim.run && id === sim.run.carrierId) || (C.ended && C.res && C.res.type === 'complete' && C.ti && id === C.ti.id);
      if (C.runPlay && !C.handed && sim.run && id === sim.run.carrierId) { T.sLx = 0.6; T.eLx = 1.7; T.sRx = 1.15; T.eRx = 1.6; T.sRz = -0.1; } // mesh pocket
      else if (carrying && C.ended && postT() >= 0 && postT() < 0.2) { T.sLx = T.sRx = 1.05; T.eLx = T.eRx = 1.25; T.sLz = T.sRz = -0.3; T.hPitch = 0.35; rate = 22; } // v9: ball into the hands, cushioned to the chest
      else if (carrying) { T.sRx = 0.15; T.sRz = 0.2; T.eRx = 2.05; T.eRz = 0.3; }
      else if (C.ended && C.res && C.res.type === 'incomplete' && C.ti && id === C.ti.id && POSTP.plan && postT() >= 0 && postT() < 0.7) { // v9: off the hands / tipped: arms up then flail
        const k = smooth01(postT() / 0.7); T.sLx = T.sRx = lerpN(1.9, 0.6, k); T.sLz = -0.2; T.sRz = 0.5 * k; T.eLx = T.eRx = 0.5; T.hPitch = -0.25 * (1 - k); rate = 18;
      }
      else if (C.ti && id === C.ti.id && C.hasBall && C.ballF > 0.45 && !C.ended) { // track + catch: hands up to the ball
        const k = smooth01((C.ballF - 0.45) / 0.35), hi = 1.5 + Math.max(0, ball.position.y - 1.6) * 0.6;
        T.sLx = lerpN(T.sLx, hi, k); T.sRx = lerpN(T.sRx, hi, k); T.eLx = lerpN(T.eLx, 0.4, k); T.eRx = lerpN(T.eRx, 0.4, k); T.sLz = T.sRz = lerpN(0.12, -0.12, k);
        lookAt(T, u, p.x, p.z, ball.position.x, ball.position.z, 1.6); T.hPitch = -0.2 * k;
      } else if (!isBallTeam || speed > 0.35) { /* plain route running */ }
      if (id === 'Y' && C.runPlay && speed < 3) { T.sLx = T.sRx = 1.35; T.eLx = T.eRx = 0.3; T.lean = -0.55; }
    } else { // DB / LB
      const qbp = C.qbA.g.position;
      lookAt(T, u, p.x, p.z, qbp.x, qbp.z, 1.0);
      if (C.hasBall && C.ti && !C.ended) { const bx = W(sim.ball ? sim.ball.to.x : 0), bz = Z(sim.ball ? sim.ball.to.y : 0); if (sim.ball && Math.hypot(bx - p.x, bz - p.z) < 3 && C.ballF > 0.6) { T.sLx = T.sRx = 2.2; T.eLx = T.eRx = 0.4; lookAt(T, u, p.x, p.z, ball.position.x, ball.position.z, 1.6); } }
      const r = C.res;
      if (r && r.cause === 'pbu' && r.defender === id && C.hasBall && C.ballF > 0.78) { const k = Math.sin(clampN((C.ballF - 0.78) / 0.22, 0, 1) * Math.PI); T.hy += 0.32 * k; T.sLx = T.sRx = 2.65; T.eLx = T.eRx = 0.15; T.tL += 0.4 * k; T.kL += 0.8 * k; }
    }
  }
  // endings: carrier wrapped and taken down, tackler falls with him; everyone else settles
  if (C.ended && !C.presnap) {
    u.fallT += dt;
    if (id === C.carrierId && C.tacklerId && C.tacklerId !== '__oob' && a.kind !== 'def' && a.kind !== 'dl') {
      const k = smooth01((u.fallT - 0.05) / 0.5), back = C.res.type === 'sack';
      T.fall = (back ? 1.3 : -1.4) * k; T.hy = lerpN(T.hy, -(dm.hipY - 0.26), k); T.lean = lerpN(T.lean, back ? 0.1 : -0.1, k);
      T.tL = lerpN(T.tL, back ? 0.5 : -0.1, k); T.tR = lerpN(T.tR, back ? 0.2 : 0.15, k); T.kL = lerpN(T.kL, 0.5, k); T.kR = lerpN(T.kR, 0.9, k);
      if (!back) { T.sLx = lerpN(T.sLx, 2.6, k); T.eLx = lerpN(T.eLx, 0.3, k); } else { T.sLx = T.sRx = lerpN(T.sLx, 1.1, k); T.sLz = T.sRz = 0.6 * k; }
      rate = 12;
    } else if (id === C.tacklerId && (a.kind === 'def' || a.kind === 'dl')) {
      const k = smooth01((u.fallT - 0.1) / 0.5);
      T.sLx = T.sRx = 1.5; T.eLx = T.eRx = 0.55; T.sLz = T.sRz = -0.35; T.fall = -1.3 * k; T.hy = lerpN(T.hy, -(dm.hipY - 0.36), k); T.tL = lerpN(T.tL, -0.2, k); T.tR = lerpN(T.tR, 0.3, k); T.kL = lerpN(T.kL, 0.7, k); T.kR = lerpN(T.kR, 1.0, k);
      rate = 12;
    } else if (speed < 0.6 && u.fallT > 0.9 && !(intT != null && a === interceptor)) { T.sLz = T.sRz = 0.55; T.sLx = T.sRx = -0.25; T.eLx = T.eRx = 1.9; } // hands on hips
  } else u.fallT = 0;
  if (intT != null) {
    if (a === interceptor) {
      if (intT <= 0.55) { const k = intT / 0.55, leap = Math.sin(k * Math.PI) * 0.6; T.hy = leap - 0.05; T.sLx = T.sRx = 2.75 - k * 1.2; T.eLx = T.eRx = 0.25 + k * 1.0; T.tL = 0.5 * Math.sin(k * Math.PI); T.kL = 0.9 * Math.sin(k * Math.PI); T.fall = 0; }
      else celebrate(a, intT - 0.55, dt, T);
      rate = 18;
    } else if (a.kind === 'qb' && intT > 0.6) { T.sLx = T.sRx = 2.75; T.eLx = T.eRx = 2.1; T.sLz = T.sRz = 0.45; T.lean = 0.12; T.hPitch = 0.25; } // hands on the helmet
  }
  // damped blend toward the target pose (frame-rate independent, no popping between states)
  const k = u.first ? 1 : 1 - Math.exp(-dt * rate); u.first = false;
  for (let i = 0; i < RK.KEYS.length; i++) { const kk = RK.KEYS[i]; cur[kk] += (T[kk] - cur[kk]) * k; }
  RK.apply(rig, cur);
}

let intT = null, interceptor = null;
const INT_REPLAY_AT = 3.0; // v9: grade panel shows instantly; this only times the auto replay after the celebration
// ---- INT celebration: turn, point at the camera, then run at it dancing (shimmy, arm swings, spin) ----
const TAUNTS = ['Too easy, rookie!', 'Nice pass... to me!', 'Thanks for the gift!', 'Read THAT coverage!', 'Pick-six city!', 'Did you even look?', 'Ball hawk, baby!'];
function celebrate(a, c, dt, T) {
  const g = a.g, u = g.userData;
  const camW = { x: camera.position.x, z: camera.position.z };
  const face = Math.atan2(-(camW.x - g.position.x), -(camW.z - g.position.z));
  let want = face;
  if (c > 1.55 && c < 2.05) want = face + (c - 1.55) / 0.5 * Math.PI * 2; // spin
  let dh = want - u.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
  u.heading = c > 1.55 && c < 2.05 ? want : u.heading + dh * Math.min(1, dt * 9); g.rotation.y = u.heading;
  T.fall = 0; T.lean = 0; T.roll = 0;
  if (c < 0.75) { // the point: right arm straight out at the camera, left hand on hip, chest puffed
    T.hy = 0; legsFor(T, u.rig.dims, -0.15, 0.15); T.sRx = 1.55; T.sRz = 0.05; T.eRx = 0.05; T.sLx = -0.25; T.sLz = 0.6; T.eLx = 1.7; T.lean = 0.08; T.hPitch = 0.1;
  } else { // run & dance
    const ph = c * 11, s = Math.sin(ph);
    T.roll = s * 0.26; T.hipYaw = Math.sin(ph * 0.5) * 0.35; T.hy = Math.abs(s) * 0.14 - 0.06;
    legsFor(T, u.rig.dims, 0, 0); T.tL += s * 0.6; T.tR -= s * 0.6; T.kL += 0.5 * Math.max(0, s); T.kR += 0.5 * Math.max(0, -s);
    T.sLx = 1.2 + s * 1.1; T.sRx = 1.2 - s * 1.1; T.eLx = T.eRx = 0.9;
    T.sLz = 0.5 + Math.abs(Math.sin(ph * 0.5)) * 0.6; T.sRz = 0.5 + Math.abs(Math.cos(ph * 0.5)) * 0.6;
    if (c > 2.3) { T.sRx = 1.55; T.sRz = 0.05; T.eRx = 0.05; }
  }
  state.celebrate = { c, face };
}
function celebrationOffset(c, from, qb) { // run toward the QB-camera, stop 6 yd short
  if (c < 0.75) return { x: from.x, y: from.y };
  const dx = qb.x - from.x, dy = qb.y - from.y, d = Math.hypot(dx, dy) || 1, run = Math.min(Math.max(0, d - 6), (c - 0.75) * 4.2);
  return { x: from.x + dx / d * run + Math.sin(c * 5.5) * 0.5, y: from.y + dy / d * run };
}
function updateTaunt() {
  const el = $('taunt'); const show = interceptor && intT != null && intT > 0.85 && !state.replay;
  if (!show) { if (!el.hidden && !(interceptor && intT != null)) el.hidden = true; if (!show) el.hidden = true; return; }
  if (!el.dataset.txt || el.dataset.for !== state.sim.result.defender + state.seed) { el.dataset.txt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)]; el.dataset.for = state.sim.result.defender + state.seed; el.textContent = el.dataset.txt; }
  v3.set(interceptor.g.position.x, 3.3, interceptor.g.position.z).project(camera);
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  el.style.left = ((v3.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - v3.y) / 2 * h) + 'px'; el.hidden = false;
}
const _bv = new THREE.Vector3(), _bd = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

// ---------------- v9 post-play (render-only: YAC run, tackle, loose ball) ----------------
// Cosmetic only: the engine result (type, yards) is fixed when sim.phase becomes 'done'; this just animates the receiver
// from the catch spot to LOS + res.yards with pursuit angles, then the tackle / out of bounds. No engine state is touched.
const POSTP = { plan: null, bp: new THREE.Vector3(), bv: new THREE.Vector3(), lastT: -1, rest: false };
function postT() {
  const sim = state.sim; if (!sim || sim.phase !== 'done') return -1;
  if (state.replay) { const e = state.rec.length * STEP; return state.replay.t > e ? state.replay.t - e : -1; }
  return state.postT == null ? -1 : state.postT;
}
function makePostPlan(sim) {
  const res = sim.result, ti = sim.throwInfo, plan = { type: res.type, dur: 0.6, moves: new Map(), carrier: null, tackler: null, oob: false, inc: null };
  if (res.type === 'complete' && ti) {
    const r = sim.offense.find((o) => o.id === ti.id); if (!r) return plan;
    const c = { x: r.x, y: r.y }, endY = Math.max(c.y, res.yards), dy = endY - c.y;
    const wide = Math.abs(c.x - 26.65) > 11, dir = Math.sign(c.x - 26.65) || 1;
    let ex = c.x + (wide ? dir * 0.18 : -dir * 0.08) * dy;
    if (ex < 0.4 || ex > 52.9) { ex = clampN(ex, 0.4, 52.9); plan.oob = true; }
    plan.dur = dy < 0.7 ? 0.55 : clampN(0.35 + dy / 7.8, 0.8, 1.9);
    plan.carrier = r.id; plan.end = { x: ex, y: endY };
    plan.moves.set(r, { from: c, to: plan.end, kind: 'carry' });
    // tackler: the defender who can get to the end spot first; everyone else takes a pursuit angle
    let best = null, bd = 1e9;
    sim.defense.forEach((d) => { const dd = Math.hypot(d.x - ex, d.y - endY); if (dd < bd) { bd = dd; best = d; } });
    sim.defense.forEach((d) => {
      if (d.role === 'rush' && Math.hypot(d.x - ex, d.y - endY) > 12) return;
      const isT = d === best && !plan.oob;
      const side = d.x < ex ? -1 : 1;
      plan.moves.set(d, { from: { x: d.x, y: d.y }, to: isT ? { x: ex + side * 0.55, y: endY + 0.5 } : { x: ex + side * 1.6, y: endY + 1.4 }, kind: isT ? 'tackle' : 'pursue' });
    });
    plan.tackler = plan.oob ? null : best && best.id;
  } else if (res.type === 'incomplete') {
    const b = sim.ball, tgt = b && b.target;
    const off = tgt ? Math.hypot(tgt.x - b.to.x, tgt.y - b.to.y) : 3;
    plan.inc = res.cause === 'pbu' ? 'tip' : off > 2.4 ? 'miss' : 'drop';
    plan.dur = 1.2;
  }
  return plan;
}
function postPos(a, x, y, pT) {
  const pl = POSTP.plan; if (!pl || pT < 0) return null;
  const m = pl.moves.get(a.src); if (!m) return null;
  if (m.kind === 'carry') {
    const k = clampN(pT / pl.dur, 0, 1), u = k < 0.18 ? k * 0.4 : 0.072 + (k - 0.18) / 0.82 * 0.928; // secure, then accelerate upfield
    return { x: lerpN(m.from.x, m.to.x, smooth01(u) * 0.3 + u * 0.7), y: lerpN(m.from.y, m.to.y, smooth01(u) * 0.3 + u * 0.7) };
  }
  const k = clampN(pT / (m.kind === 'tackle' ? pl.dur : pl.dur * 1.3), 0, 1);
  const dist = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y), maxRun = 7.5 * Math.min(pT, pl.dur * 1.3);
  const f = m.kind === 'tackle' ? smooth01(k) : Math.min(smooth01(k), dist > 0 ? maxRun / dist : 1);
  return { x: lerpN(m.from.x, m.to.x, f), y: lerpN(m.from.y, m.to.y, f) };
}
const _hm = new THREE.Vector3();
function looseBall(dt, pT) {
  // tipped / off the hands / overthrown: ballistic arc + bounces (yards, g ≈ 10.7 yd/s²)
  if (pT < POSTP.lastT || POSTP.lastT < 0) {
    const sim = state.sim, b = sim.ball, inc = POSTP.plan.inc;
    const dx = W(b.to.x) - W(b.from.x), dz = Z(b.to.y) - Z(b.from.y), L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
    POSTP.bp.copy(ball.position);
    if (inc === 'tip') POSTP.bv.set(-ux * 1.5 + uz * 2.2, 4.2, -uz * 1.5 - ux * 2.2);
    else if (inc === 'drop') POSTP.bv.set(ux * 2.2 - uz * 1.2, 2.6, uz * 2.2 + ux * 1.2);
    else POSTP.bv.set(ux * 9, -1.5, uz * 9);
    POSTP.rest = false;
  }
  POSTP.lastT = pT;
  if (!POSTP.rest) {
    const h = Math.min(dt, 0.05);
    POSTP.bv.y -= 10.7 * h; POSTP.bp.addScaledVector(POSTP.bv, h);
    if (POSTP.bp.y < 0.1) { POSTP.bp.y = 0.1; POSTP.bv.y = -POSTP.bv.y * 0.42; POSTP.bv.x *= 0.6; POSTP.bv.z *= 0.6; if (Math.abs(POSTP.bv.y) < 0.6) { POSTP.bv.set(0, 0, 0); POSTP.rest = true; } }
  }
  ball.position.copy(POSTP.bp);
  if (!POSTP.rest) { ballMesh.rotation.x += 0.35; ballMesh.rotation.z += 0.2; }
  else { ballMesh.rotation.x = Math.PI / 2 * 0; ball.rotation.set(0, ball.rotation.y, 0); ball.quaternion.setFromEuler(ball.rotation); }
}
function updateBall(sim, f, qbG, dt = 0.016) {
  const b = sim.ball;
  const R = sim.run;
  const handed = state.replay ? state.replayHanded : R && R.handed && !sim.rpoThrow;
  if (!b && R && handed) { const car = actors.find((x) => x.src.id === R.carrierId && x.kind !== 'dl' && x.kind !== 'def'); if (car) { car.g.updateMatrixWorld(true); const p = car.g.userData.rig.haR.getWorldPosition(_bv); p.y += 0.04; ball.position.copy(p); ball.rotation.set(0.6, car.g.rotation.y, 0); ballShadow.position.set(p.x, 0.025, p.z); return; } }
  if (!b) { // in QB's hand
    qbG.updateMatrixWorld(true); const hand = qbG.userData.rig.haR.getWorldPosition(_bv);
    if (sim.phase === 'presnap') hand.set(qbG.position.x, 0.15, Z(0) + 0.1), hand.x = 0; // ball on the spot pre-snap
    ball.position.copy(hand); ballMesh.rotation.set(0, 0, 0); ball.rotation.set(-0.3, qbG.rotation.y, 0);
  } else {
    const sx = W(b.from.x), sz = Z(b.from.y), ex = W(b.to.x), ez = Z(b.to.y);
    const h = E.ballHeight(b, f), h2 = E.ballHeight(b, Math.min(1, f + 0.01));
    ball.position.set(sx + (ex - sx) * f, h, sz + (ez - sz) * f);
    const dir = _bd.set((ex - sx) * 0.01, h2 - h + 1e-5, (ez - sz) * 0.01).normalize();
    ball.quaternion.setFromUnitVectors(FWD, dir);
    ballMesh.rotation.z += 0.9; // spiral
    const pT = postT();
    if (sim.phase === 'done' && sim.result && sim.result.type === 'incomplete' && POSTP.plan && pT >= 0) looseBall(dt, pT);
    if (intT != null && interceptor) { // ball is caught by the defender: attach to his hands
      interceptor.g.updateMatrixWorld(true); interceptor.g.userData.rig.haR.getWorldPosition(ball.position);
      ballMesh.rotation.z = 0;
    } else if (C.ended && C.res && C.res.type === 'complete' && C.ti && f >= 1) { // caught: ball stays in the receiver's hands (and goes down with him)
      const rc = actors.find((x) => x.src.id === C.ti.id && x.kind === 'wr');
      if (rc) {
        rc.g.updateMatrixWorld(true); const rg = rc.g.userData.rig;
        if (pT >= 0 && pT < 0.2) { rg.haL.getWorldPosition(_hm); rg.haR.getWorldPosition(ball.position); ball.position.add(_hm).multiplyScalar(0.5); } // in both hands: cushion
        else rg.haR.getWorldPosition(ball.position); // secured, tucked
        ballMesh.rotation.z = 0;
      }
    }
  }
  const inAir = !!b && (f < 1 && !(sim.phase === 'done' && sim.result && sim.result.type !== 'incomplete'));
  ball.scale.setScalar(inAir ? 1.5 : sim.phase === 'done' && sim.result && sim.result.type !== 'sack' ? 1.45 : 1.25); // v9 readability scale (true size x1.25 held, x1.5 in flight)
  if (inAir && f > 0.01) { trail.visible = true; pushTrail(ball.position); } else if (!inAir) resetTrail();
  ball.visible = !window.__hideBall; trail.visible = trail.visible && ball.visible; ballShadow.visible = ball.visible;
  ballShadow.position.set(ball.position.x, 0.025, ball.position.z);
  ballShadow.material.opacity = 0.45 / (1 + ball.position.y * 0.3); ballShadow.scale.setScalar(inAir ? 1.3 : 1);
}

// ---------------- main loop ----------------
let last = performance.now(), fpsAcc = 0, fpsN = 0;
// Adaptive quality: if we can't hold 30 fps (e.g. software GL), drop render scale, then soft shadows.
// v6 adaptive resolution (Graphics: Auto). Every ~1 s: frame time > 30 ms (≈ <33 fps) twice in a row → pixel ratio ×0.85
// (floor 0.5); sustained < 18 ms (≈ >55 fps) for 3 windows → ×1.1 back up to the cap. High/Low are fixed.
const SCALE_CAP = SOFT_GL ? 0.8 : DPR_CAP;
let renderScale = renderer.getPixelRatio(), lowStreak = 0, highStreak = 0;
function adaptQuality(fps) {
  if (GFX !== 'auto') return;
  const ms = 1000 / Math.max(1, fps);
  lowStreak = ms > 30 ? lowStreak + 1 : 0; highStreak = ms < 18 ? highStreak + 1 : 0;
  if (lowStreak >= 2 && renderScale > 0.5) { lowStreak = 0; renderScale = Math.max(0.5, renderScale * 0.85); renderer.setPixelRatio(renderScale); resize(); }
  else if (highStreak >= 3 && renderScale < SCALE_CAP) { highStreak = 0; renderScale = Math.min(SCALE_CAP, renderScale * 1.1); renderer.setPixelRatio(renderScale); resize(); }
}
document.addEventListener('visibilitychange', () => { last = performance.now(); }); // rAF pauses while hidden; avoid a dt spike on return
window.__quality = () => ({ gfx: GFX, light: LIGHT, renderScale: renderer.getPixelRatio(), soft: SOFT_GL, camera: camMode() });
window.__fps = 0;
function frameBody(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw) * (window.__timeScale ?? 1); last = now; // __timeScale: screenshot/test hook (slow-mo / freeze)
  fpsAcc += raw; fpsN++; if (fpsAcc > 1) { window.__fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; adaptQuality(window.__fps); }
  const sim = state.sim;
  if (sim) {
    let alpha = 1;
    if (sim.phase === 'presnap') {
      // v14: unlimited pre-snap — nothing ticks; the player snaps with SNAP / Space / Enter
    } else if (sim.phase !== 'done') {
      state.acc += dt;
      let guard = 0; // v10: bounded catch-up (max 12 engine steps per frame) so a slow frame can't spiral
      while (state.acc >= STEP && sim.phase !== 'done' && guard++ < 12) { snapshotPrev(); E.step(sim, STEP); record(sim); state.acc -= STEP; }
      if (guard >= 12) state.acc = 0;
      alpha = sim.phase === 'done' ? 1 : state.acc / STEP;
      if (sim.run && !sim.rpoThrow) { setStyle(clockFill, 'width', Math.min(100, 100 * sim.t / sim.run.tEnd).toFixed(1) + '%'); setStyle(clockFill, 'background', '#4fb3ff'); setText(clockLabel, sim.run.handed ? 'Run' : 'Mesh'); }
      else setClock(sim.throwInfo ? sim.throwInfo.time : sim.t, sim.sackTime);
      const pf = sim.run && !sim.rpoThrow ? 0 : sim.t / sim.sackTime;
      state.shake = sim.throwInfo ? state.shake * 0.9 : Math.max(0, (pf - 0.55) / 0.45);
    } else state.shake *= 0.9;
    if (sim.phase === 'done' && !state.graded) { state.graded = true; try { grade(); } catch (e) { frameErr('grade', e); $('result').hidden = false; } }

    // pick positions: replay frames, or interpolated live state
    let pos = null, ballF = sim.ball ? sim.ball.f : 0, hasBall = !!sim.ball;
    if (state.replay) {
      const R = state.replay; R.t += dt; R.i = Math.min(state.rec.length - 1, Math.floor(R.t / STEP));
      const fr = state.rec[R.i]; pos = fr.pos; hasBall = !!fr.ball; ballF = fr.ball ? fr.ball.f : 0; state.replayHanded = fr.h;
      if (R.t > state.rec.length * STEP + 2.2) R.t = 0;
    }
    const res = sim.result;
    interceptor = res && res.type === 'interception' ? actors.find((a) => a.src.id === res.defender && a.kind !== 'wr') : null;
    if (interceptor && !state.replay) state.intT = (state.intT == null ? 0 : state.intT + dt);
    const ip = state.intPending; // celebration ≈ 0.55 s catch + 2.3 s point/run/dance with the camera held, then grade, then replay
    if (ip && ip.sim === sim && state.intT != null && state.intT >= INT_REPLAY_AT) { state.intPending = null; $('banner').hidden = true; $('taunt').hidden = true; if (!state.replay) startReplay(); }
    // v9: post-play clock (YAC / loose ball); the auto replay starts once it has played out (the grade panel is already up)
    if (sim.phase === 'done' && state.postT != null && !state.replay) {
      state.postT += dt;
      const pl = POSTP.plan, endAt = (pl ? pl.dur : 0.6) + 0.9;
      if (!interceptor && !state.autoReplayed && state.postT > endAt) { state.autoReplayed = true; startReplay(); }
    }
    intT = !interceptor ? null : state.replay ? (state.replay.t > state.rec.length * STEP ? state.replay.t - state.rec.length * STEP : null) : state.intT;
    const qbA = actors[0];
    const qbPos = pos ? { x: pos[0][0], y: pos[0][1] } : sim.qb;
    const qbW = { x: W(qbPos.x), z: Z(qbPos.y) };
    try { frameContext(sim, hasBall, ballF); } catch (e) { frameErr('context', e); }
    if (scaleDbg.on) updateScaleDebug();
    actors.forEach((a, i) => {
      let x, y;
      if (pos) [x, y] = pos[i];
      else { const p = state.prev.get(a.src) || a.src; x = p.x + (a.src.x - p.x) * alpha; y = p.y + (a.src.y - p.y) * alpha; }
      try { const pp = postPos(a, x, y, postT()); if (pp && isFinite(pp.x) && isFinite(pp.y)) { x = pp.x; y = pp.y; } } catch (e) { frameErr('postPos', e); }
      if (intT != null && a === interceptor && intT > 0.55) { const o = celebrationOffset(intT - 0.55, { x, y }, qbPos); x = o.x; y = o.y; } // celebration run at the camera
      if (!isFinite(x) || !isFinite(y)) { x = a.src.x; y = a.src.y; } // v10: never feed NaN into the scene graph
      try { animateActor(a, x, y, dt, qbW); } catch (e) { frameErr('animate', e); }
      if (a.kind === 'wr') {
        const isBest = sim.phase === 'done' && a.src.id === sim.play.correct;
        const ring = a.g.userData.ring, op = isBest ? 0.9 : (sim.phase === 'live' && a.kind === 'wr' && eligible(a) ? 0.35 : 0);
        ring.material.opacity = op; ring.visible = op > 0;
        if (op > 0) ring.material.color.setHex(isBest ? 0x3ee08f : 0xffd23f);
      }
    });
    try {
      if (hasBall && sim.ball) { const pb = state.prev.get('ball'); const f = pos ? ballF : pb ? pb.f + (sim.ball.f - pb.f) * alpha : sim.ball.f; updateBall(sim, f, qbA.g, dt); }
      else { const b0 = sim.ball; sim.ball = null; try { updateBall(sim, 0, qbA.g); } finally { sim.ball = b0; } } // (no per-frame object spread)
    } catch (e) { frameErr('ball', e); }
    try { updateCamera(dt, qbPos); } catch (e) { frameErr('camera', e); }
    try { updateBadges(); updateTaunt(); } catch (e) { frameErr('badges', e); }
  }
}
// v10: the rAF loop can never die: each section is isolated, errors are logged once per kind and the game keeps going,
// and watchdogs force-finish any state that runs past its max duration.
const frameErrs = new Set();
function frameErr(where, e) { const k = where + ':' + (e && e.message); if (!frameErrs.has(k)) { frameErrs.add(k); console.warn('[frame ' + where + ']', e); } window.__frameErrors = (window.__frameErrors || 0) + 1; }
function watchdogs() {
  const sim = state.sim; if (!sim) return;
  if ((sim.phase === 'live' || sim.phase === 'flight') && sim.t > 14) { // engine never resolved: end the rep as incomplete
    sim.ball = null; sim.phase = 'done'; sim.result = sim.result || { type: 'incomplete', text: 'Incomplete', yards: 0, cause: 'watchdog' }; console.warn('watchdog: forced play end');
  }
  if (sim.phase === 'done' && !state.graded) { state.graded = true; try { grade(); } catch (e) { frameErr('grade', e); $('result').hidden = false; } }
  if (sim.phase === 'done' && state.postT != null && state.postT > 8 && !state.replay && !state.autoReplayed) { state.autoReplayed = true; POSTP.plan = null; try { startReplay(); } catch (e) { frameErr('replay', e); } }
  if (state.gradeWait === sim && state.gradeAt && performance.now() - state.gradeAt > 3000) { state.pre = { sim, key: preKey(sim), evals: null, protTable: null, timedOut: true }; finishGrade(); }
}
function frame(now) {
  try { frameBody(now); } catch (e) { frameErr('update', e); last = now; }
  try { watchdogs(); } catch (e) { frameErr('watchdog', e); }
  try { if (!document.hidden) { renderer.render(scene, camera); drawRouteOverlay(); } } catch (e) { frameErr('render', e); }
  requestAnimationFrame(frame);
}

updateStats();
nextPlay();
requestAnimationFrame(frame);
window.__qb3d = { routeLines, routeGroup, drawRouteOverlay, setScaleDebug, scaleDbg, heightYd, boxMap, renderer, scene, state, E, D, M, nextPlay, doSnap, throwTo, setView, camera, actors, setProtection, setAudible, setMode, startPlay: (p) => nextPlay(p), updateStats, DIFF, goNext, setPoolFilter: (f) => { state.poolFilter = f; state.order = []; }, setDiff: (d) => { state.diff = d; $('difficulty').value = d; localStorage.setItem('pocketiq3d.diff', d); } };
window.dispatchEvent(new Event('pocketiq:ready'));
