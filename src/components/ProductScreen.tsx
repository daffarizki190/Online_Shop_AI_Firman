import React, { useEffect, useMemo, useState } from 'react';
import { CATALOG, prod, summarize } from '../data';
import { useApp, STORE, Cloud, fmtIDR, fmtK, inStock, esc } from '../store';
import { Stars, Subbar } from '../ui';

export default function ProductScreen() {
  const { s, set, goto, ensureResult, addToCart, toast, fetchRemoteReviews } = useApp();
  const p = prod(s.currentSku);
  const [view, setView] = useState<'a' | 'b' | 'c'>('a');
  const [zoom, setZoom] = useState(false);
  const [zoomBig, setZoomBig] = useState(false);
  const [rating, setRating] = useState(0);
  const [rText, setRText] = useState('');
  const [rName, setRName] = useState('');

  useEffect(() => { fetchRemoteReviews(p.sku_id); }, [p.sku_id]);

  const r = s.profile ? ensureResult(p.sku_id) : null;
  const best = r?.best.size_label ?? null;
  const reviews = useMemo(
    () => [...p.reviews, ...(s.remoteReviews[p.sku_id] || []), ...(s.userReviews[p.sku_id] || [])],
    [p, s.remoteReviews, s.userReviews]
  );
  const sum = summarize(reviews);
  const shown = s.showAllReviews ? reviews : reviews.slice(0, 2);
  const related = CATALOG.filter((x) => x.category === p.category && x.sku_id !== p.sku_id).slice(0, 4);
  const savedNow = s.saved.includes(p.sku_id);

  const submitReview = () => {
    if (!rating) return toast('Pilih rating bintang dulu ya.');
    if (rText.trim().length < 10) return toast('Tulis ulasan minimal 10 karakter.');
    const d = s.reviewDraft;
    const entry = {
      name: rName.trim() || 'Pembeli', rating, date: new Date().toISOString().slice(0, 10), text: rText.trim(),
      size: r?.best.size_label || s.selectedSize || '—', verified: true,
    };
    const userReviews = { ...s.userReviews, [p.sku_id]: [...(s.userReviews[p.sku_id] || []), entry] };
    localStorage.setItem(STORE.reviews, JSON.stringify(userReviews));
    set({ userReviews, sheet: null, showAllReviews: false });
    setRating(0); setRText(''); setRName('');
    toast('Terima kasih! Ulasan Anda tampil di halaman produk.');
    if (Cloud.token) {
      Cloud.call('/reviews', { method: 'POST', body: { sku: p.sku_id, review: entry } })
        .then(({ reviews }: any) => set({ remoteReviews: { ...s.remoteReviews, [p.sku_id]: reviews } }))
        .catch(() => {});
    }
    void d;
  };

  return (
    <section className="screen is-active screen--sub" id="screen-produk" data-tab="shop" aria-label="Detail produk">
      <Subbar backTo="shop" title={p.name} sub={`${p.category} · ${p.variant}`} />
      <div className="screen__body">
        <figure className="pdp-media">
          <img id="pdp-img" className={view === 'a' ? '' : `view-${view}`} src={p.image} alt={`${p.name} ${p.variant}`} width={896} height={1200} onClick={() => setZoom(true)} />
          <span className="pdp-media__gsm">{p.fabric_specs.material.split('·')[1]?.trim() || 'Premium'}</span>
          <figcaption className="pdp-media__live"><i aria-hidden="true" /><span id="live-viewers">{s.viewers}</span> orang melihat · {p.sold.toLocaleString('id-ID')} terjual</figcaption>
        </figure>

        <div className="thumbs" role="group" aria-label="Galeri produk">
          {(['a', 'b', 'c'] as const).map((v, i) => (
            <button key={v} type="button" className={`thumb${view === v ? ' is-active' : ''}`} aria-label={['Tampak utuh', 'Detail bahan', 'Detail jahitan'][i]} onClick={() => setView(v)}>
              <img src={p.image} alt="" />
            </button>
          ))}
        </div>
        <p className="fineprint" style={{ padding: '6px 16px 0' }}>💡 Ketuk foto utama untuk memperbesar (double-tap 2×)</p>

        <div className="pdp-info">
          <p className="eyebrow">{p.category} · Edit {p.variant.split(' ')[0]}</p>
          <h1 className="pdp-title">{p.name} <span className="pdp-variant">— {p.variant}</span></h1>
          <p className="pdp-price">
            <strong>{fmtIDR(p.price)}</strong>{' '}
            {p.compare_at_price > p.price && (<><s>{fmtIDR(p.compare_at_price)}</s>{' '}<span className="pdp-discount">−{Math.round((1 - p.price / p.compare_at_price) * 100)}%</span></>)}
          </p>
          <div className="row-between" style={{ marginBottom: 12 }}>
            <span><Stars avg={sum.avg} /> <span className="mono-muted">{sum.avg.toFixed(1)} · {sum.count.toLocaleString('id-ID')} ulasan</span></span>
            <button type="button" className="link-btn" onClick={() => document.querySelector('.review-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Lihat ulasan</button>
          </div>

          <button type="button" className="mirror-cta" onClick={() => { set({ mirrorSku: p.sku_id, mirrorSize: null }); goto('cermin'); }}>
            <span className="mirror-cta__icon" aria-hidden="true">🪞</span>
            <span className="mirror-cta__text"><strong>Coba Dulu — Cermin AI</strong><small>Kamera jadi cermin · AI menyesuaikan pakaian ke badan &amp; ukuran Anda</small></span>
            <span className="mirror-cta__chev" aria-hidden="true">›</span>
          </button>

          <div className="row-between">
            <span className="label-sm">Pilih Ukuran</span>
            <button type="button" className="link-btn" onClick={() => set({ sheet: 'size-chart' })}>Panduan (cm)</button>
          </div>
          <div className="size-chips" role="radiogroup" aria-label="Pilih ukuran">
            {p.sizes.map((sz) => {
              const l = sz.size_label;
              const dis = !inStock(p.sku_id, l);
              const isBest = best === l;
              const isAltBest = r?.isBestOutOfStock && r?.bestInStock?.size_label === l;
              return (
                <button key={l} type="button" className="size-chip" role="radio" aria-checked={s.selectedSize === l} disabled={dis}
                  onClick={() => set({ selectedSize: l })}>
                  {l}
                  {isBest && !dis && <span className="size-chip__ai">AI</span>}
                  {isBest && dis && <span className="size-chip__ai" style={{ background: '#71716F' }}>AI Habis</span>}
                  {isAltBest && !dis && <span className="size-chip__ai">AI Pas</span>}
                </button>
              );
            })}
          </div>
          <p className="size-note" aria-live="polite">
            {!s.selectedSize ? (
              r ? (
                r.isBestOutOfStock ? (
                  <>Ukuran <b>{best}</b> (pilihan utama) sedang habis stok. AI menyarankan alternatif tersedia: <b>{r.bestInStock?.size_label}</b> ({r.bestInStock?.score}% cocok).</>
                ) : (
                  <>AI merekomendasikan <b>{best}</b> untuk profil Anda ({r.confidence}% cocok).{r.isCalibratedFromFeedback ? ' ✦ Terkalibrasi' : ''}</>
                )
              ) : 'Ragu ukuran? Coba Atelier Consultation di bawah.'
            ) : best && s.selectedSize !== best ? (
              `Perhatian: AI merekomendasikan ${best}. Ukuran ${s.selectedSize} kemungkinan ${p.sizes.findIndex((x) => x.size_label === s.selectedSize) < p.sizes.findIndex((x) => x.size_label === best) ? 'terlalu ketat' : 'terlalu longgar'}.`
            ) : ((p.stock as Record<string, number>)[s.selectedSize] ?? 0) <= 5 ? (
              `Sisa ${(p.stock as Record<string, number>)[s.selectedSize]} pcs untuk ukuran ${s.selectedSize}.`
            ) : (
              `Ukuran ${s.selectedSize} tersedia.`
            )}
          </p>

          <div className="atelier-card">
            {!r ? (<>
              <div className="atelier-card__row">
                <span className="atelier-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></svg></span>
                <div><strong>Cari Ukuran Pas Anda (Cek 30 Detik)</strong><p>Rekomendasi dari pembeli dengan profil serupa.</p></div>
              </div>
              <div className="atelier-card__row">
                <button type="button" className="btn btn--outline btn--sm btn--block" onClick={() => goto('studio')}>Hitung Fit Saya →</button>
              </div>
              <div className="atelier-card__row">
                <button type="button" className="link-btn" onClick={() => { set({ mirrorSku: p.sku_id, mirrorSize: null }); goto('cermin'); }}>🪞 Atau lihat langsung di Cermin AI</button>
              </div>
            </>) : (<>
              <div className="atelier-card__row">
                <span className="atelier-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg></span>
                <div>
                  <strong>
                    {r.isBestOutOfStock && r.bestInStock ? `Pilihan Tersedia: ${r.bestInStock.size_label}` : `Ukuran Anda: ${r.best.size_label}`}{' '}
                    · <span className="atelier-match">{r.confidence}% Cocok</span>
                  </strong>
                  <p>Profil "{s.profile!.profile_name}" · {s.profile!.metrics.height_cm} cm / {s.profile!.metrics.weight_kg} kg</p>
                  {r.isCalibratedFromFeedback && r.feedbackBias?.summaryNote && (
                    <small style={{ display: 'block', color: 'var(--ok)', fontSize: '11px', marginTop: '3px' }}>
                      ✓ {r.feedbackBias.summaryNote}
                    </small>
                  )}
                </div>
              </div>
              <div className="atelier-card__row">
                <button type="button" className="link-btn" onClick={() => goto('studio')}>Ubah profil</button>
                <button type="button" className="link-btn" onClick={() => goto('fitting')}>Lihat detail fit →</button>
              </div>
            </>)}
          </div>

          <details className="acc"><summary>Detail &amp; Bahan</summary>
            <dl>
              <div><dt>Material</dt><dd>{p.fabric_specs.material}</dd></div>
              <div><dt>Stretch factor</dt><dd>{p.fabric_specs.stretch_factor.toFixed(2)} ({Math.round((p.fabric_specs.stretch_factor - 1) * 100)}%)</dd></div>
              <div><dt>Susut setelah cuci</dt><dd>±{p.fabric_specs.shrinkage_after_wash_pct}%</dd></div>
              <div><dt>Potongan</dt><dd>{p.category === 'Hoodie' ? 'Relaxed, drop-shoulder' : p.category === 'Kemeja' ? 'Oversized, camp collar' : 'Boxy, drop-shoulder'}</dd></div>
            </dl>
          </details>
          <details className="acc"><summary>Konstruksi</summary>
            <ul className="acc-list">
              <li>{p.fabric_specs.material}</li>
              <li>Ribbed bound neckline — tidak melar meski sering dipakai</li>
              <li>Double-needle hem bawah &amp; lengan</li>
              <li>Garment-washed — susut stabil ±{p.fabric_specs.shrinkage_after_wash_pct}%</li>
              <li>Dijahit lokal, QC per potongan</li>
            </ul>
          </details>
          <details className="acc"><summary>Pengiriman &amp; Retur</summary>
            <ul className="acc-list">
              <li>Dikemas 1×24 jam · ongkir otomatis mengikuti zona alamat</li>
              <li><b>Tukar ukuran gratis 7 hari</b> untuk rekomendasi AI (garansi pas)</li>
              <li>Refund 100% bila barang cacat/tidak sesuai dalam 7 hari</li>
              <li><button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => goto('bantuan')}>Baca kebijakan lengkap →</button></li>
            </ul>
          </details>
        </div>

        <div className="pdp-info" style={{ paddingTop: 0 }}>
          <p className="label-xs">Ulasan Pembeli ({sum.count.toLocaleString('id-ID')})</p>
          <div className="review-summary">
            <div className="review-summary__avg"><b>{sum.avg.toFixed(1)}</b><Stars avg={sum.avg} /><small>{sum.count.toLocaleString('id-ID')} ulasan</small></div>
            <div className="rv-breakdown">
              {[5, 4, 3, 2, 1].map((n) => {
                const total = reviews.length || 1;
                const pct = Math.round(((sum.dist[n] || 0) / total) * 100);
                return <div key={n} className="rv-breakdown__row"><span>{n}★</span><span className="rv-bar"><span style={{ width: `${pct}%` }} /></span><span>{pct}%</span></div>;
              })}
            </div>
          </div>
          {shown.map((rv, i) => (
            <div key={i} className="rv-item">
              <div className="rv-item__head">
                <span className="rv-item__name">{rv.name}</span>
                <Stars avg={rv.rating} cls="stars--sm" />
                {rv.verified && <span className="rv-verified">✓ Pembeli Terverifikasi</span>}
                <span className="rv-item__date">{new Date(rv.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} · Size {rv.size}</span>
              </div>
              <p className="rv-item__text">"{rv.text}"</p>
            </div>
          ))}
          <div className="row-between" style={{ margin: '12px 0 4px' }}>
            {reviews.length > 2
              ? <button type="button" className="link-btn" onClick={() => set({ showAllReviews: !s.showAllReviews })}>{s.showAllReviews ? 'Sembunyikan' : `Lihat semua (${reviews.length})`}</button>
              : <span />}
            <button type="button" className="link-btn" onClick={() => set({ sheet: 'review', reviewDraft: { sku: p.sku_id, rating: 0 } })}>✍ Tulis ulasan</button>
          </div>
        </div>

        {related.length > 0 && (
          <div className="pdp-info">
            <p className="label-xs">Produk Serupa</p>
            <div className="related-row">
              {related.map((x) => (
                <button key={x.sku_id} type="button" className="related-card" onClick={() => goto('produk/' + x.sku_id)}>
                  <img src={x.image} alt="" loading="lazy" />
                  <p>{x.name}</p>
                  <small>{fmtK(x.price)}</small>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="screen__cta">
        <button type="button" className="icon-btn icon-btn--square" aria-label="Simpan produk" aria-pressed={savedNow}
          onClick={() => {
            const saved = savedNow ? s.saved.filter((x) => x !== p.sku_id) : [...s.saved, p.sku_id];
            localStorage.setItem(STORE.saved, JSON.stringify(saved));
            set({ saved });
            toast(savedNow ? 'Dihapus dari simpanan.' : 'Produk disimpan. Lihat tab SAVED.');
          }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.3 11c-2.3 4.4-9.3 9-9.3 9z" /></svg>
        </button>
        <button type="button" className="btn btn--dark btn--block" disabled={!s.selectedSize}
          onClick={() => s.selectedSize && addToCart(p.sku_id, s.selectedSize)}>
          {s.selectedSize ? `Tambah ke Tas · ${fmtK(p.price)}` : 'Pilih Ukuran Dulu'}
        </button>
      </div>

      {/* Zoom foto */}
      {zoom && (
        <div className="zoom-overlay" role="dialog" aria-label="Zoom foto produk">
          <button type="button" className="icon-btn zoom-close" aria-label="Tutup zoom" onClick={() => setZoom(false)}>✕</button>
          <div className={`zoom-stage${zoomBig ? ' is-zoomed' : ''}`} onDoubleClick={() => setZoomBig(!zoomBig)}
            onClick={(e) => { if ((e.target as HTMLElement).classList.contains('zoom-stage')) setZoom(false); }}>
            <img src={p.image} alt="Perbesaran foto produk" />
          </div>
          <p className="zoom-hint">Ketuk dua kali untuk memperbesar · geser untuk menjelajah detail</p>
        </div>
      )}

      {/* Sheet: size chart */}
      {s.sheet === 'size-chart' && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) set({ sheet: null }); }}>
          <div className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="bottom-sheet__grip" aria-hidden="true" />
            <div className="row-between">
              <h4>Size Chart Matrix (cm)</h4>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Tutup" onClick={() => set({ sheet: null })}>✕</button>
            </div>
            <table className="chart-table">
              <thead><tr><th>Size</th><th>L. Dada</th><th>Panjang</th><th>Bahu</th><th>Lengan</th></tr></thead>
              <tbody>
                {p.sizes.map((sz) => (
                  <tr key={sz.size_label} className={best === sz.size_label ? 'is-rec' : ''}>
                    <td>{sz.size_label}</td><td>{sz.chest_width_cm}</td><td>{sz.body_length_cm}</td><td>{sz.shoulder_width_cm}</td><td>{sz.sleeve_length_cm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fineprint">Diukur flat-lay sebelum pencucian. Susut kain sudah diperhitungkan oleh AI.</p>
          </div>
        </div>
      )}

      {/* Sheet: tulis ulasan */}
      {s.sheet === 'review' && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) set({ sheet: null }); }}>
          <div className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="bottom-sheet__grip" aria-hidden="true" />
            <h4>Tulis Ulasan</h4>
            <p className="mono-muted">{p.name} — {p.variant}</p>
            <p className="label-xs" style={{ marginTop: 12 }}>Rating Anda</p>
            <div className="review-stars" role="radiogroup" aria-label="Pilih rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className={n <= rating ? 'is-on' : ''} aria-label={`${n} bintang`} onClick={() => setRating(n)}>★</button>
              ))}
            </div>
            <p className="label-xs">Ulasan</p>
            <textarea className="control" placeholder="Bagaimana kualitas, ukuran, dan pengirimannya?" value={rText} onChange={(e) => setRText(e.target.value)} />
            <p className="label-xs" style={{ marginTop: 10 }}>Nama <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(opsional)</span></p>
            <input type="text" className="control" placeholder="Nama Anda" value={rName} onChange={(e) => setRName(e.target.value)} />
            <button type="button" className="btn btn--dark btn--block" style={{ marginTop: 14 }} onClick={submitReview}>Kirim Ulasan</button>
          </div>
        </div>
      )}
    </section>
  );
}
