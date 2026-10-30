import React, { useState } from 'react';
import { prod } from '../data';
import { useApp, STORE, Cloud, fmtIDR, fmtK, getShipOptions, VOUCHERS, PAYMENTS, PROVINSI, KOTA_BY_PROV } from '../store';
import { Stepper, Subbar, EmptyState, IconBag } from '../ui';

/* ---------------- Bag (langkah 1) ---------------- */
export function BagScreen() {
  const { s, set, goto, toast, persistBagPrefs } = useApp();
  const [vInput, setVInput] = useState('');
  const count = s.cart.reduce((a, i) => a + i.qty, 0);
  const subtotal = s.cart.reduce((a, i) => a + i.qty * prod(i.sku).price, 0);
  const discount = s.voucher ? Math.min(s.voucher.amount, subtotal) : 0;

  if (!count) {
    return (
      <section className="screen is-active" id="screen-bag" data-tab="bag" aria-label="Tas belanja">
        <header className="appbar"><span className="brand brand--sm">ATELIER BAG</span><span className="mono-muted">0 item</span></header>
        <Stepper active={1} />
        <div className="screen__body">
          <EmptyState icon={<IconBag />} title="Tas masih kosong"
            desc={<>Ukuran hasil rekomendasi AI otomatis mendapat lencana terverifikasi &amp; jaminan tukar gratis.</>}>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => goto('shop')}>Lihat Koleksi</button>
          </EmptyState>
        </div>
        <div className="screen__cta"><button type="button" className="btn btn--dark btn--block" disabled>Tas Masih Kosong</button></div>
      </section>
    );
  }
  const anyVerified = s.cart.some((i) => i.verified);

  return (
    <section className="screen is-active" id="screen-bag" data-tab="bag" aria-label="Tas belanja">
      <header className="appbar"><span className="brand brand--sm">ATELIER BAG</span><span className="mono-muted">{count} item</span></header>
      <Stepper active={1} />
      <div className="screen__body">
        <div className="guarantee"><span aria-hidden="true">🛡</span>
          <span><b>Jaminan Ukuran Pas:</b> {anyVerified ? 'profil fit tersimpan — tukar ukuran gratis bila tidak pas.' : 'pakai rekomendasi AI agar mendapat tukar ukuran gratis.'}</span>
        </div>
        <ul className="cart-list">
          {s.cart.map((i, idx) => {
            const p = prod(i.sku);
            return (
              <li key={i.sku + i.size} className="cart-item">
                <img src={p.image} alt="" />
                <div>
                  <p className="cart-item__name">{p.name} — {p.variant}</p>
                  <p className="cart-item__meta">{p.category} · Size {i.size}</p>
                  {i.verified ? <span className="ai-verified">✓ Rekomendasi AI · {i.confidence}%</span> : <span className="ai-unverified">Belum diverifikasi AI</span>}
                  <div className="cart-item__foot">
                    <span className="cart-item__price">{fmtIDR(p.price * i.qty)}</span>
                    <span className="stepper" role="group">
                      <button type="button" aria-label="Kurangi" onClick={() => {
                        const cart = s.cart.map((x, j) => j === idx ? { ...x, qty: x.qty - 1 } : x).filter((x) => x.qty > 0);
                        localStorage.setItem(STORE.cart, JSON.stringify(cart)); set({ cart });
                      }}>−</button>
                      <span>{i.qty}</span>
                      <button type="button" aria-label="Tambah" onClick={() => {
                        const cart = s.cart.map((x, j) => j === idx ? { ...x, qty: x.qty + 1 } : x);
                        localStorage.setItem(STORE.cart, JSON.stringify(cart)); set({ cart });
                      }}>+</button>
                    </span>
                  </div>
                  <button type="button" className="link-btn cart-item__remove" onClick={() => {
                    const cart = s.cart.filter((_, j) => j !== idx);
                    localStorage.setItem(STORE.cart, JSON.stringify(cart));
                    set({ cart }); toast(`Size ${i.size} dihapus dari tas.`);
                  }}>Hapus</button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="label-xs">Voucher</p>
        {s.voucher ? (
          <div className="voucher-applied"><span>{s.voucher.code} · −{fmtIDR(s.voucher.amount)}</span>
            <button type="button" className="link-btn" style={{ color: 'var(--ok)' }} onClick={() => { set({ voucher: null }); persistBagPrefs(); }}>Hapus</button>
          </div>
        ) : (
          <>
            <div className="voucher-row">
              <input type="text" placeholder="Kode voucher" aria-label="Kode voucher" value={vInput}
                onChange={(e) => setVInput(e.target.value)} />
              <button type="button" className="btn btn--outline btn--sm" onClick={() => {
                const code = vInput.trim().toUpperCase();
                if (VOUCHERS[code]) {
                  set({ voucher: { code, amount: VOUCHERS[code] }, voucherError: '' });
                  persistBagPrefs();
                  toast(`Voucher ${code} terpasang — potongan ${fmtIDR(VOUCHERS[code])}.`);
                } else set({ voucher: null, voucherError: 'Kode tidak valid atau kedaluwarsa.' });
              }}>Pasang</button>
            </div>
            {s.voucherError ? <p className="voucher-error">{s.voucherError}</p>
              : <p className="fineprint" style={{ marginTop: 6 }}>Coba <b>FITPERTAMA</b> — potongan Rp 45.000.</p>}
          </>
        )}

        <dl className="summary">
          <div><dt>Subtotal ({count} item)</dt><dd>{fmtIDR(subtotal)}</dd></div>
          {discount > 0 && <div className="is-discount"><dt>Voucher {s.voucher!.code}</dt><dd>−{fmtIDR(discount)}</dd></div>}
        </dl>
        <p className="fineprint">Ongkir dihitung otomatis dari zona alamat di langkah berikutnya.</p>
        <div style={{ textAlign: 'center', padding: '6px 0 2px' }}>
          <button type="button" className="link-btn" onClick={() => goto('shop')}>+ Lanjut lihat koleksi lain</button>
        </div>
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" onClick={() => goto('pengiriman')}>Lanjut ke Pengiriman →</button>
      </div>
    </section>
  );
}

/* ---------------- Pengiriman (langkah 2) ---------------- */
export function ShippingScreen() {
  const { s, set, goto, persistBagPrefs } = useApp();
  const opts = getShipOptions(s.address?.provinsi);
  if (s.cart.length === 0 && s.route === 'pengiriman') { goto('bag'); return null; }
  const a = s.address;

  return (
    <section className="screen is-active screen--sub" id="screen-pengiriman" data-tab="bag" aria-label="Pengiriman">
      <Subbar backTo="bag" title="Pengiriman" sub="Langkah 2 dari 3" />
      <Stepper active={2} />
      <div className="screen__body">
        <p className="label-xs">Alamat Tujuan</p>
        {a ? (
          <div className="address-card">
            <div className="address-card__head"><span className="address-card__name">{a.nama}</span><span className="address-card__phone">{a.phone}</span></div>
            <p className="address-card__body">{a.alamat}, {a.kota}, {a.provinsi} {a.kodepos}{a.catatan && <><br /><span className="fineprint">Catatan kurir: {a.catatan}</span></>}</p>
            <button type="button" className="link-btn" style={{ marginTop: 8 }} onClick={() => goto('alamat')}>Ubah alamat</button>
          </div>
        ) : (
          <div className="address-card address-card--empty">
            <p>Alamat belum diisi — tambahkan agar ongkir dihitung otomatis.</p>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => goto('alamat')}>Tambah Alamat</button>
          </div>
        )}

        <p className="label-xs">Pilih Pengiriman <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>· {opts[0].zone}{a ? '' : ' (perkiraan)'}</span></p>
        {opts.map((o) => (
          <label key={o.id} className="opt-row">
            <input type="radio" name="ship" checked={s.shippingId === o.id} onChange={() => { set({ shippingId: o.id }); persistBagPrefs(); }} />
            <span className="opt-row__main"><span className="opt-row__label">{o.label}</span><span className="opt-row__sub">{o.eta} · terlacak</span></span>
            <span className="opt-row__price">{fmtIDR(o.cost)}</span>
          </label>
        ))}
        <p className="fineprint">Ongkir <b>dihitung otomatis</b> dari zona provinsi alamat — berubah saat alamat diubah.</p>
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" disabled={!a} onClick={() => a && goto('pembayaran')}>
          {a ? 'Lanjut ke Pembayaran →' : 'Isi Alamat Dulu'}
        </button>
      </div>
    </section>
  );
}

/* ---------------- Alamat ---------------- */
export function AddressScreen() {
  const { s, set, goto, toast } = useApp();
  const a = s.address;
  const [f, setF] = useState({
    nama: a?.nama || s.auth?.name || '', phone: a?.phone || s.auth?.phone || '',
    provinsi: a?.provinsi || '', kota: a?.kota || '', alamat: a?.alamat || '',
    kodepos: a?.kodepos || '', catatan: a?.catatan || '',
  });
  const [bad, setBad] = useState<string | null>(null);
  const kotaList = KOTA_BY_PROV[f.provinsi] || [];

  const saveAddr = () => {
    let err: [string, string] | null = null;
    if (f.nama.trim().length < 3) err = ['nama', 'Nama penerima minimal 3 karakter.'];
    else if (f.phone.replace(/\D/g, '').length < 9) err = ['phone', 'No. HP tidak valid (min. 9 digit).'];
    else if (!f.provinsi) err = ['provinsi', 'Pilih provinsi.'];
    else if (!f.kota) err = ['kota', 'Pilih kota / kabupaten.'];
    else if (f.alamat.trim().length < 10) err = ['alamat', 'Alamat lengkap minimal 10 karakter.'];
    else if (!/^\d{5}$/.test(f.kodepos)) err = ['kodepos', 'Kode pos harus 5 digit.'];
    if (err) { setBad(err[0]); return toast(err[1]); }
    const provChanged = a && a.provinsi !== f.provinsi;
    localStorage.setItem(STORE.address, JSON.stringify(f));
    set({ address: f });
    toast(`Alamat tersimpan${provChanged ? ` — ongkir zona ${getShipOptions(f.provinsi)[0].zone} diterapkan.` : '.'}`);
    goto(s.addressReturn || 'pengiriman');
  };

  const ff = (key: keyof typeof f, label: React.ReactNode, el: React.ReactNode) => (
    <div className={`ff${bad === key ? ' ff--error' : ''}`}><label>{label}</label>{el}</div>
  );

  return (
    <section className="screen is-active screen--sub" id="screen-alamat" data-tab="bag" aria-label="Alamat pengiriman">
      <Subbar backTo={s.addressReturn || 'pengiriman'} title="Alamat Pengiriman" />
      <div className="screen__body">
        {ff('nama', 'Nama Penerima', <input className="control" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Nama di paket" />)}
        {ff('phone', 'No. HP Penerima', <input className="control" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="08xx xxxx xxxx" />)}
        {ff('provinsi', <>Provinsi <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(menentukan zona ongkir)</span></>, (
          <select className="control" value={f.provinsi} onChange={(e) => { setF({ ...f, provinsi: e.target.value, kota: '' }); setBad(null); }}>
            <option value="">— Pilih provinsi —</option>
            {PROVINSI.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ))}
        {ff('kota', 'Kota / Kabupaten', (
          <select className="control" value={f.kota} onChange={(e) => { setF({ ...f, kota: e.target.value }); setBad(null); }}>
            <option value="">{kotaList.length ? '— Pilih kota —' : '— Pilih provinsi dulu —'}</option>
            {kotaList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        ))}
        {ff('alamat', 'Alamat Lengkap', <textarea className="control" value={f.alamat} onChange={(e) => setF({ ...f, alamat: e.target.value })} placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan" />)}
        {ff('kodepos', 'Kode Pos', <input className="control" inputMode="numeric" maxLength={5} value={f.kodepos} onChange={(e) => setF({ ...f, kodepos: e.target.value })} placeholder="5 digit" />)}
        {ff('catatan', <>Catatan untuk Kurir <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opsional)</span></>, <input className="control" value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} placeholder="cth. titip ke satpam blok A" />)}
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" onClick={saveAddr}>Simpan Alamat</button>
      </div>
    </section>
  );
}

/* ---------------- Pembayaran (langkah 3) + QRIS ---------------- */
function qrSvg(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rand = () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
  const N = 21, C = 8;
  const finder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  let cells = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (finder(r, c) || (r >= 9 && r <= 11 && c >= 9 && c <= 11)) continue;
    if (rand() < 0.46) cells += `<rect x="${c * C}" y="${r * C}" width="${C}" height="${C}"/>`;
  }
  const fp = (x: number, y: number) => `<rect x="${x}" y="${y}" width="${7 * C}" height="${7 * C}"/><rect x="${x + C}" y="${y + C}" width="${5 * C}" height="${5 * C}" fill="#fff"/><rect x="${x + 2 * C}" y="${y + 2 * C}" width="${3 * C}" height="${3 * C}"/>`;
  return `<svg viewBox="0 0 ${N * C} ${N * C}" width="184" height="184" fill="#121212">${fp(0, 0)}${fp((N - 7) * C, 0)}${fp(0, (N - 7) * C)}${cells}<rect x="${9 * C}" y="${9 * C}" width="${3 * C}" height="${3 * C}" fill="#B84A28"/></svg>`;
}

export function PaymentScreen() {
  const { s, set, goto, toast, cartTotals, completeOrder } = useApp();
  const t = cartTotals();
  const a = s.address!;
  if (s.cart.length === 0) { goto('bag'); return null; }
  if (!a) { toast('Isi alamat pengiriman dulu sebelum membayar.'); goto('pengiriman'); return null; }
  const label = Object.fromEntries(PAYMENTS)[s.payMethod];

  const pay = () => {
    if (s.paying) return;
    set({ paying: true });
    if (s.payMethod === 'qris') {
      set({ sheet: 'qris' } as any);
      setTimeout(() => { set({ sheet: null }); completeOrder('QRIS'); }, 3200);
    } else {
      setTimeout(() => completeOrder(label), 1100);
    }
  };

  return (
    <section className="screen is-active screen--sub" id="screen-pembayaran" data-tab="bag" aria-label="Pembayaran">
      <Subbar backTo="pengiriman" title="Pembayaran" sub="Langkah 3 dari 3" />
      <Stepper active={3} />
      <div className="screen__body">
        <p className="label-xs">Ringkasan</p>
        <div className="address-card">
          <p className="address-card__body"><b>{a.nama}</b> · {a.phone}<br />{a.alamat}, {a.kota}, {a.provinsi} {a.kodepos}</p>
          <div className="row-between" style={{ marginTop: 8 }}>
            <span className="fineprint">Kurir {t.ship.label} · {t.ship.eta} · {t.ship.zone}</span>
            <button type="button" className="link-btn" onClick={() => goto('pengiriman')}>Ubah</button>
          </div>
        </div>

        <p className="label-xs">Metode Pembayaran</p>
        {PAYMENTS.map(([v, l, sub]) => (
          <label key={v} className="opt-row">
            <input type="radio" name="pay" checked={s.payMethod === v} onChange={() => set({ payMethod: v })} />
            <span className="opt-row__main"><span className="opt-row__label">{l}</span><span className="opt-row__sub">{sub}</span></span>
          </label>
        ))}

        <dl className="summary">
          <div><dt>Subtotal ({s.cart.reduce((x, i) => x + i.qty, 0)} item)</dt><dd>{fmtIDR(t.subtotal)}</dd></div>
          <div><dt>Pengiriman ({t.ship.label} · {t.ship.zone})</dt><dd>{fmtIDR(t.shipping)}</dd></div>
          {t.discount > 0 && <div className="is-discount"><dt>Voucher {s.voucher?.code}</dt><dd>−{fmtIDR(t.discount)}</dd></div>}
          <div className="is-total"><dt>Total Tagihan</dt><dd>{fmtIDR(t.total)}</dd></div>
        </dl>
        <div className="trust-badges"><span>Tukar Ukuran 7 Hari</span><span>100% Original</span><span>Terenkripsi HTTPS/TLS</span></div>
        <p className="fineprint">Metode terpilih: <b>{label}</b> · koneksi aman &amp; terenkripsi.</p>
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" disabled={s.paying} onClick={pay}>
          {s.paying ? 'Memproses Pembayaran…' : `Bayar • ${fmtIDR(t.total)}`}
        </button>
      </div>

      {s.sheet === 'qris' && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) set({ sheet: null }); }}>
          <div className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="bottom-sheet__grip" aria-hidden="true" />
            <h4>Pindai QRIS untuk Bayar</h4>
            <p className="mono-muted">QRIS · {fmtIDR(t.total)}</p>
            <div className="qr-mount" dangerouslySetInnerHTML={{ __html: qrSvg('AURA-' + Date.now()) }} />
            <p className="fineprint">Buka aplikasi e-wallet / m-banking → Scan QRIS. Simulasi: otomatis terbayar ±3 detik.</p>
          </div>
        </div>
      )}
    </section>
  );
}
