/* Pocket IQ 3D — registers the offline service worker (installed PWA). Classic script, no dependencies.
 * Registers only in secure contexts (HTTPS, or http://localhost for testing); anywhere else the game still runs online. */
(function () {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  var showUpdate = function (reg) {
    if (!reg.waiting || !navigator.serviceWorker.controller || document.getElementById('pwa-update')) return;
    var b = document.createElement('button');
    b.id = 'pwa-update'; b.type = 'button'; b.textContent = 'Update ready · Reload';
    b.title = 'A new version is downloaded. Reload when you are between reps (progress is saved).';
    b.style.cssText = 'position:fixed;z-index:50;left:50%;transform:translateX(-50%);bottom:max(34px,calc(env(safe-area-inset-bottom) + 30px));background:#3ee08f;color:#06200f;border:0;font-weight:800;padding:8px 14px;border-radius:999px;box-shadow:0 4px 14px #0008';
    b.onclick = function () { b.disabled = true; reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' }); };
    document.body.appendChild(b);
  };
  var reloading = false, hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // only reload for an update the player accepted, never on the very first install
    if (!hadController || reloading) { hadController = true; return; }
    reloading = true; location.reload();
  });
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) {
      window.__pwa = { registration: reg };
      showUpdate(reg);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing; if (!w) return;
        w.addEventListener('statechange', function () { if (w.state === 'installed') showUpdate(reg); });
      });
    }).catch(function (err) {
      window.__pwa = { error: String(err) };
      console.warn('Offline mode unavailable (service worker registration failed):', err);
    });
  });
})();
