# Aura Atelier — AI Fit Architecture & Fashion E-Commerce

🔗 **Live:** [online-shop-ai-firman.vercel.app](https://online-shop-ai-firman.vercel.app) · **Repo:** [github.com/daffarizki190/Online_Shop_AI_Firman](https://github.com/daffarizki190/Online_Shop_AI_Firman) — setiap push ke `main` otomatis deploy via Vercel.

Aplikasi e-commerce fashion berbasis **AI Size Recommendation** untuk menekan *Return Rate* akibat *sizing uncertainty* hingga **< 10%** dan meningkatkan *Checkout Conversion Rate* (**+25%**).

Repo ini berisi **dua artefak**:

| Artefak | File | Fungsi |
| :-- | :-- | :-- |
| 📱 **Aplikasi (SPA)** | `index.html` | Aplikasi interaktif 1-viewport ponsel: tab SHOP / STUDIO / SAVED / BAG, alur konsultasi → fitting → checkout, keranjang & profil persisten (localStorage), **installable sebagai PWA** (offline-ready). |
| 📄 **Spec Deck** | `spec.html` | Dokumentasi visual 4 layar berdampingan + design system, siap ekspor PDF (buka lalu `Ctrl+P`, aktifkan *Background graphics*). |

---

## 🖼️ Gambar Produk

Gambar katalog adalah **ilustrasi flat-lay premium** yang di-generate dari [`tools/generate-product-images.mjs`](tools/generate-product-images.mjs) (warna, lipatan, jahitan, kerah rib, bayangan — satu gaya konsisten). Untuk memakai **foto asli**: siapkan foto produk rasio 3:4 (≤300 KB), lalu timpa file di `assets/` dengan **nama yang sama** (mis. `assets/hoodie-moss.jpg` → ganti referensi di `js/data.js` atau konversi ke SVG container) — tanpa ubah kode lain. Regenerasi ilustrasi: `node tools/generate-product-images.mjs`.

## 🧪 QC Menyeluruh

```bash
npm run qc                          # uji 98 titik terhadap situs live
npm run qc -- http://localhost:4173 # uji terhadap server lokal
```

Suite di `qc/run-qc.mjs` mencakup: aset statis (21 file), struktur HTML 14 layar, fungsi kode & router, API database (health/auth/orders/reviews/profile), keamanan (token palsu, 401/409/400, isolasi antar-akun, sandi tidak bocor), CORS, ukuran/waktu respons, dan aksesibilitas dasar. Laporan terakhir: [`qc/LAPORAN-QC.md`](qc/LAPORAN-QC.md) — **98/98 lulus**.

## 🚀 Menjalankan Aplikasi

```bash
node server.js
# → buka http://localhost:4173
```

Server statis tanpa dependensi (`server.js`). Dek spesifikasi ada di `http://localhost:4173/spec.html`.

### Install sebagai aplikasi di ponsel (PWA)
1. Buka `http://localhost:4173` dari browser ponsel (atau host-kan di HTTPS, mis. `netsh interface portproxy` / tunnel).
2. Menu browser → **"Tambahkan ke layar utama" / "Install App"**.
3. Aplikasi terbuka fullscreen (standalone) dengan ikon sendiri dan tetap jalan offline berkat service worker.

---

## 📱 Alur Aplikasi (Login → Pengiriman, satu set lengkap)

| Tahap | Rute | Komponen Kunci |
| :-- | :-- | :-- |
| **Login / Daftar** | `#/login` | Gerbang aplikasi (guard router). Tab Masuk/Daftar, validasi, akun demo `demo@aura.id` / `123456`, sesi persisten. |
| **Katalog** | `#/shop` | 8 produk 4 kategori (T-Shirt, Longsleeve, Hoodie, Kemeja). **Pencarian + autocomplete**, chip kategori, sort (terlaris/harga/rating), kartu produk berbintang + badge "AI: Size X" per produk. |
| **PDP per produk** | `#/produk/:sku` | Galeri + **zoom foto (ketuk 2×)**, stok & gramasi, size selector berbadge AI, kartu Atelier, **ulasan & rating** (ringkasan, breakdown bintang, tulis ulasan), produk serupa, ringkasan retur. |
| **Studio → Fitting** | `#/studio` → `#/fitting` | Konsultasi 30 dtk, rekomendasi per SKU (heatmap, zona, tabel kelonggaran). |
| **Cermin AI (Try-On)** | `#/cermin` | **Virtual try-on via kamera**: pose tracking MediaPipe (100% on-device, privasi), pakaian diposisikan mengikuti bahu secara live, estimasi lebar bahu dari kamera dicek ke size terpilih, ganti size real-time, ambil foto hasil. Fallback tanpa kamera/model tetap jalan. |
| **Bag · 1 Informasi** | `#/bag` | Item multi-produk + lencana "✓ Rekomendasi AI", voucher `FITPERTAMA`. |
| **Pengiriman · 2** | `#/pengiriman` + `#/alamat` | Form alamat tervalidasi; **ongkir otomatis per zona provinsi** (Jakarta/Jawa/Bali-Nusra) × 3 layanan kurir. |
| **Pembayaran · 3** | `#/pembayaran` | VA / GoPay / **QRIS (kode QR tergenerasi + simulasi scan)** / Kartu Kredit; total final; badge terenkripsi. |
| **Pelacakan** | `#/pesanan/:id` | Timeline 6 tahap maju otomatis (demo 8 dtk), alamat & item per SKU, **micro-survey saat tiba** (feedback loop AI). |
| **Bantuan & Toko** | `#/bantuan` | Profil toko + logo + statistik, jam operasional, kontak (WA/Email/Telepon), **live chat bot**, FAQ, **kebijakan retur/refund 7 hari**, catatan SSL. |
| **Akun** | `#/akun` | Profil, profil fit, alamat (zona), riwayat pesanan berstatus, bantuan, keluar. |

## 🗄️ Database & API (Vercel)

Data pengguna tersimpan di **Vercel Blob** (`aura-db`, akses privat OIDC) lewat **serverless API** di folder `api/` — sehingga **terbagi lintas perangkat** (mode hybrid: otomatis fallback ke localStorage saat offline):

| Endpoint | Fungsi |
| :-- | :-- |
| `GET /api/health` | Cek koneksi DB (roundtrip tulis-baca) |
| `POST /api/auth` | Register/login — sandi di-hash **scrypt**, sesi token HMAC (`AUTH_SECRET`) |
| `GET/POST /api/orders` | Riwayat pesanan per akun (upsert by id, sinkron otomatis setelah bayar) |
| `GET/POST /api/reviews` | Ulasan pengguna per SKU — tampil untuk semua pembeli |
| `GET/PUT /api/profile` | Profil fit (skema `user_body_profiles`) — ikut pindah perangkat |

Skema key Blob: `user:<email>`, `orders:<email>`, `reviews:<sku>`, `profile:<email>`. Katalog produk tetap statis di `js/data.js` (konten, bukan data pengguna).

### 🛠️ Panel Admin

Login dengan akun admin (`ADMIN_EMAIL` / `ADMIN_PASS` di Vercel env; demo: `admin@aura.id` / `AuraAdmin2026`) → halaman **Akun** memuncukkan tombol **Buka Panel Admin** (`#/admin`, terproteksi role — user biasa ditolak 403):

- **Ringkasan toko**: pendapatan, jumlah pesanan, item terjual, pengguna, ulasan, rating rata-rata (agregat seluruh DB).
- **Kelola pesanan**: daftar pesanan semua pembeli + **ubah status pengiriman** (6 tahap) langsung tersimpan ke DB pembeli.
- **Moderasi ulasan**: hapus ulasan pengguna dari produk mana pun.
- **Daftar pengguna** terdaftar.

Endpoint: `GET /api/admin/overview`, `POST /api/admin` (`action: order | review-del`) — wajib token admin.

Status (sesi, profil, keranjang, wishlist, alamat) tetap ada di `localStorage` (`aura.*.v1`) sebagai cache offline. SSL/HTTPS aktif otomatis di Vercel.

---

## 🧠 Arsitektur

```
Project_OnlineShopAI_Firman/
├── index.html              # APLIKASI (SPA 5 layar + tabbar + bottom sheets)
├── spec.html               # Spec deck 4 layar (eksport PDF)
├── manifest.webmanifest    # Manifest PWA
├── sw.js                   # Service worker (offline cache)
├── server.js               # Server statis lokal (tanpa dependensi)
├── css/
│   ├── app.css             # Design system "Warm Atelier" untuk aplikasi
│   └── styles.css          # Stylesheet spec deck
├── js/
│   ├── app.js              # Controller aplikasi (router hash + state)
│   ├── spec.js             # Controller spec deck
│   ├── data.js             # Mock SKU (skema garment_size_specs) — shared
│   └── size-engine.js      # Rule engine rekomendasi ukuran — shared, DOM-free
└── assets/
    ├── boxy-tee-noir.jpg
    └── icon*.svg           # Ikon PWA
```

### Algoritma Rule Engine AI Sizing (`js/size-engine.js`)
1. **Body Metric Estimator** — estimasi lingkar dada/pinggang/pinggul/bahu dari TB, BB, usia, gender, dan bentuk postur (termasuk *oval*).
2. **Garment Calibration** — dimensi efektif garmen setelah susut cuci & stretch kain.
3. **Normalized Quadratic Zone Penalty** — penalti per zona (dada/bahu/panjang); "kekecilan" dihukum 1,4× lebih berat.
4. **Confidence Score** — 0–100 + status heatmap per zona (Ketat/Pas/Longgar).

Modul ini bebas DOM sehingga mudah di-port ke backend (NestJS/Go). Skema basis data (PostgreSQL) terdokumentasi di riwayat blueprint: `garment_size_specs`, `user_body_profiles`, `sizing_feedback_loop`.

---

## 🎨 Design System: "Warm Atelier"

- **Surface:** Off-White `#FAF9F6` · **Teks:** Charcoal `#121212` / `#3A3A3F`
- **Border tipis** `1px solid #E4E4E7` — tanpa drop shadow, radius 6–8px
- **Aksen:** Terracotta `#B84A28`
- **Status fit:** Pas `#2F6B4F`/`#CFE5D8` · Agak ketat `#B84A28`/`#F1C9BA` · Agak longgar `#9A7420`/`#F0E0B4`
- **Tipografi:** Playfair Display (judul editorial) + Plus Jakarta Sans (UI) + JetBrains Mono (metrik teknis)
- Tanpa gradasi neon, tanpa efek glowing, tanpa gimmick sci-fi — indikator fit membumi (bar & heatmap datar).
