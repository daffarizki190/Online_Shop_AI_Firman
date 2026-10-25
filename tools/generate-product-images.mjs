/**
 * Generator gambar produk premium (flat-lay editorial) — Aura Atelier
 * Jalankan: node tools/generate-product-images.mjs
 * Menghasilkan: assets/*.svg (tee/hoodie/shirt) dengan lipatan kain,
 * jahitan double-needle, kerah rib, shading warna, dan bayangan lembut.
 *
 * GANTI DENGAN FOTO ASLI: cukup timpa file di assets/ dengan nama sama
 * (rasio 3:4, disarankan ≤300KB) — tidak perlu ubah kode.
 */
import { writeFileSync } from 'node:fs';

const PRODUCTS = [
  { file: 'tee-bone.svg', type: 'tee', color: '#E8E2D4', dark: '#C9C2B0' },
  { file: 'tee-slate.svg', type: 'tee', color: '#6E7278', dark: '#565A60' },
  { file: 'ls-ink.svg', type: 'ls', color: '#23252B', dark: '#101114' },
  { file: 'hoodie-carbon.svg', type: 'hoodie', color: '#2E2E33', dark: '#191A1E', zip: true },
  { file: 'hoodie-moss.svg', type: 'hoodie', color: '#5C6650', dark: '#464E3C' },
  { file: 'shirt-ecru.svg', type: 'shirt', color: '#EDE6D6', dark: '#CFC7B2' },
  { file: 'shirt-indigo.svg', type: 'shirt', color: '#3E4668', dark: '#2C324C' },
];

const BODY = {
  tee: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 900 Q448 930 574 900 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 372 356 300 Z',
  hoodie: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 930 Q448 960 574 930 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 396 356 300 Z',
  shirt: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 940 Q448 966 574 940 L574 470 L596 512 L680 470 L628 336 L540 300 L470 330 L426 300 Z',
};

/* Titik pada kurva kuadratik untuk menempatkan rib kerah secara teratur */
const qPoint = (a, c, b, t) => ({
  x: (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
  y: (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
});

function ribTicks(a, c, b, n, inward = 10) {
  let out = '';
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = qPoint(a, c, b, t);
    out += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${(p.x + (p.x < 448 ? -6 : 6)).toFixed(1)}" y2="${(p.y + inward).toFixed(1)}" stroke="rgba(0,0,0,.20)" stroke-width="2.2"/>`;
  }
  return out;
}

function wrinkles(type) {
  const w = [
    'M380 560 Q448 586 516 560',
    'M372 662 Q448 692 524 662',
    'M556 700 q22 20 10 48',
    'M340 700 q-16 24 -4 52',
    'M448 760 q30 14 20 52',
  ];
  if (type === 'hoodie') w.push('M400 600 Q448 620 496 600');
  if (type === 'shirt') w.push('M500 600 q26 16 18 46', 'M396 620 q-24 18 -12 46');
  return w.map((d) => `<path d="${d}" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="5" stroke-linecap="round"/>`).join('');
}

function svgFor(p) {
  const body = BODY[p.type === 'ls' ? 'tee' : p.type];
  const hemY = p.type === 'hoodie' ? 906 : p.type === 'shirt' ? 918 : 888;
  const hoodBack = p.type === 'hoodie'
    ? `<path d="M360 302 Q448 238 536 302 Q448 396 360 302 Z" fill="${p.dark}" opacity=".85" stroke="rgba(0,0,0,.25)" stroke-width="3"/>` : '';
  const hoodFront = p.type === 'hoodie'
    ? `<path d="M378 306 Q448 398 518 306 Q448 352 378 306 Z" fill="rgba(0,0,0,.16)"/>
       ${ribTicks([378, 306], [448, 398], [518, 306], 8, -8)}
       <path d="M426 394 q-8 58 6 96" fill="none" stroke="${p.dark}" stroke-width="8" stroke-linecap="round"/>
       <path d="M470 394 q8 58 -6 96" fill="none" stroke="${p.dark}" stroke-width="8" stroke-linecap="round"/>
       <circle cx="431" cy="492" r="5" fill="#C9C4B6"/><circle cx="465" cy="492" r="5" fill="#C9C4B6"/>` : '';
  const pocket = p.type === 'hoodie'
    ? `<path d="M368 664 H528 V768 Q528 784 512 784 H384 Q368 784 368 768 Z" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="3"/>
       <path d="M372 668 H524" stroke="rgba(0,0,0,.10)" stroke-width="6" stroke-linecap="round"/>` : '';
  const zip = p.zip
    ? `<line x1="448" y1="336" x2="448" y2="926" stroke="rgba(255,255,255,.14)" stroke-width="5"/>
       <line x1="448" y1="336" x2="448" y2="926" stroke="rgba(0,0,0,.35)" stroke-width="4" stroke-dasharray="3 6"/>
       <rect x="443" y="352" width="10" height="26" rx="3" fill="#C9C4B6"/>` : '';
  const collar = p.type === 'shirt'
    ? `<path d="M398 300 Q448 282 498 300 L448 352 Z" fill="${p.dark}" opacity=".9" stroke="rgba(0,0,0,.22)" stroke-width="3"/>
       <line x1="448" y1="352" x2="448" y2="912" stroke="rgba(0,0,0,.18)" stroke-width="2.5"/>
       <line x1="438" y1="352" x2="438" y2="912" stroke="rgba(0,0,0,.14)" stroke-width="2"/>
       <line x1="458" y1="352" x2="458" y2="912" stroke="rgba(0,0,0,.14)" stroke-width="2"/>
       ${[430, 545, 660, 775].map((y) => `<circle cx="448" cy="${y}" r="6" fill="#F4F2ED" stroke="rgba(0,0,0,.28)" stroke-width="2"/>`).join('')}`
    : `<path d="M382 302 Q448 358 514 302 Q448 288 382 302 Z" fill="rgba(0,0,0,.18)"/>
       ${ribTicks([384, 303], [448, 356], [512, 303], 8, 12)}`;
  const lsSleeves = p.type === 'ls'
    ? `<path d="M300 512 L216 470 L252 706 L314 690 Z" fill="${p.color}" stroke="rgba(0,0,0,.28)" stroke-width="4"/>
       <path d="M596 512 L680 470 L644 706 L582 690 Z" fill="${p.color}" stroke="rgba(0,0,0,.28)" stroke-width="4"/>
       <path d="M256 692 L310 678" stroke="rgba(0,0,0,.20)" stroke-width="3"/>
       <path d="M640 692 L586 678" stroke="rgba(0,0,0,.20)" stroke-width="3"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 896 1200">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#F7F5F0"/><stop offset="100%" stop-color="#ECE9E1"/>
    </radialGradient>
    <clipPath id="body-clip"><path d="${body}"/></clipPath>
  </defs>
  <rect width="896" height="1200" fill="url(#bg)"/>
  <ellipse cx="448" cy="980" rx="252" ry="26" fill="rgba(0,0,0,.10)"/>
  <ellipse cx="448" cy="992" rx="190" ry="18" fill="rgba(0,0,0,.08)"/>
  ${hoodBack}
  <path d="${body}" fill="${p.color}" stroke="rgba(0,0,0,.28)" stroke-width="4" stroke-linejoin="round"/>
  <g clip-path="url(#body-clip)">
    <path d="M322 300 H400 V960 H322 Z" fill="rgba(0,0,0,.08)"/>
    <path d="M496 300 H574 V960 H496 Z" fill="rgba(0,0,0,.06)"/>
    <ellipse cx="448" cy="440" rx="118" ry="88" fill="rgba(255,255,255,.09)"/>
    <ellipse cx="448" cy="368" rx="72" ry="26" fill="rgba(0,0,0,.10)"/>
    <path d="M322 470 L356 500 L356 560 L322 520 Z" fill="rgba(0,0,0,.07)"/>
    <path d="M574 470 L540 500 L540 560 L574 520 Z" fill="rgba(0,0,0,.07)"/>
    ${wrinkles(p.type)}
    <path d="M336 ${hemY - 8} Q448 ${hemY + 18} 560 ${hemY - 8}" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="4"/>
    <path d="M338 ${hemY} Q448 ${hemY + 26} 558 ${hemY}" fill="none" stroke="rgba(0,0,0,.24)" stroke-width="2.5" stroke-dasharray="10 8"/>
  </g>
  ${lsSleeves}
  <path d="M352 316 L326 452" stroke="rgba(0,0,0,.16)" stroke-width="3"/>
  <path d="M544 316 L570 452" stroke="rgba(0,0,0,.16)" stroke-width="3"/>
  ${collar}
  ${hoodFront}
  ${pocket}
  ${zip}
</svg>`;
}

for (const p of PRODUCTS) {
  writeFileSync(new URL('../assets/' + p.file, import.meta.url), svgFor(p));
  console.log('✓', p.file);
}
