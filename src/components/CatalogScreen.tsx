import React, { useMemo, useState } from 'react';
import { CATALOG, CATEGORIES, prod, summarize } from '../data';
import { useApp, fmtIDR, fmtK } from '../store';
import { Stars, IconSearch, IconHeart, IconBag } from '../ui';
import type { Product } from '../types';

function searchable(p: Product) {
  return (p.name + ' ' + p.variant + ' ' + p.category + ' ' + p.keywords.join(' ')).toLowerCase();
}

export default function CatalogScreen() {
  const { s, set, goto, ensureResult } = useApp();
  const [acOpen, setAcOpen] = useState(false);
  const q = s.search.q.trim().toLowerCase();

  const list = useMemo(() => {
    let l = CATALOG.filter((p) => {
      const catOk = s.search.cat === 'Semua' || p.category === s.search.cat;
      const qOk = !q || searchable(p).includes(q);
      return catOk && qOk;
    });
    const avg = (p: Product) => summarize([...p.reviews, ...(s.remoteReviews[p.sku_id] || []), ...(s.userReviews[p.sku_id] || [])]).avg;
    const sort = s.search.sort;
    if (sort === 'asc') l = [...l].sort((a, b) => a.price - b.price);
    if (sort === 'desc') l = [...l].sort((a, b) => b.price - a.price);
    if (sort === 'rating') l = [...l].sort((a, b) => avg(b) - avg(a));
    if (sort === 'pop') l = [...l].sort((a, b) => b.sold - a.sold);
    return l;
  }, [s.search, s.remoteReviews, s.userReviews, q]);

  const matches = q ? CATALOG.filter((p) => searchable(p).includes(q)).slice(0, 5) : [];
  const badge = (p: Product) => {
    const r = s.profile ? ensureResult(p.sku_id) : null;
    if (r) {
      const label = r.isBestOutOfStock && r.bestInStock ? r.bestInStock.size_label : r.best.size_label;
      return <span className="prod-card__badge prod-card__badge--ai">AI: {label}</span>;
    }
    if (p.compare_at_price > p.price) return <span className="prod-card__badge">Promo</span>;
    return null;
  };

  return (
    <section className="screen is-active" id="screen-shop" data-tab="shop" aria-label="Katalog">
      <header className="appbar">
        <div className="brand-wrap">
          <img src="assets/icon.svg" alt="" className="brand-logo" />
          <span className="brand">AURA ATELIER</span>
        </div>
        <div className="appbar__actions">
          <button type="button" className="icon-btn" aria-label="Bantuan" onClick={() => goto('bantuan')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8" /><circle cx="12" cy="16.6" r="0.5" /></svg>
          </button>
          <button type="button" className="icon-btn" aria-label="Item tersimpan" onClick={() => goto('saved')}>
            <IconHeart />
            <span className="badge" hidden={s.saved.length === 0}>{s.saved.length}</span>
          </button>
          <button type="button" className="icon-btn" aria-label="Tas belanja" onClick={() => goto('bag')}>
            <IconBag />
            <span className="badge" hidden={s.cart.reduce((a, i) => a + i.qty, 0) === 0}>{s.cart.reduce((a, i) => a + i.qty, 0)}</span>
          </button>
          <button type="button" className="avatar-btn" aria-label="Akun saya" onClick={() => goto('akun')}>
            <span>{(s.auth?.name || '–').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '–'}</span>
          </button>
        </div>
      </header>

      <div className="search-zone">
        <div className="searchbar">
          <IconSearch />
          <input id="search-input" type="search" placeholder="Cari: kaos, hoodie, kemeja…" autoComplete="off" aria-label="Cari produk"
            value={s.search.q}
            onChange={(e) => { set({ search: { ...s.search, q: e.target.value } }); setAcOpen(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setAcOpen(false); } }} />
          <button type="button" className="icon-btn icon-btn--sm" hidden={!q} aria-label="Hapus pencarian"
            onClick={() => set({ search: { ...s.search, q: '' } })}>✕</button>
        </div>
        {acOpen && q && matches.length > 0 && (
          <div className="autocomplete" id="autocomplete">
            {matches.map((p) => (
              <button key={p.sku_id} type="button" className="ac-item" onClick={() => { setAcOpen(false); goto('produk/' + p.sku_id); }}>
                <img src={p.image} alt="" />
                <span><span className="ac-item__name">{p.name} — {p.variant}</span><br />
                  <span className="ac-item__cat">{p.category} · Terjual {p.sold.toLocaleString('id-ID')}</span></span>
                <span className="ac-item__price">{fmtK(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chip-row" id="category-chips" role="tablist" aria-label="Kategori">
        {CATEGORIES.map((c) => (
          <button key={c} type="button" className="cat-chip" role="tab" aria-selected={s.search.cat === c}
            onClick={() => set({ search: { ...s.search, cat: c } })}>{c}</button>
        ))}
      </div>

      <div className="sort-row">
        <span className="mono-muted" id="catalog-count">{list.length} produk</span>
        <select id="sort-select" className="control control--sm" aria-label="Urutkan katalog"
          value={s.search.sort} onChange={(e) => set({ search: { ...s.search, sort: e.target.value } })}>
          <option value="pop">Terlaris</option>
          <option value="asc">Harga terendah</option>
          <option value="desc">Harga tertinggi</option>
          <option value="rating">Rating tertinggi</option>
        </select>
      </div>

      <div className="screen__body">
        {list.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__art"><IconSearch /></div>
            <p className="serif-sm">Tidak ada produk yang cocok</p>
            <p className="muted-sm">Coba kata kunci populer:</p>
            <div className="chip-row" style={{ justifyContent: 'center', padding: '4px 16px 8px', flexWrap: 'wrap' }}>
              {['kaos', 'hoodie', 'kemeja', 'baju'].map((k) => (
                <button key={k} type="button" className="cat-chip" onClick={() => set({ search: { ...s.search, q: k } })}>{k[0].toUpperCase() + k.slice(1)}</button>
              ))}
            </div>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => set({ search: { q: '', cat: 'Semua', sort: 'pop' } })}>Reset Pencarian</button>
          </div>
        )}
        <div className="catalog-grid" id="catalog-grid">
          {list.map((p) => {
            const sum = summarize([...p.reviews, ...(s.remoteReviews[p.sku_id] || []), ...(s.userReviews[p.sku_id] || [])]);
            return (
              <button key={p.sku_id} type="button" className="prod-card" onClick={() => goto('produk/' + p.sku_id)}>
                <span className="prod-card__media">
                  <img src={p.image} alt={`${p.name} ${p.variant}`} loading="lazy" />
                  {badge(p)}
                </span>
                <span className="prod-card__info">
                  <span className="prod-card__name">{p.name} — {p.variant}</span>
                  <span className="prod-card__meta"><Stars avg={sum.avg} cls="stars--sm" /> <small className="mono-muted">{sum.avg}</small></span>
                  <span className="prod-card__price">{fmtIDR(p.price)}
                    {p.compare_at_price > p.price && (<><s>{fmtK(p.compare_at_price)}</s>
                      <span className="pdp-discount">−{Math.round((1 - p.price / p.compare_at_price) * 100)}%</span></>)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="fineprint" style={{ textAlign: 'center', padding: '14px 0 20px' }}>Semua transaksi terenkripsi (HTTPS/TLS) · Garansi keaslian 100%</p>
      </div>
    </section>
  );
}
