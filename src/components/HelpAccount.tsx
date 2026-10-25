import React, { useState } from 'react';
import { CATALOG } from '../data';
import { useApp, Cloud, STORE, fmtIDR, fmtDate, fmtTime, ORDER_STAGES } from '../store';
import { Subbar } from '../ui';

/* ---------------- Bantuan & Toko + Live Chat ---------------- */
const FAQ = [
  ['Bagaimana cara memilih ukuran yang pas?', ['Gunakan <b>Atelier Consultation</b> (tab Studio) — 30 detik, tanpa meteran.', 'Rekomendasi AI memperhitungkan stretch kain & susut cuci per produk.', 'Pembeli rekomendasi AI dijamin tukar ukuran gratis 7 hari.']],
  ['Berapa ongkir dan lama pengiriman?', ['Ongkir <b>otomatis dihitung dari zona provinsi alamat</b>.', 'Zona Jakarta: mulai Rp 9.000 (Ekonomis 3–5 hari).', 'Ekspres tersedia — estimasi tampil sebelum bayar.']],
  ['Metode pembayaran apa saja yang tersedia?', ['Transfer Bank (Virtual Account), GoPay, <b>QRIS</b>, dan Kartu Kredit.', 'Semua transaksi terenkripsi HTTPS/TLS.']],
  ['Apakah bisa retur atau tukar barang?', ['Tukar ukuran <b>gratis 7 hari</b> untuk pesanan rekomendasi AI.', 'Retur/refund 100% bila barang cacat produksi atau tidak sesuai deskripsi.']],
];

function botReply(q: string) {
  const t = q.toLowerCase();
  if (/(ukuran|size|pas|fit|kecil|besar)/.test(t)) return 'Untuk ukuran paling akurat, coba Atelier Consultation di tab Studio — cukup 30 detik. Rekomendasinya dijamin tukar gratis 7 hari bila kurang pas. 🙂';
  if (/(ongkir|kirim|pengiriman|kurir|estimasi|lama)/.test(t)) return 'Ongkir dihitung otomatis dari zona provinsi alamat Anda: Jakarta mulai Rp 9.000, Jawa mulai Rp 12.000, Bali mulai Rp 18.000. Estimasi tampil di langkah Pengiriman sebelum bayar.';
  if (/(retur|tukar|kembali|refund|rusak)/.test(t)) return 'Bisa! Retur/tukar maksimal 7 hari sejak paket diterima, tag masih terpasang. Tukar ukuran GRATIS bila Anda memakai rekomendasi AI. Ajukan lewat chat ini dengan nomor pesanan ya.';
  if (/(bayar|pembayaran|qris|gopay|transfer|kartu|va)/.test(t)) return 'Metode bayar kami: Virtual Account, GoPay, QRIS (semua e-wallet & m-banking), dan Kartu Kredit — semuanya terenkripsi. Voucher FITPERTAMA berlaku untuk pembelian pertama.';
  if (/(bahan|material|cotton|gsm|kain)/.test(t)) return 'Semua produk memakai kain premium (160–480 GSM) dengan detail gramasi di halaman produk. Susut cuci sudah diperhitungkan AI dalam rekomendasi ukuran.';
  if (/(jam|buka|operasional|tutup)/.test(t)) return 'Jam operasional: Senin–Jumat 09.00–18.00 WIB, Sabtu 09.00–15.00 WIB. Chat di luar jam akan dibalas hari kerja berikutnya.';
  if (/(halo|hai|hi|pagi|siang|sore|malam|assalam)/.test(t)) return 'Halo! 👋 Ada yang bisa dibantu — ukuran, pengiriman, pembayaran, atau retur?';
  if (/(voucher|diskon|promo|murah)/.test(t)) return 'Sedang ada voucher FITPERTAMA — potongan Rp 45.000. Masukkan kodenya di halaman Tas sebelum checkout.';
  return 'Terima kasih pertanyaannya! Untuk bantuan lebih lanjut, tim kami membalas chat ini pada jam operasional (Sen–Jum 09.00–18.00, Sab 09.00–15.00 WIB).';
}

export function HelpScreen() {
  const { goto } = useApp();
  const totalSold = CATALOG.reduce((a, p) => a + p.sold, 0);
  const [chatOpen, setChatOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ who: 'bot' | 'user'; text: string }[]>([
    { who: 'bot', text: 'Halo! Saya asisten Aura Atelier 👋 Tanyakan seputar ukuran, pengiriman, pembayaran, atau retur.' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setInput('');
    setMsgs((m) => [...m, { who: 'user', text: q }]);
    setTyping(true);
    setTimeout(() => { setTyping(false); setMsgs((m) => [...m, { who: 'bot', text: botReply(q) }]); }, 950);
  };

  return (
    <section className="screen is-active" id="screen-bantuan" data-tab="none" aria-label="Bantuan dan profil toko">
      <Subbar backTo="shop" title="Bantuan &amp; Tentang Toko" />
      <div className="screen__body" id="bantuan-body">
        <div className="store-card">
          <img src="assets/icon.svg" alt="Logo Aura Atelier" className="store-card__logo" />
          <div>
            <p className="store-card__name">Aura Atelier</p>
            <p className="store-card__desc">Studio garment lokal — basic wear premium dengan kalibrasi ukuran AI. Berdiri 2024 di Jakarta.</p>
          </div>
        </div>
        <div className="store-stats">
          <div><b>4.9★</b><small>Rating Toko</small></div>
          <div><b>{CATALOG.length}</b><small>Produk Aktif</small></div>
          <div><b>{(totalSold / 1000).toFixed(1)}k</b><small>Terjual</small></div>
        </div>

        <p className="label-xs">Jam Operasional</p>
        <div className="policy-block">
          <ul>
            <li>Senin–Jumat: 09.00–18.00 WIB</li>
            <li>Sabtu: 09.00–15.00 WIB · Minggu/libur: tutup</li>
            <li>Pesanan di atas 15.00 dikemas hari kerja berikutnya</li>
          </ul>
        </div>

        <p className="label-xs">Hubungi Kami</p>
        <div className="contact-grid">
          <button type="button" className="contact-btn" onClick={() => goto('bantuan')}>
            <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13 8l-5 1 1-5a9 9 0 1 1 17-4z" /></svg>WhatsApp
          </button>
          <button type="button" className="contact-btn" onClick={() => goto('bantuan')}>
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>Email
          </button>
          <button type="button" className="contact-btn" onClick={() => goto('bantuan')}>
            <svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a13 13 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>Telepon
          </button>
        </div>
        <button type="button" className="chat-cta" style={{ marginTop: 10 }} onClick={() => setChatOpen(true)}>
          <span className="chat-dot" aria-hidden="true" /> Live Chat — balas &lt; 2 menit
        </button>

        <p className="label-xs">Pertanyaan Umum (FAQ)</p>
        {FAQ.map(([q, ans], i) => (
          <details className="acc" key={i}>
            <summary>{q as string}</summary>
            <div className="policy-block" style={{ border: 0, padding: '10px 0', background: 'transparent' }}>
              <ul>{(ans as string[]).map((x, j) => <li key={j} dangerouslySetInnerHTML={{ __html: x }} />)}</ul>
            </div>
          </details>
        ))}

        <p className="label-xs">Kebijakan Pengembalian &amp; Refund</p>
        <div className="policy-block">
          <h4>Retur, Tukar, Refund — 7 Hari</h4>
          <ul>
            <li><b>Jangka waktu:</b> maksimal 7 hari sejak paket diterima (cek stempel kurir).</li>
            <li><b>Syarat:</b> tag terpasang, belum dicuci/dipakai, kemasan asli utuh.</li>
            <li><b>Tukar ukuran gratis</b> bila Anda memakai rekomendasi AI dan ternyata kurang pas — ongkir tukar kami tanggung.</li>
            <li><b>Refund 100%</b> untuk cacat produksi / salah kirim — uang kembali ke metode pembayaran ≤ 3 hari kerja.</li>
            <li><b>Cara ajukan:</b> Live Chat di halaman ini atau WhatsApp dengan nomor pesanan — tim memproses ≤ 1×24 jam kerja.</li>
            <li>Keamanan data: pembayaran diproses payment gateway tersertifikasi; data kartu tidak pernah disimpan toko.</li>
          </ul>
        </div>
        <p className="fineprint" style={{ marginTop: 12 }}>Transaksi dilindungi enkripsi HTTPS/TLS.</p>
      </div>

      {chatOpen && (
        <div className="chat-overlay" role="dialog" aria-label="Live chat bantuan">
          <header className="chat-head">
            <span className="chat-dot" aria-hidden="true" />
            <div className="chat-head__titles"><strong>Bantuan Aura</strong><small>Online · rata-rata balas &lt; 2 menit</small></div>
            <button type="button" className="icon-btn" aria-label="Tutup chat" onClick={() => setChatOpen(false)}>✕</button>
          </header>
          <div className="chat-list" aria-live="polite">
            {msgs.map((m, i) => <div key={i} className={`chat-msg chat-msg--${m.who}`}>{m.text}</div>)}
            {typing && <div className="chat-msg chat-msg--bot chat-msg--typing">sedang mengetik…</div>}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input className="control" placeholder="Tulis pertanyaan Anda…" aria-label="Pesan" value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="btn btn--dark btn--sm">Kirim</button>
          </form>
        </div>
      )}
    </section>
  );
}

/* ---------------- Akun ---------------- */
export function AccountScreen() {
  const { s, set, goto, toast } = useApp();
  const u = s.auth!;
  const isAdmin = u.role === 'admin';
  const a = s.address;

  return (
    <section className="screen is-active" id="screen-akun" data-tab="none" aria-label="Akun saya">
      <Subbar backTo="shop" title="Akun Saya" />
      <div className="screen__body" id="akun-body">
        <div className="acct-card">
          <span className="acct-card__avatar">{(u.name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '–'}</span>
          <div>
            <p className="acct-card__name">{u.name}{isAdmin && <span className="admin-badge">ADMIN</span>}</p>
            <p className="acct-card__meta">{u.email} · {u.phone || ''}</p>
            <span className={`cloud-chip${Cloud.token ? '' : ' cloud-chip--off'}`}>{Cloud.token ? '☁ Tersinkron di semua perangkat' : 'Data tersimpan di perangkat ini'}</span>
          </div>
        </div>

        {isAdmin && (
          <button type="button" className="chat-cta" style={{ marginTop: 12 }} onClick={() => goto('admin')}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
            Buka Panel Admin
          </button>
        )}

        <div className="acct-group">
          <button type="button" className="acct-row" onClick={() => goto('studio')}>
            <span><span className="acct-row__label">Profil Fit (AI)</span>
              <span className="acct-row__val">{s.profile ? `${s.profile.metrics.height_cm} cm / ${s.profile.metrics.weight_kg} kg · ${({ tight: 'Terpotong', regular: 'Reguler', oversized: 'Longgar' } as Record<string, string>)[s.profile.fit_preference]}` : 'Belum diisi — coba konsultasi 30 detik'}</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="acct-row" onClick={() => { set({ addressReturn: 'akun' }); goto('alamat'); }}>
            <span><span className="acct-row__label">Alamat Pengiriman</span>
              <span className="acct-row__val">{a ? `${a.kota}, ${a.provinsi} · zona ${({ 'DKI Jakarta': 'Jakarta' } as Record<string, string>)[a.provinsi] || 'Jawa'}` : 'Tambah alamat utama'}</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
          <button type="button" className="acct-row" onClick={() => goto('bantuan')}>
            <span><span className="acct-row__label">Bantuan &amp; Kebijakan</span>
              <span className="acct-row__val">FAQ, retur &amp; refund, live chat, profil toko</span></span>
            <span className="chev" aria-hidden="true">›</span>
          </button>
        </div>

        <p className="label-xs">Riwayat Pesanan</p>
        {s.orders.length ? s.orders.map((o) => {
          const done = o.statusIndex === 5;
          return (
            <button key={o.id} type="button" className="order-row" onClick={() => goto('pesanan/' + o.id)}>
              <span className="order-row__id">{o.id}</span>
              <span className="order-row__date">{fmtDate(o.at)} · {fmtTime(o.at)} · {o.items.reduce((x, i) => x + i.qty, 0)} item</span>
              <span className="order-row__right">
                <span className={`status-chip ${done ? 'status-chip--done' : 'status-chip--progress'}`}>{done ? 'Tiba' : ORDER_STAGES[o.statusIndex]}</span>
                <span className="order-row__total">{fmtIDR(o.totals.total)} <span className="order-row__chev" aria-hidden="true">›</span></span>
              </span>
            </button>
          );
        }) : <p className="muted-sm" style={{ padding: '8px 2px 16px' }}>Belum ada pesanan — riwayat muncul setelah pembayaran.</p>}

        <button type="button" className="btn btn--danger btn--block" style={{ marginTop: 18 }}
          onClick={() => {
            Cloud.setToken(null);
            localStorage.setItem(STORE.auth, 'null');
            set({ auth: null, authMode: 'login' });
            toast('Anda keluar. Profil & keranjang tetap tersimpan di perangkat ini.');
            goto('login');
          }}>Keluar</button>
      </div>
    </section>
  );
}
