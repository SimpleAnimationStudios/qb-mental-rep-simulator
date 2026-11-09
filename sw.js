/* Pocket IQ 3D service worker — offline app shell for the installed PWA.
 * - Precaches every runtime file (HTML, CSS, classic scripts, ES modules, the analysis worker and its importScripts,
 *   vendored Three.js, manifest and icons) into one versioned cache. Install is atomic: cache.addAll() rejects if any
 *   file fails, so a half-cached version never activates and the previous version keeps serving.
 * - Only same-origin GET requests inside this worker's scope are answered from the cache. Nothing else is cached at
 *   runtime (no cross-origin responses, no API/auth responses, no user data; saved progress lives in localStorage).
 * - Updates: a changed sw.js installs the new cache in the background and waits. The page shows an "Update ready"
 *   button; nothing reloads mid-rep unless the player taps it. Closing every Pocket IQ window/tab also applies it.
 * - Bump VERSION whenever any precached file changes (tests/pwa-check.cjs verifies the list covers every runtime file). */
const VERSION = 'v12-pwa1';
const PREFIX = 'pocketiq3d-shell-';
const CACHE = PREFIX + VERSION;
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'manifest.json',
  'pwa.js',
  'js/data.js',
  'js/playbook.js',
  'js/protections.js',
  'js/runplay.js',
  'js/defense.js',
  'js/engine.js',
  'js/reads.js',
  'js/audible-ev.js',
  'js/modes.js',
  'js/grading.js',
  'js/customplay.js',
  'js/game3d.js',
  'js/rig3d.js',
  'js/hub.js',
  'js/analysis-worker.js',
  'vendor/three.module.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon-180.png'
];
const SCOPE = new URL(self.registration.scope);
const toURL = (p) => new URL(p, SCOPE).href;
const PRECACHED = new Set(ASSETS.map(toURL));
const SHELL = toURL('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files.
    await cache.addAll(ASSETS.map((p) => new Request(toURL(p), { cache: 'reload', credentials: 'same-origin' })));
  })().catch(async (err) => { await caches.delete(CACHE); throw err; })); // surface failure; previous version stays active
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))); // only our own old caches
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== SCOPE.origin || !url.href.startsWith(SCOPE.href)) return; // cross-origin / out of scope: browser default
  const key = url.origin + url.pathname; // ignore query strings (e.g. ?home=1) for cache lookups
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      if (key === SCOPE.href || key === SHELL) return (await cache.match(SHELL)) || fetch(req);
      try { return await fetch(req); } // other in-scope pages: network first, app shell when offline
      catch (e) { const shell = await cache.match(SHELL); if (shell) return shell; throw e; }
    })());
    return;
  }
  if (!PRECACHED.has(key)) return; // never cache anything outside the shell list
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(key)) || fetch(req);
  })());
});
