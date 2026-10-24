/**
 * Katalog SKU Aura Atelier — mengikuti skema `garment_size_specs` pada blueprint.
 * Di produksi data ini disajikan Backend (PostgreSQL + cache Redis) via REST.
 *
 * Kompatibilitas: `AURA_PRODUCT` (produk unggulan) tetap diekspor untuk spec deck.
 * Aplikasi memakai `AURA_CATALOG` (array) + `AuraCatalog.byId(sku)`.
 */
(function (global) {
  'use strict';

  const SIZES_TEE = [
    { size_label: 'S', chest_width_cm: 49.0, body_length_cm: 68.0, shoulder_width_cm: 44.0, sleeve_length_cm: 21.0 },
    { size_label: 'M', chest_width_cm: 52.0, body_length_cm: 70.0, shoulder_width_cm: 46.0, sleeve_length_cm: 22.0 },
    { size_label: 'L', chest_width_cm: 55.0, body_length_cm: 72.0, shoulder_width_cm: 48.0, sleeve_length_cm: 23.5 },
    { size_label: 'XL', chest_width_cm: 58.0, body_length_cm: 74.0, shoulder_width_cm: 50.0, sleeve_length_cm: 24.5 },
    { size_label: 'XXL', chest_width_cm: 61.0, body_length_cm: 76.0, shoulder_width_cm: 52.0, sleeve_length_cm: 25.5 },
  ];
  // Hoodie & kemeja: siluet lebih panjang & lebar
  const SIZES_LONG = SIZES_TEE.map((s) => ({
    ...s,
    chest_width_cm: s.chest_width_cm + 2,
    body_length_cm: s.body_length_cm + 6,
    shoulder_width_cm: s.shoulder_width_cm + 1,
  }));

  const FABRIC_TEE = { material: '100% Combed Cotton 16s · 360 GSM', stretch_factor: 1.03, shrinkage_after_wash_pct: 2.0 };
  const FABRIC_HEAVY = { material: 'French Terry Cotton 20s · 480 GSM', stretch_factor: 1.02, shrinkage_after_wash_pct: 2.5 };
  const FABRIC_SHIRT = { material: 'Tencel-Cotton Blend · 160 GSM', stretch_factor: 1.06, shrinkage_after_wash_pct: 1.0 };

  const rv = (name, rating, date, text, size, verified = true) => ({ name, rating, date, text, size, verified });

  const CATALOG = [
    {
      sku_id: 'TSHIRT-BOXY-NOIR-004', category: 'T-Shirt',
      name: 'Heavyweight Boxy T-Shirt', variant: '04 Noir',
      price: 449000, compare_at_price: 549000, image: 'assets/boxy-tee-noir.jpg',
      fabric_specs: FABRIC_TEE, cut_ease: { chest: -2, shoulder: 1 },
      sizes: SIZES_TEE, stock: { S: 6, M: 14, L: 9, XL: 3, XXL: 0 },
      sold: 1284, featured: true,
      reviews: [
        rv('Raka P.', 5, '2026-10-18', 'Kainnya tebal banget, jatuhnya rapi. Size L presisi sesuai rekomendasi AI — nggak perlu tukar.', 'L'),
        rv('Dinda S.', 5, '2026-10-11', 'Warna noir pekat dan tidak luntur setelah 5× cuci. Favorit baru.', 'M'),
        rv('Yoga A.', 4, '2026-09-30', 'Bagus, cuma potongan boxy agak lebar buat badan ramping — naikin ajah ke AI fit dulu.', 'S'),
        rv('Bella K.', 5, '2026-09-22', 'Pengiriman cepat, packing rapi. Semua info ukuran akurat.', 'XL'),
      ],
    },
    {
      sku_id: 'TSHIRT-BOXY-BONE-005', category: 'T-Shirt',
      name: 'Heavyweight Boxy T-Shirt', variant: '05 Bone',
      price: 449000, compare_at_price: 0, image: 'assets/tee-bone.svg',
      fabric_specs: FABRIC_TEE, cut_ease: { chest: -2, shoulder: 1 },
      sizes: SIZES_TEE, stock: { S: 9, M: 11, L: 12, XL: 6, XXL: 2 },
      sold: 842,
      reviews: [
        rv('Sinta M.', 5, '2026-10-14', 'Warna bone-nya warm banget, cocok untuk outfit netral.', 'M'),
        rv('Fajar R.', 4, '2026-10-02', 'Nyaman dipakai harian. Sedikit kusut setelah cuci tapi besok sendiri lagi.', 'L'),
        rv('Nadia P.', 5, '2026-09-27', 'Kualitas jahitan rapi, bandel.', 'S'),
      ],
    },
    {
      sku_id: 'TSHIRT-CREW-SLATE-006', category: 'T-Shirt',
      name: 'Crew Neck Essential Tee', variant: '06 Slate',
      price: 379000, compare_at_price: 429000, image: 'assets/tee-slate.svg',
      fabric_specs: { material: 'Supima Cotton 30s · 220 GSM', stretch_factor: 1.05, shrinkage_after_wash_pct: 1.5 },
      cut_ease: { chest: -1, shoulder: 0 },
      sizes: SIZES_TEE, stock: { S: 15, M: 20, L: 18, XL: 9, XXL: 4 },
      sold: 2015,
      reviews: [
        rv('Gilang F.', 5, '2026-10-16', 'Tee tipis tapi tidak transparan, pas buat iklim Indonesia.', 'M'),
        rv('Ayu L.', 4, '2026-10-05', 'Harga segini dapat Supima, worth it.', 'L'),
      ],
    },
    {
      sku_id: 'LSLEEVE-RIBS-INK-007', category: 'Longsleeve',
      name: 'Ribbed Longsleeve Base', variant: '07 Ink',
      price: 499000, compare_at_price: 0, image: 'assets/ls-ink.svg',
      fabric_specs: { material: 'Rib Cotton 2×2 · 280 GSM', stretch_factor: 1.12, shrinkage_after_wash_pct: 2.0 },
      cut_ease: { chest: -3, shoulder: 0 },
      sizes: SIZES_TEE, stock: { S: 7, M: 12, L: 10, XL: 5, XXL: 0 },
      sold: 634,
      reviews: [
        rv('Reza Q.', 5, '2026-10-12', 'Ribnya elastis, mantap buat layering.', 'L'),
        rv('Mega T.', 4, '2026-09-29', 'Panjang lengan pas di pergelangan. Size chart akurat.', 'M'),
        rv('Ivan W.', 5, '2026-09-18', 'Beli dua, warnanya konsisten.', 'XL'),
      ],
    },
    {
      sku_id: 'HOODIE-HEAVY-CARBON-008', category: 'Hoodie',
      name: 'Heavyweight Zip Hoodie', variant: '08 Carbon',
      price: 749000, compare_at_price: 899000, image: 'assets/hoodie-carbon.svg',
      fabric_specs: FABRIC_HEAVY, cut_ease: { chest: 0, shoulder: 2 },
      sizes: SIZES_LONG, stock: { S: 4, M: 8, L: 11, XL: 6, XXL: 2 },
      sold: 967,
      reviews: [
        rv('Bram S.', 5, '2026-10-15', '480 GSM serius hangat, heading-nya kokoh tidak melar.', 'L'),
        rv('Citra N.', 5, '2026-10-01', 'Kantong kanguru dalamnya bisa HP besar. Detail!', 'M'),
        rv('Dimas E.', 4, '2026-09-25', 'Agak berat untuk dibawa traveling, tapi kualitas top.', 'XL'),
      ],
    },
    {
      sku_id: 'HOODIE-HEAVY-MOSS-009', category: 'Hoodie',
      name: 'Heavyweight Pullover Hoodie', variant: '09 Moss',
      price: 749000, compare_at_price: 0, image: 'assets/hoodie-moss.svg',
      fabric_specs: FABRIC_HEAVY, cut_ease: { chest: 0, shoulder: 2 },
      sizes: SIZES_LONG, stock: { S: 3, M: 6, L: 9, XL: 4, XXL: 0 },
      sold: 511,
      reviews: [
        rv('Kevin J.', 5, '2026-10-09', 'Warna moss kalem, mudah dipadukan.', 'L'),
        rv('Sari D.', 4, '2026-09-21', 'Ukurannya agak oversized — cek rekomendasi AI sebelum beli.', 'S'),
      ],
    },
    {
      sku_id: 'SHIRT-OVS-ECRU-010', category: 'Kemeja',
      name: 'Oversized Camp Collar Shirt', variant: '10 Ecru',
      price: 659000, compare_at_price: 749000, image: 'assets/shirt-ecru.svg',
      fabric_specs: FABRIC_SHIRT, cut_ease: { chest: 1, shoulder: 1 },
      sizes: SIZES_LONG, stock: { S: 5, M: 9, L: 8, XL: 4, XXL: 1 },
      sold: 723,
      reviews: [
        rv('Tio H.', 5, '2026-10-13', 'Tencel-nya jatuh elegan, tidak kaku. Office-casual approved.', 'M'),
        rv('Vina G.', 5, '2026-09-28', 'Kancing jahitan kuat, warna sesuai foto.', 'L'),
      ],
    },
    {
      sku_id: 'SHIRT-OVS-INDIGO-011', category: 'Kemeja',
      name: 'Oversized Camp Collar Shirt', variant: '11 Indigo',
      price: 659000, compare_at_price: 0, image: 'assets/shirt-indigo.svg',
      fabric_specs: FABRIC_SHIRT, cut_ease: { chest: 1, shoulder: 1 },
      sizes: SIZES_LONG, stock: { S: 4, M: 7, L: 10, XL: 5, XXL: 0 },
      sold: 389,
      reviews: [
        rv('Arga Z.', 4, '2026-10-07', 'Indigo tua mewah. Sedikit kusut dari box, setrika ringan langsung rapi.', 'L'),
        rv('Nino V.', 5, '2026-09-24', 'Potongan oversize-nya pas, tidak swallow.', 'M'),
      ],
    },
  ];

  /** Ringkasan rating dinamis (bibit + ulasan pengguna ditambahkan aplikasi). */
  function summarize(reviews) {
    const count = reviews.length + 900 + Math.floor(Math.random() * 0); // bobot "pembeli lain" stabil
    const avg = reviews.reduce((a, r) => a + r.rating, 0) / Math.max(1, reviews.length);
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => { dist[r.rating] += 1; });
    return { avg: Math.round(avg * 10) / 10, count: 900 + reviews.length * 3, dist };
  }

  const byId = (sku) => CATALOG.find((p) => p.sku_id === sku);
  const CATEGORIES = ['Semua', ...Array.from(new Set(CATALOG.map((p) => p.category)))];

  global.AURA_CATALOG = CATALOG;
  global.AuraCatalog = { byId, categories: CATEGORIES, summarize };
  global.AURA_PRODUCT = CATALOG[0]; // kompatibel dengan spec deck
})(typeof window !== 'undefined' ? window : globalThis);
