// Pocket IQ app icon source. Generates the SVG for a given content scale.
// scale 1 = standard full-bleed icon; scale 0.72 = maskable (all artwork inside the 80% safe circle).
module.exports = function iconSVG(scale = 1) {
  const s = scale, t = (v) => 256 + (v - 256) * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#0f2233"/><stop offset=".6" stop-color="#08111b"/><stop offset="1" stop-color="#05080d"/></radialGradient>
  <linearGradient id="turf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3ee08f" stop-opacity=".0"/><stop offset="1" stop-color="#3ee08f" stop-opacity=".16"/></linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${7 * s}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<rect y="300" width="512" height="212" fill="url(#turf)"/>
<g stroke="#3ee08f" stroke-opacity=".18" stroke-width="3">${[96, 176, 256, 336, 416].map((x) => `<line x1="${x}" y1="330" x2="${x + (x - 256) * 0.35}" y2="512"/>`).join('')}</g>
<g transform="translate(${t(256)} ${t(178)}) scale(${s}) rotate(-28)" filter="url(#glow)">
  <ellipse rx="128" ry="74" fill="#0b1520" stroke="#3ee08f" stroke-width="14"/>
  <line x1="-46" y1="0" x2="46" y2="0" stroke="#e8eef5" stroke-width="9" stroke-linecap="round"/>
  ${[-30, -10, 10, 30].map((x) => `<line x1="${x}" y1="-14" x2="${x}" y2="14" stroke="#e8eef5" stroke-width="8" stroke-linecap="round"/>`).join('')}
  <path d="M-92 -38 Q-104 0 -92 38 M92 -38 Q104 0 92 38" fill="none" stroke="#3ee08f" stroke-opacity=".55" stroke-width="7" stroke-linecap="round"/>
</g>
<g transform="translate(${t(256)} ${t(328)}) scale(${s})" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-weight="800" text-anchor="middle">
  <text y="0" font-size="50" letter-spacing="8" fill="#e8eef5">POCKET</text>
  <text y="98" font-size="100" fill="#3ee08f" letter-spacing="4">IQ</text>
</g>
</svg>`;
};
