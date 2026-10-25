#!/usr/bin/env node
/**
 * QC menyeluruh — Aura Atelier (Online_Shop_AI_Firman)
 * -----------------------------------------------------
 * Pakai:  node qc/run-qc.mjs [baseURL]
 *         default baseURL = https://online-shop-ai-firman.vercel.app
 *
 * Cakupan:
 *   A. Aset statis        — semua file inti merespons 200
 *   B. HTML shell         — struktur, meta, 14 layar, elemen kunci
 *   C. Konten kode        — fungsi/fitur kunci ada di app.js/data.js/sw.js
 *   D. API: health        — roundtrip DB
 *   E. API: auth          — register/login/validasi/duplikat + keamanan sandi
 *   F. API: orders        — proteksi token, tulis-baca, isolasi antar-akun
 *   G. API: reviews       — publik baca, proteksi tulis, validasi
 *   H. API: profile       — proteksi token, tulis-baca
 *   I. CORS/preflight     — OPTIONS 204 + header
 *   J. Performa ringan    — ukuran aset & waktu respons
 *   K. Aksesibilitas dasar— focus-visible, aria, lang
 *
 * Keluar: ringkasan PASS/FAIL/WARN per kategori + exit code (0 = semua lulus).
 */

const BASE = (process.argv[2] || 'https://online-shop-ai-firman.vercel.app').replace(/\/$/, '');
const results = [];
let pass = 0, fail = 0, warn = 0;

function record(kategori, nama, status, detail = '') {
  results.push({ kategori, nama, status, detail });
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else warn++;
}

const ok = (k, n, d = '') => record(k, n, 'PASS', d);
const bad = (k, n, d = '') => record(k, n, 'FAIL', d);
const wn = (k, n, d = '') => record(k, n, 'WARN', d);

const t0 = () => performance.now();

const API_TARGET = /localhost|127\.0\.0\.1/.test(BASE) ? 'https://online-shop-ai-firman.vercel.app' : BASE;

async function get(path, opts) {
  const start = t0();
  const target = path.startsWith('/api/') ? API_TARGET : BASE;
  const r = await fetch(target + path, { redirect: 'manual', ...opts });
  return { r, ms: Math.round(t0() - start), body: await r.text().catch(() => '') };
}
async function jget(path, opts) {
  const { r, ms, body } = await get(path, opts);
  let json = null; try { json = JSON.parse(body); } catch { /* bukan json */ }
  return { r, ms, body, json };
}

/* ============ A. Aset statis ============ */
const K = 'A. Aset';
const assets = [
  '/', '/index.html', '/spec.html', '/manifest.webmanifest', '/sw.js',
  '/css/styles.css',
  '/js/data.js', '/js/size-engine.js', '/js/spec.js',
  '/assets/boxy-tee-noir.jpg', '/assets/icon.svg', '/assets/icon-maskable.svg',
  '/assets/tee-bone.svg', '/assets/tee-slate.svg', '/assets/ls-ink.svg',
  '/assets/hoodie-carbon.svg', '/assets/hoodie-moss.svg', '/assets/shirt-ecru.svg', '/assets/shirt-indigo.svg',
];
for (const a of assets) {
  try {
    const { r, ms } = await get(a);
    if (r.status === 200) ok(K, `GET ${a}`, `${ms}ms`);
    else bad(K, `GET ${a}`, `status ${r.status}`);
  } catch (e) { bad(K, `GET ${a}`, String(e.message || e)); }
}

/* ============ B. HTML shell + bundle React ============ */
{
  const K = 'B. HTML+React';
  const { body } = await get('/');
  // temukan bundle dari index.html lalu periksa isi bundle (React merender client-side)
  const jsMatch = body.match(/src="([^"]+\.(?:js))"/);
  const cssMatch = body.match(/href="([^"]+\.(?:css))"/);
  let bundle = '', bundleCss = '';
  if (jsMatch) { const r = await get(jsMatch[1]); bundle = r.body; }
  if (cssMatch) { const r = await get(cssMatch[1]); bundleCss = r.body; }
  const checks = [
    ['<title>Aura Atelier', 'judul halaman'],
    ['lang="id"', 'bahasa id'],
    ['name="viewport"', 'viewport responsif'],
    ['rel="manifest"', 'manifest PWA'],
    ['name="description"', 'meta deskripsi'],
    ['id="root"', 'root React'],
  ];
  for (const [needle, label] of checks) {
    body.includes(needle) ? ok(K, label) : bad(K, label, `tidak menemukan ${needle}`);
  }
  if (!jsMatch) bad(K, 'bundle JS ditemukan', 'index.html tanpa script bundle');
  else ok(K, 'bundle JS ditemukan', jsMatch[1].slice(-24));
  if (bundle) {
    const bundleChecks = [
      ['screen-login', 'layar login (bundle)'],
      ['screen-shop', 'layar katalog (bundle)'],
      ['screen-produk', 'layar PDP (bundle)'],
      ['screen-studio', 'layar studio (bundle)'],
      ['screen-fitting', 'layar fitting (bundle)'],
      ['screen-cermin', 'layar cermin AI (bundle)'],
      ['screen-saved', 'layar saved (bundle)'],
      ['screen-bag', 'layar bag (bundle)'],
      ['screen-pengiriman', 'layar pengiriman (bundle)'],
      ['screen-pembayaran', 'layar pembayaran (bundle)'],
      ['screen-alamat', 'layar alamat (bundle)'],
      ['screen-pesanan', 'layar pelacakan (bundle)'],
      ['screen-bantuan', 'layar bantuan (bundle)'],
      ['screen-akun', 'layar akun (bundle)'],
      ['screen-admin', 'panel admin (bundle)'],
      ['admin-tabbar', 'tab bar admin (bundle)'],
      ['mirror-video', 'video cermin (bundle)'],
      ['Coba Dulu', 'CTA Coba Dulu (bundle)'],
      ['FITPERTAMA', 'voucher (bundle)'],
      ['Zona Jakarta', 'ongkir zona (bundle)'],
      ['chat-overlay', 'overlay live chat (bundle)'],
      ['Tiba di Tujuan', 'tahap pelacakan (bundle)'],
    ];
    for (const [needle, label] of bundleChecks) {
      bundle.includes(needle) ? ok(K, label) : bad(K, label, `tidak ada "${needle}" di bundle`);
    }
  }
  if (bundleCss) {
    bundleCss.includes('tabbar--admin') ? ok(K, 'CSS role admin (bundle)') : bad(K, 'CSS role admin', 'tabbar--admin tidak ada');
    bundleCss.includes('mirror-cta') ? ok(K, 'CSS Coba Dulu (bundle)') : bad(K, 'CSS Coba Dulu', 'mirror-cta tidak ada');
  }
}

/* ============ C. Konten kode ============ */
{
  const K = 'C. Kode';
  const { body: datajs } = await get('/js/data.js');
  const { body: swjs } = await get('/sw.js');
  const idxR = await get('/');
  const jsMatch2 = idxR.body.match(/src="([^"]+\.(?:js))"/);
  const appjs = jsMatch2 ? (await get(jsMatch2[1])).body : '';

  const appChecks = [
    ['Ambil Foto', 'fungsi foto cermin AI'],
    ['Menyiapkan kamera', 'aktifasi kamera cermin'],
    ['Coba Buka Kamera', 'fallback kamera'],
    ['Hasil Cermin AI', 'sheet hasil foto'],
    ['Buka Panel Admin', 'panel admin'],
    ['Pindai QRIS untuk Bayar', 'generator QRIS'],
    ['asisten Aura Atelier', 'chat bot'],
    ['Tersinkron di semua perangkat', 'lapisan cloud'],
    ['"/health"', 'cek kesehatan API (Cloud)'],
    ['Zona Jakarta', 'ongkir zona'],
    ['Tukar ukuran gratis', 'kebijakan retur di UI'],
    ['mirror-cta', 'CTA Coba Dulu'],
    ['Isi alamat pengiriman dulu', 'guard alamat pembayaran'],
    ['Tas Masih Kosong', 'guard keranjang kosong'],
    ['Pas di bahu', 'cek kecocokan bahu di cermin'],
    ['→ AI:', 'saran ukuran AI di cermin'],
  ];
  const routes = ['login','shop','produk','studio','fitting','cermin','saved','bag','pengiriman','pembayaran','alamat','akun','pesanan','bantuan','admin'];
  const routesOk = routes.every(rt => appjs.includes(rt));
  appChecks.push(['__ROUTES__', `router 15 rute inti lengkap (${routes[0]}…${routes.at(-1)})`]);

  for (const [needle, label] of appChecks) {
    if (needle === '__ROUTES__') { routesOk ? ok(K, label) : bad(K, 'router rute', 'rute tidak lengkap'); continue; }
    appjs.includes(needle) ? ok(K, label) : bad(K, label, `tidak menemukan "${needle}"`);
  }

  const skuCount = (datajs.match(/sku_id: '/g) || []).length;
  skuCount === 8 ? ok(K, `katalog 8 SKU (${skuCount})`) : bad(K, 'katalog 8 SKU', String(skuCount));
  datajs.includes("global.AURA_PRODUCT = CATALOG[0]") ? ok(K, 'kompatibilitas spec deck (AURA_PRODUCT)') : bad(K, 'AURA_PRODUCT', 'ekspor hilang');

  const { body: enginejs } = await get('/js/size-engine.js');
  enginejs.includes('oval') ? ok(K, 'bentuk tubuh oval (engine)') : bad(K, 'bentuk oval', 'hilang');

  swjs.includes("url.pathname.startsWith('/api/')") ? ok(K, 'SW mengecualikan /api/*') : bad(K, 'SW api-exclusion', 'belum dikecualikan');
  const v = (swjs.match(/aura-atelier-v(\d+)/) || [])[1];
  v ? ok(K, `versi cache SW v${v}`) : bad(K, 'versi SW', 'tak ditemukan');
}

/* ============ D–I. API ============ */
let token = '';
{
  const rnd = Math.random().toString(36).slice(2, 8);
  const email = `qc-${rnd}@aura.id`;
  const passw = 'qctes123456';

  // D. health
  {
    const K = 'D. API health';
    const { r, json, ms } = await jget('/api/health');
    r.status === 200 && json?.ok === true ? ok(K, 'roundtrip database', `${ms}ms`) : bad(K, 'roundtrip database', JSON.stringify(json).slice(0, 120));
  }

  // E. auth
  {
    const K = 'E. API auth';
    const post = (body) => jget('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    let x = await post({ action: 'register', email: 'bukan-email', pass: passw, name: 'QC Test', phone: '081234567890' });
    x.r.status === 400 ? ok(K, 'tolak email tidak valid') : bad(K, 'email tidak valid', `status ${x.r.status}`);

    x = await post({ action: 'register', email, pass: '123', name: 'QC Test', phone: '081234567890' });
    x.r.status === 400 ? ok(K, 'tolak sandi < 6 karakter') : bad(K, 'sandi pendek', `status ${x.r.status}`);

    x = await post({ action: 'register', email, pass: passw, name: 'QC Test', phone: '081234567890' });
    x.r.status === 200 && x.json?.token ? ok(K, 'register → token sesi') : bad(K, 'register', JSON.stringify(x.json).slice(0, 120));

    x = await post({ action: 'register', email, pass: passw, name: 'QC Test', phone: '081234567890' });
    x.r.status === 409 ? ok(K, 'tolak email duplikat (409)') : bad(K, 'duplikat 409', `status ${x.r.status}`);

    x = await post({ action: 'login', email, pass: 'salahbanget' });
    x.r.status === 401 ? ok(K, 'tolak sandi salah (401)') : bad(K, 'sandi salah', `status ${x.r.status}`);

    x = await post({ action: 'login', email, pass: passw });
    if (x.r.status === 200 && x.json?.token) { token = x.json.token; ok(K, 'login → token sesi'); }
    else bad(K, 'login', JSON.stringify(x.json).slice(0, 120));

    // hash tersimpan, bukan sandi plaintext?
    // (tidak bisa dilihat langsung dari luar — diverifikasi tak ada 'pass' di payload response)
    JSON.stringify(x.json).includes(passw) ? bad(K, 'sandi tidak boleh muncul di respons') : ok(K, 'sandi tidak bocor di respons');
  }

  const authHeaders = { 'content-type': 'application/json', authorization: 'Bearer ' + token };

  // F. orders
  {
    const K = 'F. API orders';
    let x = await jget('/api/orders');
    x.r.status === 401 ? ok(K, 'tanpa token → 401') : bad(K, 'proteksi orders', `status ${x.r.status}`);

    x = await jget('/api/orders', { headers: { authorization: 'Bearer token.palsu.x' } });
    x.r.status === 401 ? ok(K, 'token palsu → 401') : bad(K, 'token palsu', `status ${x.r.status}`);

    const order = { id: 'QC-' + rnd, at: new Date().toISOString(), items: [{ sku: 'TSHIRT-BOXY-NOIR-004', size: 'L', qty: 1 }], totals: { total: 467000 }, statusIndex: 0 };
    x = await jget('/api/orders', { method: 'POST', headers: authHeaders, body: JSON.stringify({ order }) });
    x.r.status === 200 ? ok(K, 'simpan pesanan') : bad(K, 'simpan pesanan', JSON.stringify(x.json).slice(0, 120));

    x = await jget('/api/orders?email=orang.lain@aura.id', { headers: authHeaders });
    const hanyaMilikSendiri = x.r.status === 200 && Array.isArray(x.json.orders) && x.json.orders.every((o) => o.id !== undefined) && x.json.orders.some((o) => o.id === order.id);
    hanyaMilikSendiri ? ok(K, 'isolasi antar-akun (param email diabaikan, token yang berlaku)') : bad(K, 'isolasi akun', JSON.stringify(x.json).slice(0, 120));
  }

  // G. reviews
  {
    const K = 'G. API reviews';
    let x = await jget('/api/reviews?sku=TSHIRT-BOXY-NOIR-004');
    x.r.status === 200 && Array.isArray(x.json.reviews) ? ok(K, 'baca ulasan publik') : bad(K, 'baca ulasan', `status ${x.r.status}`);

    x = await jget('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku: 'X', review: { rating: 5, text: 'ulasan tanpa login tes' } }) });
    x.r.status === 401 ? ok(K, 'tulis tanpa login → 401') : bad(K, 'proteksi tulis', `status ${x.r.status}`);

    x = await jget('/api/reviews', { method: 'POST', headers: authHeaders, body: JSON.stringify({ sku: 'QC-SKU', review: { rating: 9, text: 'rating di luar rentang' } }) });
    x.r.status === 400 ? ok(K, 'tolak rating di luar 1–5') : bad(K, 'validasi rating', `status ${x.r.status}`);

    x = await jget('/api/reviews', { method: 'POST', headers: authHeaders, body: JSON.stringify({ sku: 'QC-SKU', review: { rating: 4, text: `Ulasan QC otomatis ${rnd}`, name: 'QC Bot', size: 'M' } }) });
    x.r.status === 200 && x.json.reviews.length >= 1 ? ok(K, 'kirim ulasan valid') : bad(K, 'kirim ulasan', JSON.stringify(x.json).slice(0, 120));

    x = await jget('/api/reviews?sku=QC-SKU');
    x.json?.reviews?.some((rv) => rv.text.includes(rnd)) ? ok(K, 'ulasan tersimpan & terbaca publik') : bad(K, 'ulasan terbaca', 'tidak ditemukan');
  }

  // H. profile
  {
    const K = 'H. API profile';
    let x = await jget('/api/profile?email=qc@aura.id');
    x.r.status === 401 ? ok(K, 'tanpa token → 401') : bad(K, 'proteksi profile', `status ${x.r.status}`);

    const profile = { profile_name: 'My Fit', gender: 'male', age: 30, metrics: { height_cm: 175, weight_kg: 70 }, fit_preference: 'regular' };
    x = await jget('/api/profile', { method: 'PUT', headers: authHeaders, body: JSON.stringify({ profile }) });
    x.r.status === 200 ? ok(K, 'simpan profil fit') : bad(K, 'simpan profil', JSON.stringify(x.json).slice(0, 120));

    x = await jget('/api/profile', { headers: authHeaders });
    x.json?.profile?.metrics?.height_cm === 175 ? ok(K, 'baca profil fit') : bad(K, 'baca profil', JSON.stringify(x.json).slice(0, 120));
  }

  // I. CORS/preflight
  {
    const K = 'I. CORS';
    const { r, body } = await get('/api/health', { method: 'OPTIONS' });
    r.status === 204 && (r.headers.get('access-control-allow-origin') || '') !== '' ? ok(K, 'preflight OPTIONS 204 + header') : bad(K, 'preflight', `status ${r.status}`);
  }

  // Proteksi panel admin
  {
    const K = 'E2. API admin';
    let x = await jget('/api/admin');
    x.r.status === 403 ? ok(K, 'tanpa token → 403') : bad(K, 'proteksi admin', `status ${x.r.status}`);
    x = await jget('/api/admin', { headers: { authorization: 'Bearer ' + token } });
    x.r.status === 403 ? ok(K, 'token user biasa ditolak → 403') : bad(K, 'non-admin ditolak', `status ${x.r.status}`);
  }
}

/* ============ J. Performa ringan ============ */
{
  const K = 'J. Performa';
  const { body: appjs } = await get('/js/app.js');
  const { body: css } = await get('/css/app.css');
  const kb = (s) => Math.round(Buffer.byteLength(s) / 1024);
  const a = kb(appjs), c = kb(css);
  a < 120 ? ok(K, `ukuran app.js (${a} KB)`) : wn(K, `ukuran app.js (${a} KB)`, 'pertimbangkan pemecahan');
  c < 60 ? ok(K, `ukuran app.css (${c} KB)`) : wn(K, `ukuran app.css (${c} KB)`);

  const { ms } = await get('/');
  ms < 1500 ? ok(K, `TTFB halaman utama (${ms}ms)`) : wn(K, `TTFB (${ms}ms)`, 'fungsi server dingin');
  const { ms: msApi } = await get('/api/health');
  msApi < 2500 ? ok(K, `respons API health (${msApi}ms)`) : wn(K, `respons API (${msApi}ms)`, 'cold start serverless');
}

/* ============ K. Aksesibilitas dasar ============ */
{
  const K = 'K. A11y';
  const idxK = await get('/');
  const cssM = idxK.body.match(/href="([^"]+\.(?:css))"/);
  const { body: css } = cssM ? await get(cssM[1]) : { body: '' };
  css.includes(':focus-visible') ? ok(K, 'gaya fokus keyboard (:focus-visible)') : bad(K, 'focus-visible', 'tidak ada');
  const idxK2 = await get('/');
  const jsM = idxK2.body.match(/src="([^"]+\.(?:js))"/);
  const jsB = jsM ? (await get(jsM[1])).body : '';
  jsB.includes('aria-label') && jsB.includes('role=') ? ok(K, 'atribut aria/role ada (bundle)') : bad(K, 'aria', 'minim');
  jsB.includes('aria-live') ? ok(K, 'aria-live untuk status dinamis (bundle)') : wn(K, 'aria-live', 'tidak ditemukan');
  idxK2.body.includes('noscript') ? ok(K, 'fallback noscript') : bad(K, 'noscript', 'tidak ada');
}

/* ============ Laporan ============ */
console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log(`║  QC MENYELURUH — Aura Atelier                            ║`);
console.log(`║  Target: ${BASE.slice(0, 46).padEnd(46)} ║`);
console.log('╚══════════════════════════════════════════════════════════╝\n');

const kategoris = [...new Set(results.map((r) => r.kategori))];
for (const k of kategoris) {
  console.log(`── ${k} ${'─'.repeat(Math.max(2, 52 - k.length))}`);
  for (const r of results.filter((x) => x.kategori === k)) {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'FAIL' ? '✗' : '⚠';
    console.log(`  ${icon} ${r.nama}${r.detail ? `  — ${r.detail}` : ''}`);
  }
}

const total = pass + fail + warn;
console.log('\n────────────────────────────────────────────────────────────');
console.log(`  HASIL: ${pass}/${total} LULUS · ${fail} GAGAL · ${warn} PERHATIAN`);
console.log('────────────────────────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
