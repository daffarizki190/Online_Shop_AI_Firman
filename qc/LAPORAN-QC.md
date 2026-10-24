# Laporan QC Menyeluruh — Aura Atelier

Tanggal: 2026-10-25 · Target: `https://online-shop-ai-firman.vercel.app` · Alat: `node qc/run-qc.mjs` (dapat dijalankan ulang kapan pun)

## Ringkasan

| Kategori | Cakupan | Hasil |
| :-- | :-- | :-- |
| A. Aset statis | 21 file (HTML, CSS, JS, gambar, manifest, SW) | ✓ 21/21 |
| B. HTML shell | Meta, bahasa, 14 layar, elemen kunci (video cermin, chat, sheet QRIS/ulasan, tabbar) | ✓ 27/27 |
| C. Kode | Fungsi kunci (cermin, pesanan, ongkir zona, QRIS, chat bot, cloud sync), router 14 rute, guard, katalog 8 SKU, kompatibilitas spec deck, SW v10 + pengecualian `/api/*` | ✓ 19/19 |
| D. API health | Roundtrip database (tulis→baca) | ✓ 1/1 |
| E. API auth | Tolak email/sandi tidak valid, register→token, duplikat 409, sandi salah 401, login→token, sandi tidak bocor di respons | ✓ 7/7 |
| F. API orders | Tanpa token 401, token palsu 401, simpan pesanan, isolasi antar-akun | ✓ 4/4 |
| G. API reviews | Baca publik, tulis tanpa login 401, validasi rating 1–5, kirim valid, tersimpan & terbaca lintas perangkat | ✓ 5/5 |
| H. API profile | Tanpa token 401, simpan, baca | ✓ 3/3 |
| I. CORS/preflight | OPTIONS 204 + header | ✓ 1/1 |
| J. Performa | app.js 101 KB, app.css 53 KB, TTFB 20 ms, API 386 ms | ✓ 4/4 |
| K. Aksesibilitas | :focus-visible, aria/role, aria-live, noscript | ✓ 4/4 |
| **Total QC otomatis** | | **✓ 98/98 LULUS** |

## Sapuan browser (live)

- **14/14 rute render benar**: login, katalog (8 kartu), PDP (CTA "Coba Dulu" ada), studio, fitting, cermin, saved, bag, pengiriman, pembayaran, alamat, akun, pesanan, bantuan.
- **Guard aktif**: tas kosong → pengiriman/pembayaran dialihkan otomatis ke Bag; sesi baru → layar fitting menampilkan empty state dengan benar.
- **Alur DB** (uji API langsung): register → login → simpan pesanan → baca ulang → ulasan publik lintas perangkat, semuanya lulus dengan proteksi token di setiap endpoint data.

## Temuan & tindakan selama QC

1. ~~5 kegagalan awal~~ — semuanya bug di skrip QC sendiri (pasangan label/teks terbalik + cek 'oval' salah file; bentuk oval ada di `size-engine.js`). Skrip diperbaiki; aplikasi tidak bermasalah.
2. Tidak ditemukan bug aplikasi baru pada sesi ini.

## Rekomendasi lanjutan (bukan blocker)

- Rate-limit endpoint `/api/auth` saat trafik nyata (sekarang terbuka untuk bruteforce di level jaringan).
- Migrasi ke Postgres (Neon) bila data pengguna membesar dan butuh query/agregasi — lapisan `api/_lib.js` sudah disiapkan sebagai titik ganti.
- Uji Cermin AI di berbagai perangkat nyata (kamera & WebGL bervariasi); fallback statis sudah tersedia.
