/**
 * Generator gambar produk premium (flat-lay editorial minimal) — Aura Atelier
 * Jalankan: node tools/generate-product-images.mjs
 *
 * Prinsip visual: bersih & tenang — shading gradasi lembut (tanpa tepi keras),
 * satu garis per detail, tanpa coretan kerutan. Ganti dengan foto asli:
 * timpa file di assets/ dengan nama sama (rasio 3:4, ≤300 KB).
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
  ls: 'M356 300 L268 336 L210 468 L240 690 Q244 702 256 698 L284 688 L316 502 L322 470 L322 900 Q448 930 574 900 L574 470 L580 502 L612 688 L640 698 Q652 702 656 690 L686 468 L628 336 L540 300 Q448 372 356 300 Z',
};

function svgFor(p) {
  const type = p.type;
  const body = BODY[type];
  const hemY = type === 'hoodie' ? 908 : type === 'shirt' ? 920 : 890;

  const neck = {
    tee: `<path d="M382 302 Q448 356 514 302 Q448 286 382 302 Z" fill="rgba(0,0,0,.15)"/>
          <path d="M390 305 Q448 348 506 305" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="3"/>`,
    ls: `<path d="M382 302 Q448 356 514 302 Q448 286 382 302 Z" fill="rgba(0,0,0,.15)"/>
         <path d="M390 305 Q448 348 506 305" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="3"/>`,
    hoodie: `
      <path d="M370 310 Q448 254 526 310 L526 320 Q448 280 370 320 Z" fill="${p.dark}" opacity=".9"/>
      <path d="M388 310 Q448 388 508 310 Q448 344 388 310 Z" fill="rgba(0,0,0,.20)"/>
      <path d="M430 372 q-4 22 2 40" fill="none" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/>
      <path d="M466 372 q4 22 -2 40" fill="none" stroke="${p.dark}" stroke-width="7" stroke-linecap="round"/>`,
    shirt: `<path d="M400 302 Q448 284 496 302 L448 350 Z" fill="${p.dark}" stroke="rgba(0,0,0,.20)" stroke-width="2.5"/>
            <line x1="448" y1="352" x2="448" y2="912" stroke="rgba(0,0,0,.15)" stroke-width="2.5"/>
            ${[438, 556, 674, 792].map((y) => `<circle cx="448" cy="${y}" r="6" fill="#F4F2ED" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`).join('')}`,
  }[type];

  const extras = {
    hoodie: `
      <rect x="382" y="668" width="132" height="104" rx="16" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="3"/>
      ${p.zip ? `
      <line x1="448" y1="334" x2="448" y2="922" stroke="rgba(255,255,255,.16)" stroke-width="4"/>
      <rect x="444" y="348" width="8" height="22" rx="3" fill="#C9C4B6"/>` : ''}`,
    ls: `
      <path d="M242 686 L282 676" stroke="rgba(0,0,0,.16)" stroke-width="3" stroke-linecap="round"/>
      <path d="M614 676 L654 686" stroke="rgba(0,0,0,.16)" stroke-width="3" stroke-linecap="round"/>`,
  }[type] || '';

  const seam = type === 'ls'
    ? `<path d="M352 326 Q330 396 322 464" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="3"/>
       <path d="M544 326 Q566 396 574 464" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="3"/>`
    : `<path d="M352 322 Q336 392 324 464" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="3"/>
       <path d="M544 322 Q560 392 572 464" fill="none" stroke="rgba(0,0,0,.10)" stroke-width="3"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 896 1200">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%">
      <stop offset="0%" stop-color="#F7F5F0"/><stop offset="100%" stop-color="#ECE9E1"/>
    </radialGradient>
    <linearGradient id="sisi" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(0,0,0,.13)"/><stop offset="20%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="80%" stop-color="rgba(0,0,0,0)"/><stop offset="100%" stop-color="rgba(0,0,0,.13)"/>
    </linearGradient>
    <radialGradient id="cahaya" cx="50%" cy="34%" r="55%">
      <stop offset="0%" stop-color="rgba(255,255,255,.10)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <clipPath id="body-clip"><path d="${body}"/></clipPath>
  </defs>
  <rect width="896" height="1200" fill="url(#bg)"/>
  <ellipse cx="448" cy="984" rx="238" ry="24" fill="rgba(0,0,0,.09)"/>
  <path d="${body}" fill="${p.color}" stroke="rgba(0,0,0,.26)" stroke-width="3.5" stroke-linejoin="round"/>
  <g clip-path="url(#body-clip)">
    <rect x="300" y="280" width="296" height="700" fill="url(#sisi)"/>
    <rect x="300" y="280" width="296" height="700" fill="url(#cahaya)"/>
    <path d="M336 ${hemY - 10} Q448 ${hemY + 16} 560 ${hemY - 10}" fill="none" stroke="rgba(0,0,0,.13)" stroke-width="2.5" stroke-dasharray="8 7"/>
  </g>
  ${seam}
  ${neck}
  ${extras}
</svg>`;
}

for (const p of PRODUCTS) {
  writeFileSync(new URL('../assets/' + p.file, import.meta.url), svgFor(p));
  console.log('✓', p.file);
}
