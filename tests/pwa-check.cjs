// Static PWA checks (no browser): node tests/pwa-check.cjs
// manifest fields + icon PNG dimensions, relative (sub-path safe) URLs, service-worker precache covers every runtime file,
// and syntax of all shipped JS.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const R = path.join(__dirname, '..'); let fails = 0;
const ok = (n, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' — ' + x : '')); if (!c) fails++; };
const rel = (u) => typeof u === 'string' && !/^([a-z]+:|\/)/i.test(u); // no scheme, no leading slash: works at / and /any/sub/path/
const pngSize = (f) => { const b = fs.readFileSync(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

// manifest
const m = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
ok('manifest name/short_name', m.name && m.short_name && m.short_name.length <= 12, m.short_name);
ok('manifest display standalone', m.display === 'standalone');
ok('manifest orientation landscape', m.orientation === 'landscape');
ok('manifest start_url/scope/id relative', [m.start_url, m.scope, m.id].every(rel) && m.start_url === './' && m.scope === './', JSON.stringify([m.start_url, m.scope, m.id]));
ok('manifest colours match app background', m.theme_color === '#05080d' && m.background_color === '#05080d');
for (const ic of m.icons) {
  const f = path.join(R, ic.src), sz = fs.existsSync(f) && pngSize(f);
  ok(`icon ${ic.src} ${ic.sizes} ${ic.purpose}`, rel(ic.src) && sz && `${sz[0]}x${sz[1]}` === ic.sizes && ic.type === 'image/png', sz && sz.join('x'));
}
const has = (s, p) => m.icons.some((i) => i.sizes === s && (i.purpose || 'any').split(' ').includes(p));
ok('icons: any 192 + 512, maskable 512', has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'));
const at = pngSize(path.join(R, 'icons/apple-touch-icon-180.png'));
ok('apple-touch-icon 180x180', at && at[0] === 180 && at[1] === 180);

// index.html head
const html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
for (const [n, re] of [['manifest link', /<link rel="manifest" href="manifest.json">/], ['apple-touch-icon', /rel="apple-touch-icon"[^>]*href="icons\/apple-touch-icon-180.png"/],
  ['apple-mobile-web-app-capable', /name="apple-mobile-web-app-capable" content="yes"/], ['theme-color', /name="theme-color" content="#05080d"/],
  ['viewport-fit=cover', /name="viewport"[^>]*viewport-fit=cover/], ['apple title', /apple-mobile-web-app-title/], ['pwa.js registered', /<script src="pwa.js"><\/script>/]]) ok('index: ' + n, re.test(html));
const htmlRefs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((x) => x[1]);
ok('index: every src/href relative', htmlRefs.every(rel), htmlRefs.filter((u) => !rel(u)).join(','));

// runtime graph: html refs + ES module imports + Worker URL + worker importScripts
const runtime = new Set(htmlRefs.filter((u) => !u.endsWith('.png') || true));
const addMod = (file) => { const src = fs.readFileSync(path.join(R, file), 'utf8');
  for (const [, u] of src.matchAll(/(?:import[^'"]*from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)) { const t = path.posix.normalize(path.posix.join(path.posix.dirname(file), u)); if (!runtime.has(t)) { runtime.add(t); if (t.endsWith('.js')) addMod(t); } }
  for (const [, u] of src.matchAll(/new Worker\(\s*['"]([^'"]+)['"]/g)) runtime.add(u); // Worker URLs resolve against the document
};
[...runtime].filter((u) => u.endsWith('.js')).forEach(addMod);
const wsrc = fs.readFileSync(path.join(R, 'js/analysis-worker.js'), 'utf8');
for (const [, list] of wsrc.matchAll(/importScripts\(([^)]*)\)/g)) for (const [, u] of list.matchAll(/['"]([^'"]+)['"]/g)) runtime.add('js/' + u);
runtime.add('manifest.json'); m.icons.forEach((i) => runtime.add(i.src));

const sw = fs.readFileSync(path.join(R, 'sw.js'), 'utf8');
const assets = JSON.parse('[' + sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].replace(/'/g, '"') + ']');
const missing = [...runtime].filter((u) => !assets.includes(u));
ok('sw precache covers every runtime file (' + runtime.size + ')', missing.length === 0, missing.join(', '));
ok('sw precache entries all exist & relative', assets.every((a) => rel(a) && (a === './' || fs.existsSync(path.join(R, a)))), assets.filter((a) => !(a === './' || fs.existsSync(path.join(R, a)))).join(','));
const allJs = fs.readdirSync(path.join(R, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
ok('sw precache includes every js/*.js', allJs.every((f) => assets.includes(f)), allJs.filter((f) => !assets.includes(f)).join(','));
ok('sw: cache prefix scoped cleanup', /k\.startsWith\(PREFIX\) && k !== CACHE/.test(sw));
ok('sw: no root-absolute paths', !/['"]\/(js|vendor|icons|index)/.test(sw));
const pw = fs.readFileSync(path.join(R, 'pwa.js'), 'utf8');
ok('pwa.js: secure-context guard + relative registration + no HTTP cache for sw.js', /isSecureContext/.test(pw) && /register\('sw.js', \{ scope: '.\/', updateViaCache: 'none' \}\)/.test(pw));

// syntax
for (const f of ['sw.js', 'pwa.js', ...allJs]) {
  try { execFileSync(process.execPath, ['--check', path.join(R, f)], { stdio: 'pipe' }); ok('node --check ' + f, true); }
  catch (e) {
    // ES modules (import/export) need --input-type=module
    try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(R, f)), stdio: ['pipe', 'pipe', 'pipe'] }); ok('node --check (module) ' + f, true); }
    catch (e2) { ok('node --check ' + f, false, String(e2.stderr || e2).slice(0, 300)); }
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
