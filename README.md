# Aura Atelier — AI Fit Architecture & Fashion E-Commerce

Aplikasi e-commerce fashion berbasis **AI Size Recommendation** untuk menekan *Return Rate* akibat *sizing uncertainty* hingga **< 10%** dan meningkatkan *Checkout Conversion Rate* (**+25%**).

Repo ini berisi **dua artefak**:

| Artefak | File | Fungsi |
| :-- | :-- | :-- |
| 📱 **Aplikasi (SPA)** | `index.html` | Aplikasi interaktif 1-viewport ponsel: tab SHOP / STUDIO / SAVED / BAG, alur konsultasi → fitting → checkout, keranjang & profil persisten (localStorage), **installable sebagai PWA** (offline-ready). |
| 📄 **Spec Deck** | `spec.html` | Dokumentasi visual 4 layar berdampingan + design system, siap ekspor PDF (buka lalu `Ctrl+P`, aktifkan *Background graphics*). |

---

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
| **Bag · 1 Informasi** | `#/bag` | Item multi-produk + lencana "✓ Rekomendasi AI", voucher `FITPERTAMA`. |
| **Pengiriman · 2** | `#/pengiriman` + `#/alamat` | Form alamat tervalidasi; **ongkir otomatis per zona provinsi** (Jakarta/Jawa/Bali-Nusra) × 3 layanan kurir. |
| **Pembayaran · 3** | `#/pembayaran` | VA / GoPay / **QRIS (kode QR tergenerasi + simulasi scan)** / Kartu Kredit; total final; badge terenkripsi. |
| **Pelacakan** | `#/pesanan/:id` | Timeline 6 tahap maju otomatis (demo 8 dtk), alamat & item per SKU, **micro-survey saat tiba** (feedback loop AI). |
| **Bantuan & Toko** | `#/bantuan` | Profil toko + logo + statistik, jam operasional, kontak (WA/Email/Telepon), **live chat bot**, FAQ, **kebijakan retur/refund 7 hari**, catatan SSL. |
| **Akun** | `#/akun` | Profil, profil fit, alamat (zona), riwayat pesanan berstatus, bantuan, keluar. |

Status (sesi, profil, keranjang, wishlist, alamat, pesanan, ulasan pengguna) tersimpan di `localStorage` dengan kunci `aura.*.v1`. Wishlist (SAVED) & metode bayar termasuk QRIS tersedia sesuai checklist toko online profesional (Jubelio/Youtap). SSL/HTTPS aktif otomatis saat di-host (mis. Vercel/Netlify).

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
