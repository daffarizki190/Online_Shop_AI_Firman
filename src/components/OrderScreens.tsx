import React, { useState } from 'react';
import { prod } from '../data';
import { useApp, STORE, Cloud, fmtIDR, fmtDate, fmtTime, ORDER_STAGES } from '../store';
import { Subbar, EmptyState, IconHeart } from '../ui';

/* ---------------- Saved ---------------- */
export function SavedScreen() {
  const { s, set, goto } = useApp();
  return (
    <section className="screen is-active" id="screen-saved" data-tab="saved" aria-label="Item tersimpan">
      <header className="appbar"><span className="brand brand--sm">SAVED</span></header>
      <div className="screen__body" id="saved-body">
        {s.saved.length === 0 ? (
          <EmptyState icon={<IconHeart />} title="Belum ada item tersimpan"
            desc="Simpan produk favorit dari halaman produk dengan tombol hati.">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => goto('shop')}>Jelajahi Koleksi</button>
          </EmptyState>
        ) : (<>
          {s.saved.map((sku) => {
            const p = prod(sku);
            return (
              <div key={sku} className="saved-item">
                <img src={p.image} alt="" />
                <div>
                  <p className="saved-item__name">{p.name} — {p.variant}</p>
                  <p className="saved-item__meta">{p.category}</p>
                  <p className="saved-item__price">{fmtIDR(p.price)}</p>
                </div>
                <button type="button" className="icon-btn" aria-label="Hapus dari simpanan"
                  onClick={() => { const saved = s.saved.filter((x) => x !== sku); localStorage.setItem(STORE.saved, JSON.stringify(saved)); set({ saved }); }}>✕</button>
              </div>
            );
          })}
          <button type="button" className="btn btn--outline btn--sm btn--block" style={{ marginTop: 8 }} onClick={() => goto('shop')}>Lanjut Belanja</button>
        </>)}
      </div>
    </section>
  );
}

/* ---------------- Pelacakan ---------------- */
export function TrackingScreen() {
  const { s, set, goto, toast } = useApp();
  const o = s.orders.find((x) => x.id === s.param) || s.orders.find((x) => x.id === s.activeOrderId) || s.orders[0];

  if (!o) {
    return (
      <section className="screen is-active screen--sub" id="screen-pesanan" data-tab="bag" aria-label="Pelacakan pesanan">
        <Subbar backTo="akun" title="Pesanan" sub="Pelacakan Pengiriman" />
        <div className="screen__body">
          <EmptyState icon={<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="9" width="19" height="7" rx="2" /><path d="M7 9v3.5M11.5 9v3.5M16 9v3.5" /></svg>}
            title="Belum ada pesanan" desc="Pesanan yang sudah dibayar akan terlacak di sini tahap demi tahap.">
            <button type="button" className="btn btn--outline btn--sm" onClick={() => goto('shop')}>Mulai Belanja</button>
          </EmptyState>
        </div>
      </section>
    );
  }

  const delivered = o.statusIndex === ORDER_STAGES.length - 1;

  const submitFeedback = (value: 'perfect' | 'too_small' | 'too_big') => {
    if (o.feedback) return;
    const orders = s.orders.map((x) => x.id === o.id ? { ...x, feedback: value } : x);
    localStorage.setItem(STORE.orders, JSON.stringify(orders));
    const log = JSON.parse(localStorage.getItem(STORE.feedback) || '[]');
    o.items.forEach((i) => log.push({ order_id: o.id, sku_id: i.sku, size: i.size, ai_recommended: i.verified, feedback: value, at: new Date().toISOString() }));
    localStorage.setItem(STORE.feedback, JSON.stringify(log));
    set({ orders, results: {} });
    toast(value === 'perfect' ? 'Terima kasih! AI berhasil dikalibrasi untuk rekomendasi berikutnya.'
      : 'Tercatat — preferensi ukuran AI Anda telah diperbarui & tukar ukuran gratis segera diproses.');
  };

  return (
    <section className="screen is-active screen--sub" id="screen-pesanan" data-tab="bag" aria-label="Pelacakan pesanan">
      <Subbar backTo="akun" title={`Pesanan ${o.id}`} sub="Pelacakan Pengiriman" />
      <div className="screen__body">
        <div className="track-hero">
          <h3>{delivered ? 'Paket tiba di tujuan 🎉' : ORDER_STAGES[o.statusIndex]}</h3>
          <p>{delivered ? `Diterima di ${o.address.kota} · ${fmtDate(o.at)}` : `Kurir ${o.shipping.label} · zona ${o.shipping.zone} · estimasi ${o.shipping.eta} · simulasi: tahap maju otomatis`}</p>
        </div>

        <p className="label-xs">Status Pengiriman</p>
        <ol className="timeline">
          {ORDER_STAGES.map((stage, i) => {
            const entry = o.timeline.find((x) => x.stage === i);
            const cls = i < o.statusIndex ? 'is-done' : i === o.statusIndex ? 'is-current' : 'is-pending';
            return (
              <li key={stage} className={cls}>
                <span className="tl-dot">{i < o.statusIndex ? '✓' : i === o.statusIndex ? '●' : ''}</span>
                <div><span className="tl-label">{stage}</span>{entry && <span className="tl-time">{fmtTime(entry.at)}</span>}</div>
              </li>
            );
          })}
        </ol>

        <p className="label-xs">Dikirim Ke</p>
        <div className="address-card">
          <div className="address-card__head"><span className="address-card__name">{o.address.nama}</span><span className="address-card__phone">{o.address.phone}</span></div>
          <p className="address-card__body">{o.address.alamat}, {o.address.kota}, {o.address.provinsi} {o.address.kodepos}</p>
        </div>

        <p className="label-xs">Item Pesanan</p>
        {o.items.map((i, k) => {
          const p = prod(i.sku);
          return (
            <div key={k} className="item-mini">
              <img src={p.image} alt="" />
              <div>
                <p className="item-mini__name">{i.name || p.name} · {i.variant || p.variant}</p>
                <p className="item-mini__meta">Size {i.size} × {i.qty}{i.verified && <> · <span className="ai-verified" style={{ fontSize: 9.5, padding: '1px 5px' }}>✓ AI {i.confidence}%</span></>}</p>
              </div>
              <span className="item-mini__price">{fmtIDR((i.price || p.price) * i.qty)}</span>
            </div>
          );
        })}

        <dl className="summary">
          <div><dt>Subtotal</dt><dd>{fmtIDR(o.totals.subtotal)}</dd></div>
          <div><dt>Pengiriman ({o.shipping.label} · {o.shipping.zone || ''})</dt><dd>{fmtIDR(o.totals.shipping)}</dd></div>
          {o.totals.discount > 0 && <div className="is-discount"><dt>Voucher</dt><dd>−{fmtIDR(o.totals.discount)}</dd></div>}
          <div className="is-total"><dt>Dibayar ({o.payLabel})</dt><dd>{fmtIDR(o.totals.total)}</dd></div>
        </dl>

        {delivered && (
          o.feedback ? (
            <div className="survey-thanks"><span>✓</span><span>
              {{ perfect: 'Pas sempurna — terima kasih!', too_small: 'Kekecilan — tukar ukuran gratis diproses.', too_big: 'Kebesaran — tukar ukuran gratis diproses.' }[o.feedback]}
              {' '}Masukan Anda mengkalibrasi AI untuk pembeli berikutnya.</span></div>
          ) : (
            <div className="survey-inline">
              <h4>Paket diterima. Apakah ukurannya pas?</h4>
              <p className="muted-sm" style={{ marginBottom: 10 }}>Jawaban Anda langsung mengkalibrasi model AI untuk pembeli berikutnya.</p>
              <div className="survey-options" style={{ margin: 0 }}>
                <button type="button" className="survey-opt" onClick={() => submitFeedback('too_small')}>Kekecilan</button>
                <button type="button" className="survey-opt survey-opt--good" onClick={() => submitFeedback('perfect')}>Pas Sempurna</button>
                <button type="button" className="survey-opt" onClick={() => submitFeedback('too_big')}>Kebesaran</button>
              </div>
            </div>
          )
        )}
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--outline btn--block" onClick={() => goto('shop')}>Belanja Lagi</button>
      </div>
    </section>
  );
}
