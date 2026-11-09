// Renders the PWA icons from tools/icon.svg.js with headless Chromium (Playwright from /tmp/pwt or $PW).
// node tools/make-icons.cjs
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PW || '/tmp/pwt/node_modules/playwright');
const iconSVG = require('./icon.svg.js');
const out = path.join(__dirname, '..', 'icons');
const jobs = [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['apple-touch-icon-180.png', 180, 1], ['maskable-512.png', 512, 0.72], ['maskable-192.png', 192, 0.72]];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.svg'), iconSVG(1));
  fs.writeFileSync(path.join(out, 'maskable.svg'), iconSVG(0.72));
  const b = await chromium.launch();
  for (const [name, size, scale] of jobs) {
    const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:#05080d">${iconSVG(scale).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), clip: { x: 0, y: 0, width: size, height: size }, omitBackground: false });
    await p.close(); console.log('wrote icons/' + name);
  }
  await b.close();
})();
