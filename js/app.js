/**
 * Aura Atelier — Aplikasi (SPA) — set lengkap toko online profesional
 * ---------------------------------------------------------------
 * Login/Daftar → Katalog (search + filter kategori + sort) → PDP per produk
 * (zoom foto, ulasan & rating, tulis ulasan, produk serupa) → Studio konsultasi
 * → Fitting AI → Bag → Pengiriman (alamat + ongkir otomatis per zona) →
 * Pembayaran (VA/GoPay/CC/QRIS) → Pelacakan sampai tiba + survey → Akun.
 * Plus: Bantuan & profil toko, live chat, kebijakan retur, wishlist.
 */
(function () {
  'use strict';

  const CATALOG = window.AURA_CATALOG;
  const Cat = window.AuraCatalog;
  const Engine = window.AuraSizeEngine;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const prod = (sku) => Cat.byId(sku) || CATALOG[0];

  /* -------------------------------------------------- konstanta & state */
  const STORE = {
    profile: 'aura.profile.v1',
    cart: 'aura.cart.v1',
    feedback: 'aura.fitFeedback.v1',
    saved: 'aura.saved.v1',
    bagPrefs: 'aura.bagPrefs.v1',
    auth: 'aura.auth.v1',
    users: 'aura.users.v1',
    address: 'aura.address.v1',
    orders: 'aura.orders.v1',
    reviews: 'aura.reviews.v1',
    token: 'aura.token.v1',
  };
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

  /* -------------------------------------------------- lapisan cloud (API + DB)
   * Serverless API di Vercel dengan database Vercel Blob.
   * Mode hybrid: cloud dipakai bila tersedia; gagal/offline → fallback localStorage. */
  const API_BASE = /^localhost|127\.0\.0\.1$/.test(location.hostname)
    ? 'https://online-shop-ai-firman.vercel.app/api'
    : '/api';
  const Cloud = {
    ready: null,
    token: load('aura.token.v1', null),
    async ping(force = false) {
      if (this.ready !== null && !force) return this.ready;
      try {
        const r = await fetch(API_BASE + '/health');
        const j = await r.json();
        this.ready = !!j.ok;
      } catch { this.ready = false; }
      return this.ready;
    },
    setToken(t) { this.token = t; save('aura.token.v1', t); },
    clearToken() { this.token = null; save('aura.token.v1', null); },
    async call(path, { method = 'GET', body } = {}) {
      const r = await fetch(API_BASE + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: 'Bearer ' + this.token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    },
  };

  /** Tarik data pengguna dari DB (pesanan + profil) lalu gabungkan dengan lokal. */
  async function syncPull(email) {
    if (!Cloud.token || !email) return;
    try {
      const { orders } = await Cloud.call('/orders?email=' + encodeURIComponent(email));
      const ids = new Set(state.orders.map((o) => o.id));
      let added = false;
      (orders || []).forEach((o) => { if (o && o.id && !ids.has(o.id)) { state.orders.push(o); added = true; } });
      if (added) {
        state.orders.sort((a, b) => String(b.at).localeCompare(String(a.at)));
        save(STORE.orders, state.orders);
        if (state.route === 'akun') renderAkun();
        if (state.route === 'pesanan') renderPesanan(state.param);
      }
    } catch { /* offline — pakai lokal */ }
    try {
      const { profile } = await Cloud.call('/profile?email=' + encodeURIComponent(email));
      if (profile && !state.profile) {
        state.profile = profile;
        save(STORE.profile, profile);
        applyResultForCurrent();
        writeFormFromProfile(profile);
        if (state.route === 'shop') renderCatalog();
      }
    } catch { /* offline */ }
  }

  /* Ongkir dihitung otomatis per zona provinsi (demo: 3 zona) */
  const SHIP_ZONES = {
    'DKI Jakarta': { label: 'Zona Jakarta', eco: 9000, reg: 15000, exp: 28000, etas: { eco: '3–5 hari', reg: '1–2 hari', exp: 'Hari ini' } },
    'Jawa Barat': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
    'Jawa Tengah': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
    'DI Yogyakarta': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
    'Jawa Timur': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
    'Bali': { label: 'Zona Bali & Nusra', eco: 18000, reg: 26000, exp: 40000, etas: { eco: '5–8 hari', reg: '3–4 hari', exp: '1–2 hari' } },
  };
  const SHIP_META = {
    eco: { id: 'eco', label: 'Ekonomis' },
    reg: { id: 'reg', label: 'Reguler' },
    exp: { id: 'exp', label: 'Ekspres' },
  };
  function getShipOptions(prov) {
    const z = SHIP_ZONES[prov] || SHIP_ZONES['Jawa Barat'];
    return ['eco', 'reg', 'exp'].map((id) => ({ ...SHIP_META[id], cost: z[id], eta: z.etas[id], zone: z.label }));
  }

  const PAYMENTS = [
    ['va', 'Transfer Bank', 'BCA · Virtual Account'],
    ['gopay', 'GoPay', 'Bayar langsung dari aplikasi'],
    ['qris', 'QRIS', 'Scan sekali — semua e-wallet & m-banking'],
    ['cc', 'Kartu Kredit', 'Visa / Mastercard'],
  ];
  const VOUCHERS = { FITPERTAMA: 45000 };

  const PROVINSI = Object.keys(SHIP_ZONES);

  const ORDER_STAGES = ['Pesanan Dibuat', 'Pembayaran Terverifikasi', 'Sedang Dikemas', 'Diserahkan ke Kurir', 'Dalam Perjalanan', 'Tiba di Tujuan'];
  const STAGE_ADVANCE_MS = 8000;

  const SHAPES = [
    { id: 'inverted_triangle', label: 'Segitiga Terbalik', desc: 'Bahu jauh lebih lebar dari pinggul.', path: 'M8 12 Q20 6 32 12 L36 28 L28 58 L12 58 L4 28 Z' },
    { id: 'rectangle', label: 'Persegi', desc: 'Bahu, pinggang, dan pinggul relatif sejajar.', path: 'M12 12 Q20 8 28 12 L29 58 L11 58 Z' },
    { id: 'oval', label: 'Oval', desc: 'Volume terpusat di tengah badan.', path: 'M12 12 Q20 7 28 12 Q34 30 28 48 Q20 60 12 48 Q6 30 12 12 Z' },
    { id: 'hourglass', label: 'Jam Pasir', desc: 'Dada & pinggul seimbang, pinggang terdefinisi.', path: 'M10 12 Q20 7 30 12 L26 30 L31 58 L9 58 L14 30 Z' },
  ];
  const FIT_LABEL = { tight: 'Terpotong', regular: 'Reguler', oversized: 'Longgar' };
  const STATUS_LABEL = { fit: 'Pas', tight: 'Agak Ketat', loose: 'Agak Longgar' };
  const ROUTES = ['login', 'shop', 'produk', 'studio', 'fitting', 'cermin', 'saved', 'bag', 'pengiriman', 'pembayaran', 'alamat', 'akun', 'pesanan', 'bantuan'];
  const DEMO_USER = { name: 'Demo Aura', email: 'demo@aura.id', phone: '0812 0000 0000', pass: '123456' };

  /* Bentuk garmen & warna untuk overlay Cermin AI */
  const MIRROR_SHAPES = {
    tee: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 900 Q448 930 574 900 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 372 356 300 Z',
    hoodie: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 930 Q448 960 574 930 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 396 356 300 Z',
    shirt: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 940 Q448 966 574 940 L574 470 L596 512 L680 470 L628 336 L540 300 L470 330 L426 300 Z',
  };
  const SHAPE_BY_CAT = { 'T-Shirt': 'tee', 'Longsleeve': 'tee', 'Hoodie': 'hoodie', 'Kemeja': 'shirt' };
  const MIRROR_COLORS = {
    '04 Noir': '#1F1F23', '05 Bone': '#E8E2D4', '06 Slate': '#6E7278', '07 Ink': '#26282E',
    '08 Carbon': '#313136', '09 Moss': '#5C6650', '10 Ecru': '#EDE6D6', '11 Indigo': '#3E4668',
  };

  const bagPrefs = load(STORE.bagPrefs, {});
  const state = {
    route: 'login',
    param: null,
    currentSku: CATALOG[0].sku_id,
    selectedSize: null,
    previewSize: null,
    results: {},
    profile: load(STORE.profile, null),
    cart: load(STORE.cart, []),
    saved: load(STORE.saved, []),
    shippingId: bagPrefs.shippingId || 'reg',
    payMethod: bagPrefs.payMethod || 'va',
    voucher: bagPrefs.voucher || null,
    voucherError: '',
    studioStep: 1,
    auth: load(STORE.auth, null),
    authMode: 'login',
    address: load(STORE.address, null),
    orders: load(STORE.orders, []),
    userReviews: load(STORE.reviews, {}),
    addressReturn: 'pengiriman',
    activeOrderId: null,
    search: { q: '', cat: 'Semua', sort: 'pop' },
    showAllReviews: false,
    reviewDraft: { sku: null, rating: 0 },
    chat: [],
    chatOpen: false,
    paying: false,
    mirrorSku: null,
    mirrorSize: null,
    mirror: { on: false, stream: null, raf: 0, landmarker: null, lm: null, lastT: -1, tracking: false },
    remoteReviews: {},
    viewers: 18 + Math.floor(Math.random() * 14),
  };

  /* -------------------------------------------------- util */
  const fmtIDR = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const fmtK = (n) => 'Rp ' + Math.round(n / 1000) + 'k';
  const round1 = (n) => Math.round(n * 10) / 10;
  const inStock = (p, l) => (p.stock[l] ?? 0) > 0;
  const sizeIndex = (p, l) => p.sizes.findIndex((s) => s.size_label === l);
  const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '–';
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const fmtDateLong = (iso) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Baris bintang dengan isi parsial (rating 0–5). */
  function starRow(avg, cls = '') {
    const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
    return `<span class="stars ${cls}" aria-label="Rating ${avg} dari 5"><span class="stars__fill" style="width:${pct}%"></span></span>`;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }

  function bump(el) {
    if (!el) return;
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  /* -------------------------------------------------- hasil fit per SKU */
  function ensureResult(sku) {
    if (!state.profile) return null;
    if (!state.results[sku]) {
      state.results[sku] = Engine.recommend(state.profile, prod(sku));
    }
    return state.results[sku];
  }

  /* -------------------------------------------------- router */
  function goto(path) {
    if (location.hash === '#/' + path) applyRoute();
    else location.hash = '#/' + path;
  }

  function parseHash() {
    const h = (location.hash || '').replace(/^#\//, '');
    const [route, param] = h.split('/');
    return { route: ROUTES.includes(route) ? route : 'shop', param: param || null };
  }

  function applyRoute() {
    let { route, param } = parseHash();
    if (!state.auth && route !== 'login') { location.replace('#/login'); return; }
    if (state.auth && route === 'login') route = 'shop';

    if (state.route === 'cermin' && route !== 'cermin') stopMirror();
    state.route = route;
    state.param = param;

    $$('.screen').forEach((scr) => scr.classList.toggle('is-active', scr.id === 'screen-' + route));
    $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === $('#screen-' + route)?.dataset.tab));
    $('.tabbar').hidden = route === 'login';

    const body = $('#screen-' + route + ' .screen__body');
    if (body) body.scrollTop = 0;
    $('#autocomplete').hidden = true;

    if (route === 'shop') renderCatalog();
    if (route === 'produk') renderPdp(param);
    if (route === 'studio') renderStudio();
    if (route === 'fitting') renderFitting();
    if (route === 'cermin') renderCermin();
    if (route === 'saved') renderSaved();
    if (route === 'bag') renderBag();
    if (route === 'pengiriman') renderPengiriman();
    if (route === 'pembayaran') renderPembayaran();
    if (route === 'alamat') renderAlamat();
    if (route === 'akun') renderAkun();
    if (route === 'pesanan') renderPesanan(param);
    if (route === 'bantuan') renderBantuan();
    if (route === 'login') renderLogin();
    renderBadges();
  }
  window.addEventListener('hashchange', applyRoute);

  /* -------------------------------------------------- KATALOG */
  function catalogData() {
    const q = state.search.q.trim().toLowerCase();
    let list = CATALOG.filter((p) => {
      const catOk = state.search.cat === 'Semua' || p.category === state.search.cat;
      const qOk = !q || (p.name + ' ' + p.variant + ' ' + p.category).toLowerCase().includes(q);
      return catOk && qOk;
    });
    const avg = (p) => Cat.summarize(getReviews(p.sku_id)).avg;
    if (state.search.sort === 'asc') list = [...list].sort((a, b) => a.price - b.price);
    if (state.search.sort === 'desc') list = [...list].sort((a, b) => b.price - a.price);
    if (state.search.sort === 'rating') list = [...list].sort((a, b) => avg(b) - avg(a));
    if (state.search.sort === 'pop') list = [...list].sort((a, b) => b.sold - a.sold);
    return list;
  }

  function renderCatalog() {
    // Chip kategori
    $('#category-chips').innerHTML = Cat.categories.map((c) =>
      `<button type="button" class="cat-chip" role="tab" aria-selected="${state.search.cat === c}" data-cat="${c}">${c}</button>`).join('');

    const list = catalogData();
    $('#catalog-count').textContent = `${list.length} produk`;
    $('#catalog-empty').hidden = list.length > 0;

    $('#catalog-grid').innerHTML = list.map((p) => {
      const s = Cat.summarize(getReviews(p.sku_id));
      const r = state.profile ? ensureResult(p.sku_id) : null;
      const disc = p.compare_at_price > p.price ? `<span class="pdp-discount">−${Math.round((1 - p.price / p.compare_at_price) * 100)}%</span>` : '';
      return `<button type="button" class="prod-card" data-open-sku="${p.sku_id}">
        <span class="prod-card__media">
          <img src="${p.image}" alt="${esc(p.name)} ${esc(p.variant)}" loading="lazy">
          ${r ? `<span class="prod-card__badge prod-card__badge--ai">AI: ${r.best.size_label}</span>` : (p.compare_at_price > p.price ? `<span class="prod-card__badge">Promo</span>` : '')}
        </span>
        <span class="prod-card__info">
          <span class="prod-card__name">${esc(p.name)} — ${esc(p.variant)}</span>
          <span class="prod-card__meta">${starRow(s.avg, 'stars--sm')} <small class="mono-muted">${s.avg}</small></span>
          <span class="prod-card__price">${fmtIDR(p.price)}${p.compare_at_price > p.price ? `<s>${fmtK(p.compare_at_price)}</s>${disc}` : ''}</span>
        </span>
      </button>`;
    }).join('');
  }

  function renderAutocomplete() {
    const q = state.search.q.trim().toLowerCase();
    const box = $('#autocomplete');
    $('#search-clear').hidden = !q;
    if (!q) { box.hidden = true; return; }
    const matches = CATALOG.filter((p) => (p.name + ' ' + p.variant + ' ' + p.category).toLowerCase().includes(q)).slice(0, 5);
    if (!matches.length) { box.hidden = true; return; }
    box.innerHTML = matches.map((p) => `
      <button type="button" class="ac-item" data-open-sku="${p.sku_id}">
        <img src="${p.image}" alt="">
        <span><span class="ac-item__name">${esc(p.name)} — ${esc(p.variant)}</span><br><span class="ac-item__cat">${p.category} · Terjual ${p.sold.toLocaleString('id-ID')}</span></span>
        <span class="ac-item__price">${fmtK(p.price)}</span>
      </button>`).join('');
    box.hidden = false;
  }

  /* -------------------------------------------------- ULASAN */
  function getReviews(sku) {
    const p = prod(sku);
    return (p.reviews || []).concat(state.remoteReviews[sku] || [], state.userReviews[sku] || []);
  }

  /** Ambil ulasan pengguna dari DB sekali per SKU, lalu render ulang bila masih relevan. */
  function fetchRemoteReviews(sku) {
    if (state.remoteReviews[sku]) return;
    Cloud.call('/reviews?sku=' + encodeURIComponent(sku))
      .then(({ reviews }) => {
        state.remoteReviews[sku] = reviews || [];
        if (state.route === 'produk' && state.currentSku === sku) renderPdp(sku);
      })
      .catch(() => { state.remoteReviews[sku] = []; });
  }

  function reviewsBlock(p) {
    const list = getReviews(p.sku_id);
    const s = Cat.summarize(list);
    const shown = state.showAllReviews ? list : list.slice(0, 2);
    return `
      <p class="label-xs">Ulasan Pembeli (${s.count.toLocaleString('id-ID')})</p>
      <div class="review-summary">
        <div class="review-summary__avg"><b>${s.avg.toFixed(1)}</b>${starRow(s.avg)}<small>${s.count.toLocaleString('id-ID')} ulasan</small></div>
        <div class="rv-breakdown">
          ${[5, 4, 3, 2, 1].map((n) => {
            const total = list.length;
            const pct = total ? Math.round(((s.dist[n] || 0) / total) * 100) : 0;
            return `<div class="rv-breakdown__row"><span>${n}★</span><span class="rv-bar"><span style="width:${pct}%"></span></span><span>${pct}%</span></div>`;
          }).join('')}
        </div>
      </div>
      ${shown.map((r) => `
        <div class="rv-item">
          <div class="rv-item__head">
            <span class="rv-item__name">${esc(r.name)}</span>
            ${starRow(r.rating, 'stars--sm')}
            ${r.verified ? '<span class="rv-verified">✓ Pembeli Terverifikasi</span>' : ''}
            <span class="rv-item__date">${fmtDate(r.date)} · Size ${r.size}</span>
          </div>
          <p class="rv-item__text">"${esc(r.text)}"</p>
        </div>`).join('')}
      <div class="row-between" style="margin:12px 0 4px">
        ${list.length > 2 ? `<button type="button" class="link-btn" id="toggle-reviews">${state.showAllReviews ? 'Sembunyikan' : `Lihat semua (${list.length})`}</button>` : '<span></span>'}
        <button type="button" class="link-btn" id="open-review">✍ Tulis ulasan</button>
      </div>`;
  }

  /* -------------------------------------------------- PDP */
  function renderPdp(sku) {
    const p = prod(sku);
    state.currentSku = p.sku_id;
    state.showAllReviews = false;

    $('#produk-title').textContent = p.name;
    $('#produk-cat').textContent = `${p.category} · ${p.variant}`;

    const s = Cat.summarize(getReviews(p.sku_id));
    const r = state.profile ? ensureResult(p.sku_id) : null;
    const best = r?.best.size_label;
    const related = CATALOG.filter((x) => x.category === p.category && x.sku_id !== p.sku_id).slice(0, 4);
    const disc = p.compare_at_price > p.price
      ? `<s>${fmtIDR(p.compare_at_price)}</s> <span class="pdp-discount">−${Math.round((1 - p.price / p.compare_at_price) * 100)}%</span>` : '';

    $('#produk-body').innerHTML = `
      <figure class="pdp-media">
        <img id="pdp-img" src="${p.image}" alt="${esc(p.name)} ${esc(p.variant)}" width="896" height="1200">
        <span class="pdp-media__gsm">${p.fabric_specs.material.split('·')[1]?.trim() || 'Premium'}</span>
        <figcaption class="pdp-media__live"><i aria-hidden="true"></i><span id="live-viewers">${state.viewers}</span> orang melihat · ${p.sold.toLocaleString('id-ID')} terjual</figcaption>
      </figure>

      <div class="thumbs" role="group" aria-label="Galeri produk — ketuk foto untuk zoom">
        <button type="button" class="thumb is-active" data-view="a" aria-label="Tampak utuh"><img src="${p.image}" alt=""></button>
        <button type="button" class="thumb" data-view="b" aria-label="Detail bahan"><img src="${p.image}" alt=""></button>
        <button type="button" class="thumb" data-view="c" aria-label="Detail jahitan"><img src="${p.image}" alt=""></button>
      </div>
      <p class="fineprint" style="padding:6px 16px 0">💡 Ketuk foto utama untuk memperbesar (double-tap 2×)</p>

      <div class="pdp-info">
        <p class="eyebrow">${p.category} · Edit ${p.variant.split(' ')[0]}</p>
        <h1 class="pdp-title">${esc(p.name)} <span class="pdp-variant">— ${esc(p.variant)}</span></h1>
        <p class="pdp-price"><strong>${fmtIDR(p.price)}</strong> ${disc}</p>
        <div class="row-between" style="margin-bottom:12px">
          <span>${starRow(s.avg)} <span class="mono-muted">${s.avg.toFixed(1)} · ${s.count.toLocaleString('id-ID')} ulasan</span></span>
          <button type="button" class="link-btn" data-scroll-reviews>Lihat ulasan</button>
        </div>

        <button type="button" class="mirror-cta" data-mirror data-mirror-sku="${p.sku_id}">
          <span class="mirror-cta__icon" aria-hidden="true">🪞</span>
          <span class="mirror-cta__text"><strong>Coba Dulu — Cermin AI</strong><small>Kamera jadi cermin · AI menyesuaikan pakaian ke badan &amp; ukuran Anda</small></span>
          <span class="mirror-cta__chev" aria-hidden="true">›</span>
        </button>

        <div class="row-between">
          <span class="label-sm">Pilih Ukuran</span>
          <button type="button" class="link-btn" id="open-size-chart">Panduan (cm)</button>
        </div>
        <div class="size-chips" role="radiogroup" aria-label="Pilih ukuran" id="size-chips"></div>
        <p class="size-note" id="size-note" aria-live="polite"></p>

        <div class="atelier-card" id="atelier-card"></div>

        <details class="acc">
          <summary>Detail &amp; Bahan</summary>
          <dl>
            <div><dt>Material</dt><dd>${p.fabric_specs.material}</dd></div>
            <div><dt>Stretch factor</dt><dd>${p.fabric_specs.stretch_factor.toFixed(2)} (${Math.round((p.fabric_specs.stretch_factor - 1) * 100)}%)</dd></div>
            <div><dt>Susut setelah cuci</dt><dd>±${p.fabric_specs.shrinkage_after_wash_pct}%</dd></div>
            <div><dt>Potongan</dt><dd>${p.category === 'Hoodie' ? 'Relaxed, drop-shoulder' : p.category === 'Kemeja' ? 'Oversized, camp collar' : 'Boxy, drop-shoulder'}</dd></div>
          </dl>
        </details>
        <details class="acc">
          <summary>Konstruksi</summary>
          <ul class="acc-list">
            <li>${p.fabric_specs.material}</li>
            <li>Ribbed bound neckline — tidak melar meski sering dipakai</li>
            <li>Double-needle hem bawah &amp; lengan</li>
            <li>Garment-washed — susut stabil ±${p.fabric_specs.shrinkage_after_wash_pct}%</li>
            <li>Dijahit lokal, QC per potongan</li>
          </ul>
        </details>
        <details class="acc">
          <summary>Pengiriman &amp; Retur</summary>
          <ul class="acc-list">
            <li>Dikemas 1×24 jam · ongkir otomatis mengikuti zona alamat</li>
            <li><b>Tukar ukuran gratis 7 hari</b> untuk rekomendasi AI (garansi pas)</li>
            <li>Refund 100% bila barang cacat/tidak sesuai dalam 7 hari</li>
            <li><button type="button" class="link-btn" data-goto="bantuan" style="padding:0">Baca kebijakan lengkap →</button></li>
          </ul>
        </details>
      </div>

      <div class="pdp-info" style="padding-top:0">${reviewsBlock(p)}</div>
      ${'' /* ulasan dari DB dimuat async lalu dirender ulang */}

      ${related.length ? `
      <div class="pdp-info">
        <p class="label-xs">Produk Serupa</p>
        <div class="related-row">
          ${related.map((x) => `
            <button type="button" class="related-card" data-open-sku="${x.sku_id}">
              <img src="${x.image}" alt="" loading="lazy">
              <p>${esc(x.name)}</p>
              <small>${fmtK(x.price)}</small>
            </button>`).join('')}
        </div>
      </div>` : ''}`;

    renderSizesPdp();
    renderAtelierCard();
    updatePdpCta();
    $('#pdp-save').setAttribute('aria-pressed', state.saved.includes(p.sku_id) ? 'true' : 'false');
    fetchRemoteReviews(p.sku_id);
  }

  function renderSizesPdp() {
    const p = prod(state.currentSku);
    const best = state.profile ? ensureResult(p.sku_id)?.best.size_label : null;
    $('#size-chips').innerHTML = p.sizes.map((s) => {
      const l = s.size_label;
      const checked = state.selectedSize === l;
      return `<button type="button" class="size-chip" role="radio" aria-checked="${checked}" data-size="${l}"
        ${inStock(p, l) ? '' : 'disabled aria-label="' + l + ' stok habis"'}>${l}${best === l ? '<span class="size-chip__ai">AI</span>' : ''}</button>`;
    }).join('');

    const note = $('#size-note');
    note.classList.remove('is-warn');
    if (!state.selectedSize) {
      note.textContent = best ? `AI merekomendasikan ${best} untuk profil Anda.` : 'Ragu ukuran? Coba Atelier Consultation di bawah.';
    } else if (best && state.selectedSize !== best) {
      note.textContent = `Perhatian: AI merekomendasikan ${best}. Ukuran ${state.selectedSize} kemungkinan ${sizeIndex(p, state.selectedSize) < sizeIndex(p, best) ? 'terlalu ketat' : 'terlalu longgar'}.`;
      note.classList.add('is-warn');
    } else {
      const stock = p.stock[state.selectedSize];
      note.textContent = stock <= 5 ? `Sisa ${stock} pcs untuk ukuran ${state.selectedSize}.` : `Ukuran ${state.selectedSize} tersedia.`;
    }
  }

  function renderAtelierCard() {
    const card = $('#atelier-card');
    if (!card) return;
    const p = prod(state.currentSku);
    const r = state.profile ? ensureResult(p.sku_id) : null;
    if (!r) {
      card.innerHTML = `
        <div class="atelier-card__row">
          <span class="atelier-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg></span>
          <div><strong>Cari Ukuran Pas Anda (Cek 30 Detik)</strong><p>Rekomendasi dari pembeli dengan profil serupa.</p></div>
        </div>
        <div class="atelier-card__row">
          <button type="button" class="btn btn--outline btn--sm btn--block" data-goto="studio">Hitung Fit Saya →</button>
        </div>
        <div class="atelier-card__row">
          <button type="button" class="link-btn" data-mirror data-mirror-sku="${p.sku_id}">🪞 Atau lihat langsung di Cermin AI</button>
        </div>`;
      return;
    }
    const prof = state.profile;
    card.innerHTML = `
      <div class="atelier-card__row">
        <span class="atelier-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></span>
        <div><strong>Ukuran Anda: ${r.best.size_label} · <span class="atelier-match">${r.confidence}% Cocok</span></strong>
        <p>Profil "${prof.profile_name}" · ${prof.metrics.height_cm} cm / ${prof.metrics.weight_kg} kg · ${FIT_LABEL[prof.fit_preference]}</p></div>
      </div>
      <div class="atelier-card__row">
        <button type="button" class="link-btn" data-goto="studio">Ubah profil</button>
        <button type="button" class="link-btn" data-goto="fitting">Lihat detail fit →</button>
      </div>`;
  }

  function updatePdpCta() {
    const p = prod(state.currentSku);
    const add = $('#pdp-add');
    add.disabled = !state.selectedSize;
    add.textContent = state.selectedSize ? `Tambah ke Tas · ${fmtK(p.price)}` : 'Pilih Ukuran Dulu';
  }

  function renderSizeChart() {
    const p = prod(state.currentSku);
    const best = state.profile ? ensureResult(p.sku_id)?.best.size_label : null;
    $('#size-chart-body').innerHTML = p.sizes.map((s) => `
      <tr class="${best === s.size_label ? 'is-rec' : ''}">
        <td>${s.size_label}</td><td>${s.chest_width_cm}</td><td>${s.body_length_cm}</td><td>${s.shoulder_width_cm}</td><td>${s.sleeve_length_cm}</td>
      </tr>`).join('');
  }

  /* -------------------------------------------------- ZOOM FOTO */
  function openZoom(src) {
    $('#zoom-img').src = src;
    $('#zoom-stage').classList.remove('is-zoomed');
    $('#zoom-overlay').hidden = false;
  }
  function closeZoom() { $('#zoom-overlay').hidden = true; }

  /* -------------------------------------------------- STUDIO */
  function buildShapes() {
    $('#shape-grid').innerHTML = SHAPES.map((s, i) => `
      <label class="shape"><input type="radio" name="shape" value="${s.id}" ${i === 1 ? 'checked' : ''}>
        <span class="shape__box">
          <svg viewBox="0 0 40 64" aria-hidden="true"><circle cx="20" cy="6" r="4"/><path d="${s.path}"/></svg>
          <span class="shape__label">${s.label}</span>
        </span>
      </label>`).join('');
  }

  function updateBmiHint() {
    const h = Number($('#f-height').value) / 100;
    const w = Number($('#f-weight').value);
    if (!h || !w) { $('#bmi-hint').textContent = ''; return; }
    const bmi = w / (h * h);
    $('#bmi-hint').textContent = `IMT ${bmi.toFixed(1)} — membantu AI mengestimasi lingkar dada & pinggang Anda.`;
  }

  function updateShapeDesc() {
    const v = $('input[name="shape"]:checked')?.value;
    $('#shape-desc').textContent = SHAPES.find((s) => s.id === v)?.desc ?? '';
  }

  function renderStudio() {
    $$('.studio-step').forEach((el) => { el.hidden = Number(el.dataset.step) !== state.studioStep; });
    const pct = state.studioStep === 1 ? 50 : 100;
    $('#studio-progress-fill').style.width = pct + '%';
    $('#studio-progress').setAttribute('aria-valuenow', pct);
    $('#studio-step-label').textContent = state.studioStep === 1 ? '01 / 02' : '02 / 02';
    $('#studio-back').hidden = state.studioStep === 1;
    $('#studio-next').textContent = state.studioStep === 1 ? 'Lanjut →' : 'Lihat Rekomendasi →';
    updateBmiHint();
    updateShapeDesc();
  }

  function readStep1() {
    const fields = [['#f-height', 100, 230], ['#f-weight', 30, 200], ['#f-age', 10, 99]];
    let ok = true;
    const out = {};
    fields.forEach(([sel, min, max]) => {
      const input = $(sel);
      const v = Number(input.value);
      const valid = Number.isFinite(v) && v >= min && v <= max;
      input.closest('.field').classList.toggle('field--error', !valid);
      if (!valid) ok = false; else out[sel.slice(2)] = v;
    });
    if (!ok) { toast('Periksa kembali angka yang Anda masukkan.'); return null; }
    out.gender = $('input[name="gender"]:checked').value;
    return out;
  }

  function computeFromForm(f) {
    const now = new Date().toISOString();
    const body = Engine.estimateBody({
      gender: f.gender, height_cm: f.height, weight_kg: f.weight,
      age: f.age, body_shape: f.shape,
    });
    state.profile = {
      user_id: 'usr_demo_001',
      profile_name: 'My Fit',
      gender: f.gender,
      age: f.age,
      input_method: 'questionnaire_v1',
      metrics: { height_cm: f.height, weight_kg: f.weight, body_shape: f.shape, ...body },
      fit_preference: f.fit,
      created_at: state.profile?.created_at ?? now,
      updated_at: now,
    };
    save(STORE.profile, state.profile);
    state.results = {};
    applyResultForCurrent();

    // sinkronkan profil fit ke database (skema user_body_profiles)
    if (Cloud.token && state.auth) {
      Cloud.call('/profile', { method: 'PUT', body: { profile: state.profile } }).catch(() => {});
    }
  }

  function applyResultForCurrent() {
    if (!state.profile) return;
    const r = ensureResult(state.currentSku);
    state.previewSize = r.best.size_label;
    if (!state.selectedSize && inStock(prod(state.currentSku), r.best.size_label)) state.selectedSize = r.best.size_label;
  }

  /* -------------------------------------------------- FITTING */
  const zoneCopy = {
    shoulder: (z) => ({ fit: 'Drop-shoulder jatuh pas', tight: 'Bahu terasa sempit', loose: 'Bahu turun berlebih' }[z.status]),
    chest: (z) => ({ fit: `${z.ease >= 0 ? '+' : ''}${z.ease} cm ruang gerak`, tight: `Hanya ${z.ease} cm ruang gerak`, loose: `+${z.ease} cm, terlalu lapang` }[z.status]),
    length: (z) => ({ fit: 'Jatuh di atas pinggul', tight: 'Cenderung pendek', loose: 'Melewati pinggul' }[z.status]),
  };
  const ZONE_NAME = { shoulder: 'Bahu', chest: 'Dada', length: 'Panjang' };
  const ZONE_TOL = { chest: 3.5, shoulder: 2.5, length: 2.5 };

  function teeSvg(zones) {
    return `
      <svg class="tee-svg" viewBox="0 0 120 112" role="img" aria-label="Peta fit: bahu ${STATUS_LABEL[zones.shoulder.status]}, dada ${STATUS_LABEL[zones.chest.status]}, panjang ${STATUS_LABEL[zones.length.status]}">
        <defs><clipPath id="tee-clip"><path d="M40 8 L20 14 L4 36 L19 47 L27 40 L27 106 L93 106 L93 40 L101 47 L116 36 L100 14 L80 8 Q60 22 40 8 Z"/></clipPath></defs>
        <g clip-path="url(#tee-clip)">
          <rect x="0" y="0" width="120" height="112" fill="#F4F2ED"/>
          <rect class="zone zone--${zones.shoulder.status}" x="0" y="0" width="120" height="30"/>
          <rect class="zone zone--${zones.chest.status}" x="0" y="34" width="120" height="34"/>
          <rect class="zone zone--${zones.length.status}" x="0" y="86" width="120" height="26"/>
        </g>
        <path class="tee-outline" d="M40 8 L20 14 L4 36 L19 47 L27 40 L27 106 L93 106 L93 40 L101 47 L116 36 L100 14 L80 8 Q60 22 40 8 Z"/>
      </svg>`;
  }

  function renderFitting() {
    const p = prod(state.currentSku);
    const body = $('#fitting-body');
    const cta = $('#fitting-cta');
    $('#fitting-prod-label').textContent = `${p.name} — ${p.variant}`;
    const r = state.profile ? ensureResult(p.sku_id) : null;

    if (!r) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg></div>
          <p class="serif-sm">Belum ada profil tubuh</p>
          <p class="muted-sm">Isi konsultasi 30 detik di Studio untuk melihat ukuran tepat &amp; peta fit per zona.</p>
          <button type="button" class="btn btn--outline btn--sm" data-goto="studio">Isi Konsultasi →</button>
        </div>`;
      cta.disabled = true;
      cta.textContent = 'Lengkapi Konsultasi Dulu';
      return;
    }

    const preview = r.ranked.find((x) => x.size_label === state.previewSize) || r.best;
    const isBest = preview.size_label === r.best.size_label;
    const prof = state.profile;
    const shownConf = isBest ? r.confidence : Math.round(preview.score * 0.97);
    const proof = Math.max(72, Math.min(96, r.confidence - 6 + (prof.metrics.height_cm % 5)));
    const prefRatio = Engine.FIT_PREFERENCE_EASE[prof.fit_preference].lengthRatio;
    const idealLength = round1(prof.metrics.height_cm * prefRatio);
    const g = preview.garment;

    const compareRows = [
      { name: 'Lebar Dada', body: prof.metrics.estimated_chest_cm + ' cm', garment: g.chest_circ_cm + ' cm', zone: preview.zones.chest },
      { name: 'Lebar Bahu', body: prof.metrics.estimated_shoulder_cm + ' cm', garment: g.shoulder_cm + ' cm', zone: preview.zones.shoulder },
      { name: 'Panjang', body: idealLength + ' cm', garment: g.length_cm + ' cm', zone: preview.zones.length },
    ];

    const preciseCount = ['chest', 'shoulder', 'length'].filter((k) => preview.zones[k].status === 'fit').length;
    const allFit = preciseCount === 3;

    body.innerHTML = `
      <p class="fitting__eyebrow">${isBest ? 'Hasil Analisis Atelier' : 'Pratinjau Ukuran Lain'}</p>
      <div class="fitting__head">
        <div>
          <div class="fitting__size">${preview.size_label}<small>${isBest ? 'Ukuran Terbaik Anda' : 'Ukuran Dicek'}</small></div>
        </div>
        <div class="ring" role="img" aria-label="Kecocokan ${shownConf} persen">
          <svg viewBox="0 0 62 62" aria-hidden="true">
            <circle class="ring__bg" cx="31" cy="31" r="26"/>
            <circle class="ring__fg ${shownConf < 75 ? 'is-low' : ''}" cx="31" cy="31" r="26" stroke-dasharray="${2 * Math.PI * 26}" stroke-dashoffset="${2 * Math.PI * 26}" data-offset="${2 * Math.PI * 26 * (1 - shownConf / 100)}"/>
          </svg>
          <span class="ring__label"><b>${shownConf}%</b><small>COCOK</small></span>
        </div>
      </div>
      <p class="fitting__sub">${isBest
        ? (allFit ? 'Presisi di 3 titik — potongan jatuh pas di bahu, dada, dan panjang.' : `Presisi di ${preciseCount} dari 3 titik.`)
        : `AI tetap merekomendasikan ${r.best.size_label}.`}</p>
      <span class="method-badge">◎ Kuesioner · ${FIT_LABEL[prof.fit_preference]} · ${SHAPES.find((s) => s.id === prof.metrics.body_shape)?.label ?? '—'}</span>

      <button type="button" class="btn btn--outline btn--sm btn--block" data-mirror data-mirror-sku="${p.sku_id}" style="margin:12px 0 2px">🪞 Coba Cermin AI — lihat pas di badan lewat kamera</button>

      ${isBest ? `<div class="proof"><span class="proof__check">✓</span><span><b>${proof}% pembeli</b> dengan TB ${prof.metrics.height_cm} / BB ${prof.metrics.weight_kg} kg memilih ${r.best.size_label} &amp; tidak mengembalikannya. <span class="mono-muted">(data demo)</span></span></div>` : ''}

      <div class="tee-figure">${teeSvg(preview.zones)}</div>
      <div class="legend">
        <span><i style="background:#CFE5D8"></i>Pas</span>
        <span><i style="background:#F1C9BA"></i>Agak ketat</span>
        <span><i style="background:#F0E0B4"></i>Agak longgar</span>
      </div>

      <p class="label-xs">Tingkat Jatuh Garmen</p>
      ${['shoulder', 'chest', 'length'].map((k) => {
        const z = preview.zones[k];
        const x = Math.max(4, Math.min(96, 50 + (z.diff / ZONE_TOL[k]) * 22));
        return `<div class="zone-row">
          <div class="zone-row__top"><b>${ZONE_NAME[k]}</b><span class="zone-row__status is-${z.status}">${zoneCopy[k](z)}</span></div>
          <div class="zone-bar"><span class="zone-bar__marker is-${z.status}" style="--x:${x}%"></span></div>
          <div class="zone-bar__scale"><span>Ketat</span><span>Pas</span><span>Longgar</span></div>
        </div>`;
      }).join('')}

      <p class="label-xs">Bandingkan Ukuran</p>
      <div class="size-compare">
        ${p.sizes.map((sz) => {
          const sc = r.ranked.find((x) => x.size_label === sz.size_label);
          return `<button type="button" data-preview="${sz.size_label}" aria-pressed="${sz.size_label === preview.size_label}" class="${sz.size_label === r.best.size_label ? 'is-best' : ''}"><b>${sz.size_label}</b><small>${sc.score}%</small></button>`;
        }).join('')}
      </div>

      <p class="label-xs">Ukuran Anda vs Size ${preview.size_label}</p>
      <table class="spec-table">
        <thead><tr><th>Bagian</th><th class="num">Tubuh Anda</th><th class="num">Size ${preview.size_label}</th><th class="num">Kelonggaran</th></tr></thead>
        <tbody>
          ${compareRows.map((row) => `
            <tr>
              <td>${row.name}</td>
              <td class="num">${row.body}</td>
              <td class="num">${row.garment}</td>
              <td class="num"><span class="chip chip--${row.zone.status}">${row.zone.ease >= 0 ? '+' : ''}${row.zone.ease} cm</span></td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div class="construction">
        <h4>Konstruksi</h4>
        <ul>
          <li>${p.fabric_specs.material}</li>
          <li>Ribbed bound neckline, double-needle hem</li>
          <li>Garment-washed — susut stabil ±${p.fabric_specs.shrinkage_after_wash_pct}%</li>
          <li>Stretch kain ${Math.round((p.fabric_specs.stretch_factor - 1) * 100)}% ikut dihitung</li>
        </ul>
      </div>
      <p class="fineprint" style="margin-top:10px">Estimasi dimensi tubuh: dada ${prof.metrics.estimated_chest_cm} · pinggang ${prof.metrics.estimated_waist_cm} · pinggul ${prof.metrics.estimated_hips_cm} cm.</p>
    `;

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fg = $('.ring__fg', body);
      if (fg) fg.style.strokeDashoffset = fg.dataset.offset;
    }));

    const available = inStock(p, preview.size_label);
    cta.disabled = !available;
    cta.textContent = available
      ? `Pesan dengan Ukuran ${preview.size_label} · ${fmtK(p.price)}`
      : `Size ${preview.size_label} Stok Habis`;
  }

  /* -------------------------------------------------- CERMIN AI (virtual try-on) */
  function renderCermin() {
    const p = prod(state.mirrorSku || state.currentSku);
    state.mirrorSku = p.sku_id;
    $('#cermin-prod-label').textContent = `${p.name} — ${p.variant}`;

    const sizes = p.sizes.map((s) => s.size_label).filter((l) => inStock(p, l));
    const r = state.results[p.sku_id];
    const def = (r && sizes.includes(r.best.size_label) ? r.best.size_label : null)
      || (state.selectedSize && sizes.includes(state.selectedSize) ? state.selectedSize : null)
      || sizes[Math.min(1, sizes.length - 1)];
    if (!sizes.includes(state.mirrorSize)) state.mirrorSize = def;

    $('#cermin-sizes').innerHTML = sizes.map((l) =>
      `<button type="button" class="size-chip" role="radio" aria-checked="${state.mirrorSize === l}" data-mirror-size="${l}">${l}</button>`).join('');

    if (!state.profile) {
      $('#cermin-note').textContent = '🪞 Pose AI berjalan di perangkat. Tip: isi Atelier Consultation dulu agar estimasi bahu memakai tinggi badan Anda.';
    }
    startMirror();
  }

  async function startMirror() {
    const video = $('#mirror-video');
    const m = state.mirror;
    if (m.on) return;
    m.on = true;
    $('#mirror-fallback').hidden = true;

    // 1) Buka kamera depan (efek cermin lewat CSS scaleX)
    try {
      m.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 } }, audio: false,
      });
      video.srcObject = m.stream;
      await video.play().catch(() => {});
    } catch (e) {
      m.on = false;
      $('#mirror-fallback').hidden = false;
      $('#hud-status').textContent = 'Kamera tidak aktif';
      return;
    }

    // 2) Muai pose tracker (MediaPipe, on-device). Jika gagal → mode statis.
    m.tracking = false;
    $('#hud-status').textContent = 'Memuat model pose…';
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const vision = await Promise.race([
        import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'),
        timeout,
      ]);
      const fileset = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
      m.landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      m.tracking = true;
    } catch (e) {
      m.landmarker = null;
      m.tracking = false;
      $('#hud-status').textContent = 'Cermin manual — AI belum aktif';
    }

    m.lastT = -1;
    const loop = () => {
      if (!state.mirror.on) return;
      if (m.tracking && m.landmarker && video.readyState >= 2 && video.currentTime !== m.lastT) {
        m.lastT = video.currentTime;
        try {
          const res = m.landmarker.detectForVideo(video, performance.now());
          m.lm = res?.landmarks?.[0] || null;
        } catch (e) { /* frame dilewati */ }
      }
      drawMirror();
      m.raf = requestAnimationFrame(loop);
    };
    m.raf = requestAnimationFrame(loop);
  }

  function stopMirror() {
    const m = state.mirror;
    if (!m.on) return;
    m.on = false;
    cancelAnimationFrame(m.raf);
    try { m.stream?.getTracks().forEach((t) => t.stop()); } catch (e) { /* sudah berhenti */ }
    try { m.landmarker?.close(); } catch (e) { /* sudah tertutup */ }
    m.stream = null; m.landmarker = null; m.lm = null; m.tracking = false;
  }

  /** Posisi landmark (dinormalisasi 0-1 ruang video) → koordinat kanvas efek-cermin (object-fit: cover). */
  function lmToCanvas(lm, canvas, video) {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    const ox = (canvas.width - dw) / 2, oy = (canvas.height - dh) / 2;
    return {
      x: ox + (1 - lm.x) * dw, // dicerminkan
      y: oy + lm.y * dh,
    };
  }

  function drawMirror() {
    const video = $('#mirror-video');
    const canvas = $('#mirror-canvas');
    if (!video || !canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const p = prod(state.mirrorSku || state.currentSku);
    const lm = state.mirror.lm;
    const shape = new Path2D(MIRROR_SHAPES[SHAPE_BY_CAT[p.category] || 'tee']);
    const color = MIRROR_COLORS[p.variant] || '#2E2E33';

    // Geometri tubuh (fallback statis di tengah bila belum terkunci)
    let cx, topY, shoulderPx;
    const lmOk = lm && lm[11] && lm[12] && lm[11].visibility > 0.5 && lm[12].visibility > 0.5;
    if (lmOk) {
      const sL = lmToCanvas(lm[11], canvas, video);
      const sR = lmToCanvas(lm[12], canvas, video);
      shoulderPx = Math.hypot(sR.x - sL.x, sR.y - sL.y);
      cx = (sL.x + sR.x) / 2;
      topY = Math.min(sL.y, sR.y) - shoulderPx * 0.22;
      $('#hud-status').textContent = state.mirror.tracking ? 'Terkunci ✓ — diproses di perangkat Anda' : 'Cermin manual';
    } else {
      shoulderPx = W * 0.26;
      cx = W / 2;
      topY = H * 0.24;
      if (state.mirror.tracking) $('#hud-status').textContent = 'Mengunci tubuh… jaga jarak ±1–2 m';
    }

    // Skala ukuran: tiap langkah size ±5.5% lebar
    const idx = p.sizes.findIndex((s) => s.size_label === state.mirrorSize);
    const idxM = p.sizes.findIndex((s) => s.size_label === 'M');
    const sizeFactor = 1 + ((idx < 0 ? 1 : idx) - (idxM < 0 ? 1 : idxM)) * 0.055;
    const gw = shoulderPx * 2.08 * sizeFactor;
    const gh = gw * (1200 / 896);

    ctx.save();
    ctx.translate(cx - gw / 2, topY);
    ctx.scale(gw / 896, gh / 1200);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = color;
    ctx.fill(shape);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3.5 * (896 / gw);
    ctx.strokeStyle = 'rgba(18,18,18,0.35)';
    ctx.stroke(shape);
    // garis bahu sebagai acuan
    ctx.beginPath();
    ctx.moveTo(356, 318); ctx.lineTo(540, 318);
    ctx.lineWidth = 2.5 * (896 / gw);
    ctx.strokeStyle = 'rgba(250,249,246,0.55)';
    ctx.stroke();
    ctx.restore();

    // HUD: estimasi lebar bahu (cm) memakai tinggi badan profil sebagai skala
    const hudSh = $('#hud-shoulder');
    const hudFit = $('#hud-fit');
    hudFit.className = 'hud-chip';
    if (lmOk) {
      const heightCm = state.profile?.metrics.height_cm || 170;
      let bodyPx = 0;
      if (lm[28] && lm[28].visibility > 0.4) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[28], canvas, video).y);
      else if (lm[24]) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[24], canvas, video).y) * 1.95;
      if (bodyPx > 0) {
        const shoulderCm = (shoulderPx / (bodyPx / heightCm));
        const sz = p.sizes.find((s) => s.size_label === state.mirrorSize);
        const diff = (sz?.shoulder_width_cm || 46) * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) - shoulderCm;
        hudSh.textContent = `Bahu Anda ±${Math.round(shoulderCm)} cm`;
        if (diff >= -2.5 && diff <= 3.5) { hudFit.textContent = `Size ${state.mirrorSize} ✓ Pas di bahu`; hudFit.classList.add('hud-chip--ok'); }
        else if (diff < -2.5) { hudFit.textContent = `Size ${state.mirrorSize} agak ketat`; hudFit.classList.add('hud-chip--warn'); }
        else { hudFit.textContent = `Size ${state.mirrorSize} agak longgar`; }

        // AI menyarankan ukuran terbaik dari pengukuran bahu live (target kelonggaran +2 cm)
        const sug = p.sizes
          .map((sz) => ({ l: sz.size_label, eff: sz.shoulder_width_cm * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) }))
          .sort((a, b) => Math.abs(a.eff - shoulderCm - 2) - Math.abs(b.eff - shoulderCm - 2))[0];
        if (sug && sug.l !== state.mirrorSize) hudFit.textContent += ` → AI: ${sug.l}`;
      }
    } else {
      hudSh.textContent = 'Bahu: mengunci…';
      hudFit.textContent = `Size ${state.mirrorSize || '—'}`;
    }
  }

  function captureMirror() {
    const video = $('#mirror-video');
    const canvas = $('#mirror-canvas');
    if (!video || !video.videoWidth) { toast('Kamera belum aktif.'); return; }
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    const ctx = out.getContext('2d');
    // gambar video ter-cermin (object-fit cover)
    const scale = Math.max(out.width / video.videoWidth, out.height / video.videoHeight);
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    ctx.save();
    ctx.translate(out.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    ctx.restore();
    ctx.drawImage(canvas, 0, 0);
    const url = out.toDataURL('image/png');
    $('#foto-img').src = url;
    $('#foto-download').href = url;
    openSheet('sheet-foto');
    toast('Foto tersimpan — bisa diunduh atau dibagikan.');
  }

  /* -------------------------------------------------- SAVED */
  function renderSaved() {
    const body = $('#saved-body');
    if (!state.saved.length) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.3 11c-2.3 4.4-9.3 9-9.3 9z"/></svg></div>
          <p class="serif-sm">Belum ada item tersimpan</p>
          <p class="muted-sm">Simpan produk favorit dari halaman produk dengan tombol hati.</p>
          <button type="button" class="btn btn--outline btn--sm" data-goto="shop">Jelajahi Koleksi</button>
        </div>`;
      return;
    }
    body.innerHTML = state.saved.map((sku) => {
      const p = prod(sku);
      return `
      <div class="saved-item">
        <img src="${p.image}" alt="">
        <div>
          <p class="saved-item__name">${esc(p.name)} — ${esc(p.variant)}</p>
          <p class="saved-item__meta">${p.category}</p>
          <p class="saved-item__price">${fmtIDR(p.price)}</p>
        </div>
        <button type="button" class="icon-btn" data-unsave="${sku}" aria-label="Hapus dari simpanan">✕</button>
      </div>`;
    }).join('') +
      `<button type="button" class="btn btn--outline btn--sm btn--block" data-goto="shop" style="margin-top:8px">Lanjut Belanja</button>`;
  }

  /* -------------------------------------------------- LOGIN */
  function renderLogin() {
    const isLogin = state.authMode === 'login';
    $('#auth-tab-login').classList.toggle('is-active', isLogin);
    $('#auth-tab-reg').classList.toggle('is-active', !isLogin);
    $('#auth-tab-login').setAttribute('aria-selected', isLogin);
    $('#auth-tab-reg').setAttribute('aria-selected', !isLogin);
    $('#wrap-name').hidden = isLogin;
    $('#wrap-phone').hidden = isLogin;
    $('#login-title').textContent = isLogin ? 'Selamat datang kembali.' : 'Buat akun baru.';
    $('#login-sub').textContent = isLogin
      ? 'Masuk untuk melanjutkan ke koleksi, profil fit, dan pesanan Anda.'
      : 'Satu akun untuk koleksi, rekomendasi ukuran AI, dan pelacakan pesanan.';
    $('#auth-submit').textContent = isLogin ? 'Masuk' : 'Daftar & Masuk';
    $('#auth-error').hidden = true;
  }

  function authError(msg) {
    const el = $('#auth-error');
    el.textContent = msg;
    el.hidden = false;
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = $('#a-email').value.trim().toLowerCase();
    const pass = $('#a-pass').value;
    const users = load(STORE.users, []);

    if (!/^\S+@\S+\.\S+$/.test(email)) return authError('Format email tidak valid.');
    if (pass.length < 6) return authError('Kata sandi minimal 6 karakter.');

    const name = $('#a-name').value.trim();
    const phone = $('#a-phone').value.trim();
    const btn = $('#auth-submit');
    btn.disabled = true;

    // 1) Cloud-first: akun & sandi tersimpan di database (terhash scrypt)
    if (await Cloud.ping()) {
      try {
        const res = await Cloud.call('/auth', {
          method: 'POST',
          body: { action: state.authMode, email, pass, name, phone },
        });
        Cloud.setToken(res.token);
        // mirror ke lokal untuk mode offline
        if (!users.some((u) => u.email === email)) {
          users.push({ name: res.user.name, email, phone: res.user.phone, pass });
          save(STORE.users, users);
        }
        btn.disabled = false;
        loginAs(res.user);
        syncPull(email);
        toast('Akun tersinkron ✓ — data Anda ikut di semua perangkat.');
        return;
      } catch (err) {
        toast('Koneksi server terputus — melanjutkan dengan data di perangkat ini.');
      }
    }

    // 2) Fallback lokal
    btn.disabled = false;
    if (state.authMode === 'register') {
      if (name.length < 3) return authError('Nama lengkap minimal 3 karakter.');
      if (phone.replace(/\D/g, '').length < 9) return authError('No. HP tidak valid (min. 9 digit).');
      if (users.some((u) => u.email === email)) return authError('Email sudah terdaftar — gunakan tab Masuk.');
      users.push({ name, email, phone, pass });
      save(STORE.users, users);
      loginAs({ name, email, phone });
    } else {
      const user = users.find((u) => u.email === email);
      if (!user) return authError('Email belum terdaftar. Coba tab Daftar atau akun demo.');
      if (user.pass !== pass) return authError('Kata sandi salah.');
      loginAs({ name: user.name, email: user.email, phone: user.phone });
    }
  }

  function loginAs(u) {
    state.auth = { ...u, loginAt: new Date().toISOString() };
    save(STORE.auth, state.auth);
    toast(`Selamat datang, ${u.name.split(' ')[0]}! Anda masuk sebagai ${u.email}.`);
    goto('shop');
  }

  function ensureDemoUser() {
    const users = load(STORE.users, []);
    if (!users.some((u) => u.email === DEMO_USER.email)) {
      users.push({ name: DEMO_USER.name, email: DEMO_USER.email, phone: DEMO_USER.phone, pass: DEMO_USER.pass });
      save(STORE.users, users);
    }
  }

  function logout() {
    state.auth = null;
    state.authMode = 'login';
    Cloud.clearToken();
    save(STORE.auth, null);
    toast('Anda keluar. Profil & keranjang tetap tersimpan di perangkat ini.');
    goto('login');
  }

  /* -------------------------------------------------- BAG */
  function cartCount() { return state.cart.reduce((a, i) => a + i.qty, 0); }

  function cartTotals() {
    const subtotal = state.cart.reduce((a, i) => a + i.qty * prod(i.sku).price, 0);
    const opts = getShipOptions(state.address?.provinsi);
    const ship = opts.find((s) => s.id === state.shippingId) || opts[1];
    const shipping = subtotal > 0 ? ship.cost : 0;
    const discount = state.voucher ? Math.min(state.voucher.amount, subtotal + shipping) : 0;
    return { subtotal, shipping, discount, total: Math.max(0, subtotal + shipping - discount), ship };
  }

  function persistBagPrefs() {
    save(STORE.bagPrefs, { shippingId: state.shippingId, payMethod: state.payMethod, voucher: state.voucher });
  }

  function requireCart() {
    if (cartCount() > 0) return true;
    toast('Tas Anda kosong — pilih produk dulu di Shop.');
    goto('bag');
    return false;
  }

  function renderBag() {
    const count = cartCount();
    $('#bag-count-label').textContent = `${count} item`;
    const bodyEl = $('#bag-body');
    const cta = $('#bag-cta');

    if (!count) {
      bodyEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1.2 12H7.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></div>
          <p class="serif-sm">Tas masih kosong</p>
          <p class="muted-sm">Ukuran hasil rekomendasi AI otomatis mendapat lencana terverifikasi &amp; jaminan tukar gratis.</p>
          <button type="button" class="btn btn--outline btn--sm" data-goto="shop">Lihat Koleksi</button>
        </div>`;
      cta.disabled = true;
      cta.textContent = 'Tas Masih Kosong';
      return;
    }

    const t = cartTotals();
    const anyVerified = state.cart.some((i) => i.verified);

    bodyEl.innerHTML = `
      <div class="guarantee"><span aria-hidden="true">🛡</span><span><b>Jaminan Ukuran Pas:</b> ${anyVerified ? 'profil fit tersimpan — tukar ukuran gratis bila tidak pas.' : 'pakai rekomendasi AI agar mendapat tukar ukuran gratis.'}</span></div>

      <ul class="cart-list">
        ${state.cart.map((i, idx) => {
          const p = prod(i.sku);
          return `
          <li class="cart-item">
            <img src="${p.image}" alt="">
            <div>
              <p class="cart-item__name">${esc(p.name)} — ${esc(p.variant)}</p>
              <p class="cart-item__meta">${p.category} · Size ${i.size}</p>
              ${i.verified ? `<span class="ai-verified">✓ Rekomendasi AI · ${i.confidence}%</span>` : `<span class="ai-unverified">Belum diverifikasi AI</span>`}
              <div class="cart-item__foot">
                <span class="cart-item__price">${fmtIDR(p.price * i.qty)}</span>
                <span class="stepper" role="group" aria-label="Jumlah size ${i.size}">
                  <button type="button" data-qty="-1" data-idx="${idx}" aria-label="Kurangi">−</button>
                  <span>${i.qty}</span>
                  <button type="button" data-qty="1" data-idx="${idx}" aria-label="Tambah">+</button>
                </span>
              </div>
              <button type="button" class="link-btn cart-item__remove" data-remove="${idx}">Hapus</button>
            </div>
          </li>`;
        }).join('')}
      </ul>

      <p class="label-xs">Voucher</p>
      ${state.voucher
        ? `<div class="voucher-applied"><span>${state.voucher.code} · −${fmtIDR(state.voucher.amount)}</span><button type="button" class="link-btn" id="voucher-remove" style="color:var(--ok)">Hapus</button></div>`
        : `<div class="voucher-row">
             <input type="text" id="voucher-input" placeholder="Kode voucher" autocomplete="off" aria-label="Kode voucher">
             <button type="button" class="btn btn--outline btn--sm" id="voucher-apply">Pasang</button>
           </div>
           ${state.voucherError ? `<p class="voucher-error">${state.voucherError}</p>` : '<p class="fineprint" style="margin-top:6px">Coba <b>FITPERTAMA</b> — potongan Rp 45.000.</p>'}`}

      <dl class="summary">
        <div><dt>Subtotal (${count} item)</dt><dd>${fmtIDR(t.subtotal)}</dd></div>
        ${t.discount ? `<div class="is-discount"><dt>Voucher ${state.voucher.code}</dt><dd>−${fmtIDR(t.discount)}</dd></div>` : ''}
      </dl>
      <p class="fineprint">Ongkir dihitung otomatis dari zona alamat di langkah berikutnya.</p>
      <div style="text-align:center;padding:6px 0 2px"><button type="button" class="link-btn" data-goto="shop">+ Lanjut lihat koleksi lain</button></div>`;

    cta.disabled = false;
    cta.textContent = 'Lanjut ke Pengiriman →';
  }

  /* -------------------------------------------------- PENGIRIMAN */
  function renderPengiriman() {
    if (!requireCart()) return;
    const body = $('#pengiriman-body');
    const a = state.address;
    const opts = getShipOptions(a?.provinsi);

    body.innerHTML = `
      <p class="label-xs">Alamat Tujuan</p>
      ${a ? `
        <div class="address-card">
          <div class="address-card__head">
            <span class="address-card__name">${esc(a.nama)}</span>
            <span class="address-card__phone">${esc(a.phone)}</span>
          </div>
          <p class="address-card__body">${esc(a.alamat)}, ${esc(a.kota)}, ${esc(a.provinsi)} ${esc(a.kodepos)}${a.catatan ? '<br><span class="fineprint">Catatan kurir: ' + esc(a.catatan) + '</span>' : ''}</p>
          <button type="button" class="link-btn" data-goto="alamat" style="margin-top:8px">Ubah alamat</button>
        </div>` : `
        <div class="address-card address-card--empty">
          <p>Alamat belum diisi — tambahkan agar ongkir dihitung otomatis.</p>
          <button type="button" class="btn btn--outline btn--sm" data-goto="alamat">Tambah Alamat</button>
        </div>`}

      <p class="label-xs">Pilih Pengiriman <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--muted)">· ${opts[0].zone}${a ? '' : ' (perkiraan)'}</span></p>
      ${opts.map((s) => `
        <label class="opt-row">
          <input type="radio" name="ship" value="${s.id}" ${state.shippingId === s.id ? 'checked' : ''}>
          <span class="opt-row__main"><span class="opt-row__label">${s.label}</span><span class="opt-row__sub">${s.eta} · terlacak</span></span>
          <span class="opt-row__price">${fmtIDR(s.cost)}</span>
        </label>`).join('')}
      <p class="fineprint">Ongkir <b>dihitung otomatis</b> dari zona provinsi alamat — berubah saat alamat diubah.</p>`;

    const cta = $('#pengiriman-cta');
    cta.disabled = !state.address;
    cta.textContent = state.address ? 'Lanjut ke Pembayaran →' : 'Isi Alamat Dulu';
  }

  /* -------------------------------------------------- ALAMAT */
  function renderAlamat() {
    const a = state.address;
    $('#alamat-back').setAttribute('data-goto', state.addressReturn || 'pengiriman');
    $('#alamat-body').innerHTML = `
      <div class="ff">
        <label for="ad-name">Nama Penerima</label>
        <input type="text" class="control" id="ad-name" value="${a ? esc(a.nama) : esc(state.auth?.name || '')}" placeholder="Nama di paket">
      </div>
      <div class="ff">
        <label for="ad-phone">No. HP Penerima</label>
        <input type="tel" class="control" id="ad-phone" value="${a ? esc(a.phone) : esc(state.auth?.phone || '')}" placeholder="08xx xxxx xxxx">
      </div>
      <div class="ff">
        <label for="ad-prov">Provinsi <span style="font-weight:400;color:var(--muted)">(menentukan zona ongkir)</span></label>
        <select class="control" id="ad-prov">
          <option value="">— Pilih provinsi —</option>
          ${PROVINSI.map((p) => `<option value="${p}" ${a && a.provinsi === p ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
      <div class="ff">
        <label for="ad-kota">Kota / Kabupaten</label>
        <select class="control" id="ad-kota"></select>
      </div>
      <div class="ff">
        <label for="ad-alamat">Alamat Lengkap</label>
        <textarea class="control" id="ad-alamat" placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan">${a ? esc(a.alamat) : ''}</textarea>
      </div>
      <div class="ff">
        <label for="ad-pos">Kode Pos</label>
        <input type="text" class="control" id="ad-pos" inputmode="numeric" maxlength="5" value="${a ? esc(a.kodepos) : ''}" placeholder="5 digit">
      </div>
      <div class="ff">
        <label for="ad-catat">Catatan untuk Kurir <span style="font-weight:400;color:var(--muted)">(opsional)</span></label>
        <input type="text" class="control" id="ad-catat" value="${a && a.catatan ? esc(a.catatan) : ''}" placeholder="cth. titip ke satpam blok A">
      </div>`;
    fillKota(a?.kota);
  }

  const KOTA_BY_PROV = {
    'DKI Jakarta': ['Jakarta Selatan', 'Jakarta Barat', 'Jakarta Pusat', 'Jakarta Timur', 'Jakarta Utara'],
    'Jawa Barat': ['Bandung', 'Bekasi', 'Bogor', 'Depok', 'Cirebon'],
    'Jawa Tengah': ['Semarang', 'Solo', 'Magelang'],
    'DI Yogyakarta': ['Yogyakarta', 'Sleman', 'Bantul'],
    'Jawa Timur': ['Surabaya', 'Malang', 'Gresik'],
    'Bali': ['Denpasar', 'Badung', 'Ubud'],
  };

  function fillKota(selected) {
    const prov = $('#ad-prov').value;
    const kotaSel = $('#ad-kota');
    const list = KOTA_BY_PROV[prov] || [];
    kotaSel.innerHTML = `<option value="">${list.length ? '— Pilih kota —' : '— Pilih provinsi dulu —'}</option>` +
      list.map((k) => `<option value="${k}" ${selected === k ? 'selected' : ''}>${k}</option>`).join('');
  }

  function saveAddress() {
    const rec = (sel) => $(sel).closest('.ff');
    const data = {
      nama: $('#ad-name').value.trim(),
      phone: $('#ad-phone').value.trim(),
      provinsi: $('#ad-prov').value,
      kota: $('#ad-kota').value,
      alamat: $('#ad-alamat').value.trim(),
      kodepos: $('#ad-pos').value.trim(),
      catatan: $('#ad-catat').value.trim(),
    };
    let bad = null;
    if (data.nama.length < 3) bad = ['#ad-name', 'Nama penerima minimal 3 karakter.'];
    else if (data.phone.replace(/\D/g, '').length < 9) bad = ['#ad-phone', 'No. HP tidak valid (min. 9 digit).'];
    else if (!data.provinsi) bad = ['#ad-prov', 'Pilih provinsi.'];
    else if (!data.kota) bad = ['#ad-kota', 'Pilih kota / kabupaten.'];
    else if (data.alamat.length < 10) bad = ['#ad-alamat', 'Alamat lengkap minimal 10 karakter.'];
    else if (!/^\d{5}$/.test(data.kodepos)) bad = ['#ad-pos', 'Kode pos harus 5 digit.'];

    $$('#alamat-body .ff').forEach((f) => f.classList.remove('ff--error'));
    if (bad) {
      rec(bad[0]).classList.add('ff--error');
      toast(bad[1]);
      return;
    }
    const provChanged = state.address && state.address.provinsi !== data.provinsi;
    state.address = data;
    save(STORE.address, data);
    toast(`Alamat tersimpan${provChanged ? ' — ongkir zona ${getShipOptions(data.provinsi)[0].zone} diterapkan.' : '.'}`);
    goto(state.addressReturn || 'pengiriman');
  }

  /* -------------------------------------------------- PEMBAYARAN */
  function renderPembayaran() {
    if (!requireCart()) return;
    if (!state.address) {
      toast('Isi alamat pengiriman dulu sebelum membayar.');
      goto('pengiriman');
      return;
    }
    const body = $('#pembayaran-body');
    const t = cartTotals();
    const a = state.address;
    const labels = Object.fromEntries(PAYMENTS);

    body.innerHTML = `
      <p class="label-xs">Ringkasan</p>
      <div class="address-card">
        <p class="address-card__body"><b>${esc(a?.nama || '-')}</b> · ${esc(a?.phone || '-')}<br>${esc(a?.alamat || '-')}, ${esc(a?.kota || '-')}, ${esc(a?.provinsi || '-')}</p>
        <div class="row-between" style="margin-top:8px">
          <span class="fineprint">Kurir ${t.ship.label} · ${t.ship.eta} · ${t.ship.zone}</span>
          <button type="button" class="link-btn" data-goto="pengiriman">Ubah</button>
        </div>
      </div>

      <p class="label-xs">Metode Pembayaran</p>
      ${PAYMENTS.map(([v, label, sub]) => `
        <label class="opt-row">
          <input type="radio" name="pay" value="${v}" ${state.payMethod === v ? 'checked' : ''}>
          <span class="opt-row__main"><span class="opt-row__label">${label}</span><span class="opt-row__sub">${sub}</span></span>
        </label>`).join('')}

      <dl class="summary">
        <div><dt>Subtotal (${cartCount()} item)</dt><dd>${fmtIDR(t.subtotal)}</dd></div>
        <div><dt>Pengiriman (${t.ship.label} · ${t.ship.zone})</dt><dd>${fmtIDR(t.shipping)}</dd></div>
        ${t.discount ? `<div class="is-discount"><dt>Voucher ${state.voucher.code}</dt><dd>−${fmtIDR(t.discount)}</dd></div>` : ''}
        <div class="is-total"><dt>Total Tagihan</dt><dd>${fmtIDR(t.total)}</dd></div>
      </dl>
      <div class="trust-badges"><span>Tukar Ukuran 7 Hari</span><span>100% Original</span><span>Terenkripsi HTTPS/TLS</span></div>
      <p class="fineprint">Metode terpilih: <b>${labels[state.payMethod]}</b> · koneksi aman &amp; terenkripsi.</p>`;

    const cta = $('#pembayaran-cta');
    cta.disabled = false;
    cta.textContent = `Bayar • ${fmtIDR(t.total)}`;
  }

  /* ---- QR deterministik untuk QRIS (simulasi) ---- */
  function qrSvg(seed) {
    let h = 0;
    for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const rand = () => { h = (h * 1103515245 + 12345) >>> 0; return h / 4294967296; };
    const N = 21, C = 8;
    const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
    let cells = '';
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (finder(r, c)) continue;
        if (r >= 9 && r <= 11 && c >= 9 && c <= 11) continue; // logo tengah
        if (rand() < 0.46) cells += `<rect x="${c * C}" y="${r * C}" width="${C}" height="${C}"/>`;
      }
    }
    const fp = (x, y) => `<rect x="${x}" y="${y}" width="${7 * C}" height="${7 * C}"/><rect x="${x + C}" y="${y + C}" width="${5 * C}" height="${5 * C}" fill="#fff"/><rect x="${x + 2 * C}" y="${y + 2 * C}" width="${3 * C}" height="${3 * C}"/>`;
    return `<svg viewBox="0 0 ${N * C} ${N * C}" width="184" height="184" fill="#121212" aria-hidden="true">
      ${fp(0, 0)}${fp((N - 7) * C, 0)}${fp(0, (N - 7) * C)}${cells}
      <rect x="${9 * C}" y="${9 * C}" width="${3 * C}" height="${3 * C}" fill="#B84A28"/>
    </svg>`;
  }

  function pay() {
    if (state.paying) return;
    if (!cartCount() || !state.address) return;
    const t = cartTotals();
    const labels = Object.fromEntries(PAYMENTS);
    const btn = $('#pembayaran-cta');
    state.paying = true;
    btn.disabled = true;

    if (state.payMethod === 'qris') {
      $('#qris-total').textContent = `${labels.qris} · ${fmtIDR(t.total)}`;
      $('#qr-mount').innerHTML = qrSvg('AURA-' + Date.now());
      openSheet('sheet-qris');
      setTimeout(() => { closeSheet(); completeOrder(labels.qris); }, 3200);
    } else {
      btn.textContent = 'Memproses Pembayaran…';
      setTimeout(() => completeOrder(labels[state.payMethod]), 1100);
    }
  }

  function completeOrder(payLabel) {
    const t = cartTotals();
    const orderId = 'AA-' + Date.now().toString(36).toUpperCase().slice(-6);
    const now = new Date().toISOString();

    state.orders.unshift({
      id: orderId,
      at: now,
      items: state.cart.map((i) => {
        const p = prod(i.sku);
        return { ...i, name: p.name, variant: p.variant, price: p.price };
      }),
      totals: { subtotal: t.subtotal, shipping: t.shipping, discount: t.discount, total: t.total },
      shipping: { id: t.ship.id, label: t.ship.label, eta: t.ship.eta, cost: t.ship.cost, zone: t.ship.zone },
      address: { ...state.address },
      payMethod: state.payMethod,
      payLabel,
      statusIndex: 0,
      timeline: [{ stage: 0, at: now }],
      feedback: null,
    });
    save(STORE.orders, state.orders);

    // simpan ke database (bila online) — tanpa memblokir UI
    if (Cloud.token) {
      Cloud.call('/orders', { method: 'POST', body: { order: state.orders[0] } }).catch(() => {});
    }

    state.cart = [];
    state.voucher = null;
    state.voucherError = '';
    state.paying = false;
    save(STORE.cart, state.cart);
    persistBagPrefs();
    renderBadges();

    toast(`Pembayaran via ${payLabel} berhasil. Pesanan ${orderId} sedang diproses.`);
    goto('pesanan/' + orderId);
  }

  /* -------------------------------------------------- PESANAN */
  function renderPesanan(param) {
    const o = state.orders.find((x) => x.id === param) || state.orders.find((x) => x.id === state.activeOrderId) || state.orders[0];
    const body = $('#pesanan-body');

    if (!o) {
      $('#pesanan-title').textContent = 'Pesanan';
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="9" width="19" height="7" rx="2"/><path d="M7 9v3.5M11.5 9v3.5M16 9v3.5"/></svg></div>
          <p class="serif-sm">Belum ada pesanan</p>
          <p class="muted-sm">Pesanan yang sudah dibayar akan terlacak di sini tahap demi tahap.</p>
          <button type="button" class="btn btn--outline btn--sm" data-goto="shop">Mulai Belanja</button>
        </div>`;
      return;
    }

    state.activeOrderId = o.id;
    $('#pesanan-title').textContent = 'Pesanan ' + o.id;
    const delivered = o.statusIndex === ORDER_STAGES.length - 1;
    const current = ORDER_STAGES[o.statusIndex];

    body.innerHTML = `
      <div class="track-hero">
        <h3>${delivered ? 'Paket tiba di tujuan 🎉' : current}</h3>
        <p>${delivered
          ? `Diterima di ${esc(o.address.kota)} · ${fmtDate(o.at)}`
          : `Kurir ${o.shipping.label} · zona ${o.shipping.zone} · estimasi ${o.shipping.eta} · simulasi: tahap maju otomatis`}</p>
      </div>

      <p class="label-xs">Status Pengiriman</p>
      <ol class="timeline">
        ${ORDER_STAGES.map((stage, i) => {
          const entry = o.timeline.find((x) => x.stage === i);
          const cls = i < o.statusIndex ? 'is-done' : i === o.statusIndex ? 'is-current' : 'is-pending';
          return `<li class="${cls}">
            <span class="tl-dot">${i < o.statusIndex ? '✓' : i === o.statusIndex ? '●' : ''}</span>
            <div><span class="tl-label">${stage}</span>${entry ? `<span class="tl-time">${fmtTime(entry.at)}</span>` : ''}</div>
          </li>`;
        }).join('')}
      </ol>

      <p class="label-xs">Dikirim Ke</p>
      <div class="address-card">
        <div class="address-card__head">
          <span class="address-card__name">${esc(o.address.nama)}</span>
          <span class="address-card__phone">${esc(o.address.phone)}</span>
        </div>
        <p class="address-card__body">${esc(o.address.alamat)}, ${esc(o.address.kota)}, ${esc(o.address.provinsi)} ${esc(o.address.kodepos)}</p>
      </div>

      <p class="label-xs">Item Pesanan</p>
      ${o.items.map((i) => {
        const p = prod(i.sku);
        return `
        <div class="item-mini">
          <img src="${p.image}" alt="">
          <div>
            <p class="item-mini__name">${esc(i.name || p.name)} · ${esc(i.variant || p.variant)}</p>
            <p class="item-mini__meta">Size ${i.size} × ${i.qty}${i.verified ? ` · <span class="ai-verified" style="font-size:9.5px;padding:1px 5px">✓ AI ${i.confidence}%</span>` : ''}</p>
          </div>
          <span class="item-mini__price">${fmtIDR((i.price || p.price) * i.qty)}</span>
        </div>`;
      }).join('')}

      <dl class="summary">
        <div><dt>Subtotal</dt><dd>${fmtIDR(o.totals.subtotal)}</dd></div>
        <div><dt>Pengiriman (${o.shipping.label} · ${o.shipping.zone || ''})</dt><dd>${fmtIDR(o.totals.shipping)}</dd></div>
        ${o.totals.discount ? `<div class="is-discount"><dt>Voucher</dt><dd>−${fmtIDR(o.totals.discount)}</dd></div>` : ''}
        <div class="is-total"><dt>Dibayar (${o.payLabel})</dt><dd>${fmtIDR(o.totals.total)}</dd></div>
      </dl>

      ${delivered ? renderSurveyBlock(o) : ''}
    `;
  }

  function renderSurveyBlock(o) {
    if (o.feedback) {
      const txt = { perfect: 'Pas sempurna — terima kasih!', too_small: 'Kekecilan — tukar ukuran gratis diproses.', too_big: 'Kebesaran — tukar ukuran gratis diproses.' }[o.feedback];
      return `<div class="survey-thanks"><span>✓</span><span>${txt} Masukan Anda mengkalibrasi AI untuk pembeli berikutnya.</span></div>`;
    }
    return `
      <div class="survey-inline">
        <h4>Paket diterima. Apakah ukurannya pas?</h4>
        <p class="muted-sm" style="margin-bottom:10px">Jawaban Anda langsung mengkalibrasi model AI untuk pembeli berikutnya.</p>
        <div class="survey-options" style="margin:0">
          <button type="button" class="survey-opt" data-order-feedback="too_small" data-order-id="${o.id}">Kekecilan</button>
          <button type="button" class="survey-opt survey-opt--good" data-order-feedback="perfect" data-order-id="${o.id}">Pas Sempurna</button>
          <button type="button" class="survey-opt" data-order-feedback="too_big" data-order-id="${o.id}">Kebesaran</button>
        </div>
      </div>`;
  }

  function submitOrderFeedback(orderId, value) {
    const o = state.orders.find((x) => x.id === orderId);
    if (!o || o.feedback) return;
    o.feedback = value;
    save(STORE.orders, state.orders);

    const log = load(STORE.feedback, []);
    o.items.forEach((i) => log.push({
      order_id: o.id, sku_id: i.sku, size: i.size, ai_recommended: i.verified,
      feedback: value,
      profile: state.profile ? { height_cm: state.profile.metrics.height_cm, weight_kg: state.profile.metrics.weight_kg, fit_preference: state.profile.fit_preference } : null,
      at: new Date().toISOString(),
    }));
    save(STORE.feedback, log);

    renderPesanan(orderId);
    const msg = {
      perfect: 'Terima kasih! Masukan Anda membuat rekomendasi AI makin akurat.',
      too_small: 'Tercatat — tukar ukuran gratis segera kami proses. Terima kasih!',
      too_big: 'Tercatat — tukar ukuran gratis segera kami proses. Terima kasih!',
    }[value];
    toast(msg);
  }

  /* -------------------------------------------------- BANTUAN & TOKO */
  function renderBantuan() {
    const totalSold = CATALOG.reduce((a, p) => a + p.sold, 0);
    $('#bantuan-body').innerHTML = `
      <div class="store-card">
        <img src="assets/icon.svg" alt="Logo Aura Atelier" class="store-card__logo">
        <div>
          <p class="store-card__name">Aura Atelier</p>
          <p class="store-card__desc">Studio garment lokal — basic wear premium dengan kalibrasi ukuran AI. Berdiri 2024 di Jakarta.</p>
        </div>
      </div>
      <div class="store-stats">
        <div><b>4.9★</b><small>Rating Toko</small></div>
        <div><b>${CATALOG.length}</b><small>Produk Aktif</small></div>
        <div><b>${(totalSold / 1000).toFixed(1)}k</b><small>Terjual</small></div>
      </div>

      <p class="label-xs">Jam Operasional</p>
      <div class="policy-block">
        <ul>
          <li>Senin–Jumat: 09.00–18.00 WIB</li>
          <li>Sabtu: 09.00–15.00 WIB · Minggu/libur: tutup</li>
          <li>Pesanan di atas 15.00 dikemas hari kerja berikutnya</li>
        </ul>
      </div>

      <p class="label-xs">Hubungi Kami</p>
      <div class="contact-grid">
        <button type="button" class="contact-btn" data-contact="WhatsApp"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-13 8l-5 1 1-5a9 9 0 1 1 17-4z"/></svg>WhatsApp</button>
        <button type="button" class="contact-btn" data-contact="Email"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>Email</button>
        <button type="button" class="contact-btn" data-contact="Telepon"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-3 2a13 13 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>Telepon</button>
      </div>
      <button type="button" class="chat-cta" id="open-chat" style="margin-top:10px">
        <span class="chat-dot" aria-hidden="true"></span> Live Chat — balas &lt; 2 menit
      </button>

      <p class="label-xs">Pertanyaan Umum (FAQ)</p>
      <details class="acc"><summary>Bagaimana cara memilih ukuran yang pas?</summary><div class="policy-block" style="border:0;padding:10px 0;background:transparent"><ul><li>Gunakan <b>Atelier Consultation</b> (tab Studio) — 30 detik, tanpa meteran.</li><li>Rekomendasi AI memperhitungkan stretch kain &amp; susut cuci per produk.</li><li>Pembeli rekomendasi AI dijamin tukar ukuran gratis 7 hari.</li></ul></div></details>
      <details class="acc"><summary>Berapa ongkir dan lama pengiriman?</summary><div class="policy-block" style="border:0;padding:10px 0;background:transparent"><ul><li>Ongkir <b>otomatis dihitung dari zona provinsi alamat</b>.</li><li>Zona Jakarta: mulai Rp 9.000 (Ekonomis 3–5 hari).</li><li>Ekspres tersedia — estimasi tampil sebelum bayar.</li></ul></div></details>
      <details class="acc"><summary>Metode pembayaran apa saja yang tersedia?</summary><div class="policy-block" style="border:0;padding:10px 0;background:transparent"><ul><li>Transfer Bank (Virtual Account), GoPay, <b>QRIS</b> (semua e-wallet/m-banking), dan Kartu Kredit.</li><li>Semua transaksi terenkripsi HTTPS/TLS.</li></ul></div></details>
      <details class="acc"><summary>Apakah bisa retur atau tukar barang?</summary><div class="policy-block" style="border:0;padding:10px 0;background:transparent"><ul><li>Tukar ukuran <b>gratis 7 hari</b> untuk pesanan rekomendasi AI.</li><li>Retur/refund 100% bila barang cacat produksi atau tidak sesuai deskripsi.</li></ul></div></details>

      <p class="label-xs">Kebijakan Pengembalian &amp; Refund</p>
      <div class="policy-block">
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
      <p class="fineprint" style="margin-top:12px">Transaksi dilindungi enkripsi HTTPS/TLS. Saat di-host produksi, sertifikat SSL aktif otomatis.</p>`;
  }

  /* -------------------------------------------------- LIVE CHAT */
  function chatPush(who, text) {
    state.chat.push({ who, text });
    renderChat();
  }

  function renderChat(typing) {
    const list = $('#chat-list');
    list.innerHTML = state.chat.map((m) =>
      `<div class="chat-msg chat-msg--${m.who}">${esc(m.text)}</div>`).join('') +
      (typing ? '<div class="chat-msg chat-msg--bot chat-msg--typing">sedang mengetik…</div>' : '');
    list.scrollTop = list.scrollHeight;
  }

  function botReply(q) {
    const t = q.toLowerCase();
    if (/(ukuran|size|pas|fit|kecil|besar)/.test(t)) return 'Untuk ukuran paling akurat, coba Atelier Consultation di tab Studio — cukup 30 detik. Rekomendasinya dijamin tukar gratis 7 hari bila kurang pas. 🙂';
    if (/(ongkir|kirim|pengiriman|kurir|estimasi|lama)/.test(t)) return 'Ongkir dihitung otomatis dari zona provinsi alamat Anda: Jakarta mulai Rp 9.000, Jawa mulai Rp 12.000, Bali mulai Rp 18.000. Estimasi tampil di langkah Pengiriman sebelum bayar.';
    if (/(retur|tukar|kembali|refund|rusak)/.test(t)) return 'Bisa! Retur/tukar maksimal 7 hari sejak paket diterima, tag masih terpasang. Tukar ukuran GRATIS bila Anda memakai rekomendasi AI. Ajukan lewat chat ini dengan nomor pesanan ya.';
    if (/(bayar|pembayaran|qris|gopay|transfer|kartu|va)/.test(t)) return 'Metode bayar kami: Virtual Account, GoPay, QRIS (semua e-wallet & m-banking), dan Kartu Kredit — semuanya terenkripsi. Voucher FITPERTAMA berlaku untuk pembelian pertama.';
    if (/(bahan|material|cotton|gsm|kain)/.test(t)) return 'Semua produk memakai kain premium (220–480 GSM) dengan detail gramasi di halaman produk. Susut cuci sudah diperhitungkan AI dalam rekomendasi ukuran.';
    if (/(jam|buka|operasional|tutup)/.test(t)) return 'Jam operasional: Senin–Jumat 09.00–18.00 WIB, Sabtu 09.00–15.00 WIB. Chat di luar jam akan dibalas hari kerja berikutnya.';
    if (/(halo|hai|hi|pagi|siang|sore|malam|assalam)/.test(t)) return 'Halo! 👋 Ada yang bisa dibantu — ukuran, pengiriman, pembayaran, atau retur?';
    if (/(voucher|diskon|promo|murah)/.test(t)) return 'Sedang ada voucher FITPERTAMA — potongan Rp 45.000. Masukkan kodenya di halaman Tas sebelum checkout.';
    return 'Terima kasih pertanyaannya! Untuk bantuan lebih lanjut, tim kami membalas chat ini pada jam operasional (Sen–Jum 09.00–18.00, Sab 09.00–15.00 WIB).';
  }

  function openChat() {
    if (!state.chat.length) {
      state.chat.push({ who: 'bot', text: 'Halo! Saya asisten Aura Atelier 👋 Tanyakan seputar ukuran, pengiriman, pembayaran, atau retur.' });
    }
    state.chatOpen = true;
    $('#chat-overlay').hidden = false;
    renderChat();
    setTimeout(() => $('#chat-input').focus(), 150);
  }
  function closeChat() {
    state.chatOpen = false;
    $('#chat-overlay').hidden = true;
  }

  /* -------------------------------------------------- ULASAN: tulis */
  function openReviewSheet() {
    const p = prod(state.currentSku);
    state.reviewDraft = { sku: p.sku_id, rating: 0 };
    $('#review-product').textContent = `${p.name} — ${p.variant}`;
    $('#review-text').value = '';
    $('#review-name').value = '';
    renderReviewStars();
    openSheet('sheet-review');
  }

  function renderReviewStars() {
    $('#review-stars').innerHTML = [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" class="${n <= state.reviewDraft.rating ? 'is-on' : ''}" data-star="${n}" role="radio" aria-checked="${n === state.reviewDraft.rating}" aria-label="${n} bintang">★</button>`).join('');
  }

  function submitReview() {
    const d = state.reviewDraft;
    const text = $('#review-text').value.trim();
    const name = $('#review-name').value.trim() || 'Pembeli';
    if (!d.rating) { toast('Pilih rating bintang dulu ya.'); return; }
    if (text.length < 10) { toast('Tulis ulasan minimal 10 karakter.'); return; }
    const r = state.results[d.sku];
    state.userReviews[d.sku] = (state.userReviews[d.sku] || []).concat({
      name, rating: d.rating, date: new Date().toISOString().slice(0, 10), text,
      size: r?.best.size_label || state.selectedSize || '—',
      verified: true,
    });
    save(STORE.reviews, state.userReviews);
    closeSheet();
    toast('Terima kasih! Ulasan Anda tampil di halaman produk.');
    if (state.route === 'produk' && state.currentSku === d.sku) renderPdp(d.sku);

    // kirim ke database agar tampil bagi semua pembeli
    if (Cloud.token) {
      Cloud.call('/reviews', {
        method: 'POST',
        body: {
          sku: d.sku,
          review: {
            name, rating: d.rating, text,
            size: r?.best.size_label || state.selectedSize || '—',
          },
        },
      })
        .then(({ reviews }) => { state.remoteReviews[d.sku] = reviews || []; })
        .catch(() => {});
    }
  }

  /* -------------------------------------------------- AKUN */
  function renderAkun() {
    const u = state.auth;
    if (!u) return;
    const body = $('#akun-body');
    const a = state.address;
    const p = state.profile;

    body.innerHTML = `
      <div class="acct-card">
        <span class="acct-card__avatar">${initials(u.name)}</span>
        <div>
          <p class="acct-card__name">${esc(u.name)}</p>
          <p class="acct-card__meta">${esc(u.email)} · ${esc(u.phone || '')}</p>
          ${Cloud.token ? '<span class="cloud-chip">☁ Tersinkron di semua perangkat</span>' : '<span class="cloud-chip cloud-chip--off">Data tersimpan di perangkat ini</span>'}
        </div>
      </div>

      <div class="acct-group">
        <button type="button" class="acct-row" data-goto="studio">
          <span><span class="acct-row__label">Profil Fit (AI)</span>
          <span class="acct-row__val">${p ? `${p.metrics.height_cm} cm / ${p.metrics.weight_kg} kg · ${FIT_LABEL[p.fit_preference]}` : 'Belum diisi — coba konsultasi 30 detik'}</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
        <button type="button" class="acct-row" data-goto="alamat" data-from="akun">
          <span><span class="acct-row__label">Alamat Pengiriman</span>
          <span class="acct-row__val">${a ? `${esc(a.kota)}, ${esc(a.provinsi)} · zona ${getShipOptions(a.provinsi)[0].zone}` : 'Tambah alamat utama'}</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
        <button type="button" class="acct-row" data-goto="bantuan">
          <span><span class="acct-row__label">Bantuan &amp; Kebijakan</span>
          <span class="acct-row__val">FAQ, retur &amp; refund, live chat, profil toko</span></span>
          <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>

      <p class="label-xs">Riwayat Pesanan</p>
      ${state.orders.length ? state.orders.map((o) => {
        const done = o.statusIndex === ORDER_STAGES.length - 1;
        return `<button type="button" class="order-row" data-order-open="${o.id}">
          <span class="order-row__id">${o.id}</span>
          <span class="order-row__date">${fmtDate(o.at)} · ${fmtTime(o.at)} · ${o.items.reduce((x, i) => x + i.qty, 0)} item</span>
          <span class="order-row__right">
            <span class="status-chip ${done ? 'status-chip--done' : 'status-chip--progress'}">${done ? 'Tiba' : ORDER_STAGES[o.statusIndex]}</span>
            <span class="order-row__total">${fmtIDR(o.totals.total)} <span class="order-row__chev" aria-hidden="true">›</span></span>
          </span>
        </button>`;
      }).join('') : '<p class="muted-sm" style="padding:8px 2px 16px">Belum ada pesanan — riwayat muncul setelah pembayaran.</p>'}

      <button type="button" class="btn btn--danger btn--block" id="btn-logout" style="margin-top:18px">Keluar</button>`;
  }

  /* -------------------------------------------------- KERANJANG */
  function addToCart(sku, size, { silent = false } = {}) {
    const r = state.profile ? ensureResult(sku) : null;
    const verified = !!r && r.best.size_label === size;
    const existing = state.cart.find((i) => i.sku === sku && i.size === size);
    if (existing) existing.qty += 1;
    else state.cart.push({ sku, size, qty: 1, verified, confidence: verified ? r.confidence : null });
    save(STORE.cart, state.cart);
    renderBadges();
    if (!silent) {
      bump($('#bag-badge')); bump($('#tab-bag-badge'));
      toast(verified ? `Size ${size} masuk tas — terverifikasi AI (${r.confidence}% cocok).` : `Size ${size} masuk tas.`);
    }
  }

  /* -------------------------------------------------- badges & sheets */
  function renderBadges() {
    const count = cartCount();
    [['#bag-badge', count], ['#tab-bag-badge', count], ['#saved-badge', state.saved.length]].forEach(([sel, n]) => {
      const el = $(sel);
      el.hidden = n === 0;
      el.textContent = n;
    });
    $('#avatar-init').textContent = initials(state.auth?.name);
  }

  function openSheet(id) {
    $('#sheet-overlay').hidden = false;
    $$('.bottom-sheet').forEach((s) => { s.hidden = s.id !== id; });
    const closeBtn = $('#' + id + ' [data-close-sheet]');
    if (closeBtn) closeBtn.focus();
  }
  function closeSheet() { $('#sheet-overlay').hidden = true; }

  /* -------------------------------------------------- event */
  function bind() {
    document.addEventListener('click', (e) => {
      const openSku = e.target.closest('[data-open-sku]');
      if (openSku) { goto('produk/' + openSku.dataset.openSku); return; }

      const mirrorBtn = e.target.closest('[data-mirror]');
      if (mirrorBtn) { state.mirrorSku = mirrorBtn.dataset.mirrorSku || state.currentSku; state.mirrorSize = null; goto('cermin'); return; }

      const orderOpen = e.target.closest('[data-order-open]');
      if (orderOpen) { goto('pesanan/' + orderOpen.dataset.orderOpen); return; }

      const gotoBtn = e.target.closest('[data-goto]');
      if (gotoBtn) {
        if (gotoBtn.dataset.goto === 'alamat') {
          state.addressReturn = gotoBtn.dataset.from === 'akun' ? 'akun' : (state.route === 'akun' ? 'akun' : 'pengiriman');
        }
        goto(gotoBtn.dataset.goto);
        return;
      }

      const tab = e.target.closest('.tab');
      if (tab) { goto(tab.dataset.tab); return; }

      // Stepper checkout: ketuk langkah sebelumnya untuk mundur
      const stepLi = e.target.closest('.steps-row li[data-step]');
      if (stepLi) {
        const target = { 1: 'bag', 2: 'pengiriman', 3: 'pembayaran' }[stepLi.dataset.step];
        const curIdx = { bag: 1, pengiriman: 2, pembayaran: 3 }[state.route] || 9;
        if (Number(stepLi.dataset.step) < curIdx) goto(target);
        return;
      }

      const t = e.target.closest('button');
      if (!t) {
        // Klik di luar autocomplete menutupnya
        if (!e.target.closest('.search-zone')) $('#autocomplete').hidden = true;
        return;
      }

      if (t.classList.contains('size-chip')) { state.selectedSize = t.dataset.size; renderSizesPdp(); updatePdpCta(); return; }
      if (t.dataset.preview) { state.previewSize = t.dataset.preview; renderFitting(); return; }
      if (t.dataset.qty) {
        const idx = Number(t.dataset.idx);
        const item = state.cart[idx];
        item.qty += Number(t.dataset.qty);
        if (item.qty <= 0) state.cart.splice(idx, 1);
        save(STORE.cart, state.cart);
        renderBadges(); renderBag();
        return;
      }
      if (t.dataset.remove !== undefined && t.dataset.remove !== '') {
        const idx = Number(t.dataset.remove);
        const item = state.cart[idx];
        state.cart.splice(idx, 1);
        save(STORE.cart, state.cart);
        renderBadges(); renderBag();
        toast(`Size ${item?.size || ''} dihapus dari tas.`);
        return;
      }
      if (t.dataset.unsave) {
        state.saved = state.saved.filter((s) => s !== t.dataset.unsave);
        save(STORE.saved, state.saved);
        renderBadges(); renderSaved();
        if (state.route === 'produk') $('#pdp-save').setAttribute('aria-pressed', state.saved.includes(state.currentSku) ? 'true' : 'false');
        return;
      }
      if (t.dataset.orderFeedback) { submitOrderFeedback(t.dataset.orderId, t.dataset.orderFeedback); return; }
      if (t.dataset.cat) { state.search.cat = t.dataset.cat; renderCatalog(); return; }
      if (t.id === 'catalog-reset') {
        state.search = { q: '', cat: 'Semua', sort: 'pop' };
        $('#search-input').value = '';
        $('#sort-select').value = 'pop';
        renderCatalog();
        return;
      }
      if (t.dataset.contact) { toast(`${t.dataset.contact}: saluran demo — di produksi membuka aplikasi terkait.`); return; }
      if (t.id === 'open-chat') { openChat(); return; }
      if (t.id === 'chat-close') { closeChat(); return; }
      if (t.id === 'toggle-reviews') { state.showAllReviews = !state.showAllReviews; renderPdp(state.currentSku); return; }
      if (t.id === 'open-review') { openReviewSheet(); return; }
      if (t.dataset.star) { state.reviewDraft.rating = Number(t.dataset.star); renderReviewStars(); return; }
      if (t.id === 'review-submit') { submitReview(); return; }
      if (t.hasAttribute('data-scroll-reviews')) {
        $('.review-summary')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (t.id === 'btn-logout') { logout(); return; }
      if (t.dataset.mirrorSize) {
        state.mirrorSize = t.dataset.mirrorSize;
        $$('#cermin-sizes .size-chip').forEach((c) => c.setAttribute('aria-checked', String(c === t)));
        return;
      }
      if (t.id === 'mirror-capture') { captureMirror(); return; }
      if (t.id === 'mirror-retry') { startMirror(); return; }
      if (t.id === 'open-size-chart') { renderSizeChart(); openSheet('sheet-size-chart'); return; }
      if (t.hasAttribute('data-close-sheet')) { closeSheet(); return; }
      if (t.classList.contains('thumb')) {
        $$('.thumb').forEach((b) => b.classList.toggle('is-active', b === t));
        $('#pdp-img').className = t.dataset.view === 'a' ? '' : 'view-' + t.dataset.view;
        return;
      }
      if (t.id === 'zoom-close') { closeZoom(); return; }
    });

    // PDP: tambah/save
    $('#pdp-add').addEventListener('click', () => {
      if (!state.selectedSize) return;
      addToCart(state.currentSku, state.selectedSize);
    });
    $('#pdp-save').addEventListener('click', () => {
      const sku = state.currentSku;
      const has = state.saved.includes(sku);
      state.saved = has ? state.saved.filter((s) => s !== sku) : [...state.saved, sku];
      save(STORE.saved, state.saved);
      renderBadges();
      $('#pdp-save').setAttribute('aria-pressed', !has ? 'true' : 'false');
      toast(has ? 'Dihapus dari simpanan.' : 'Produk disimpan. Lihat tab SAVED.');
    });

    // Zoom foto: klik gambar utama, double-tap untuk memperbesar
    document.addEventListener('click', (e) => {
      if (e.target.id === 'pdp-img') openZoom(e.target.src);
    });
    const stage = $('#zoom-stage');
    stage.addEventListener('dblclick', () => stage.classList.toggle('is-zoomed'));
    let lastTap = 0;
    stage.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 320) stage.classList.toggle('is-zoomed');
      lastTap = now;
    });
    $('#zoom-overlay').addEventListener('click', (e) => { if (e.target.id === 'zoom-overlay') closeZoom(); });

    // Sheet & escape
    $('#sheet-overlay').addEventListener('click', (e) => { if (e.target.id === 'sheet-overlay') closeSheet(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeSheet(); closeZoom(); closeChat(); $('#autocomplete').hidden = true; }
    });

    // Fitting
    $('#fitting-cta').addEventListener('click', () => {
      const p = prod(state.currentSku);
      if (!state.previewSize || !inStock(p, state.previewSize)) return;
      state.selectedSize = state.previewSize;
      addToCart(p.sku_id, state.previewSize);
      goto('bag');
    });

    // Studio
    ['#f-height', '#f-weight', '#f-age'].forEach((sel) => {
      $(sel).addEventListener('input', () => {
        $(sel).closest('.field').classList.remove('field--error');
        updateBmiHint();
      });
    });
    $('#shape-grid').addEventListener('change', updateShapeDesc);
    $('#studio-back').addEventListener('click', () => { state.studioStep = 1; renderStudio(); });
    $('#studio-next').addEventListener('click', () => {
      if (state.studioStep === 1) {
        const f = readStep1();
        if (!f) return;
        state.draft = f;
        state.studioStep = 2;
        renderStudio();
        return;
      }
      const d = state.draft || {};
      computeFromForm({
        ...d,
        fit: $('input[name="fit"]:checked').value,
        shape: $('input[name="shape"]:checked').value,
      });
      goto('fitting');
      const r = state.results[state.currentSku];
      toast(`Rekomendasi siap: Size ${r.best.size_label} · ${r.confidence}% cocok. Profil tersimpan.`);
    });

    // Login
    $('#auth-form').addEventListener('submit', handleAuthSubmit);
    $('#auth-tab-login').addEventListener('click', () => { state.authMode = 'login'; renderLogin(); });
    $('#auth-tab-reg').addEventListener('click', () => { state.authMode = 'register'; renderLogin(); });
    $('#auth-demo').addEventListener('click', () => {
      ensureDemoUser();
      if (state.authMode !== 'login') { state.authMode = 'login'; renderLogin(); }
      $('#a-email').value = DEMO_USER.email;
      $('#a-pass').value = DEMO_USER.pass;
      toast('Kredensial demo terisi — tekan Masuk.');
    });

    // Alamat
    $('#alamat-body').addEventListener('change', (e) => {
      if (e.target.id === 'ad-prov') { fillKota(); e.target.closest('.ff').classList.remove('ff--error'); }
    });
    $('#alamat-save').addEventListener('click', saveAddress);

    // Checkout
    $('#bag-cta').addEventListener('click', () => { if (cartCount()) goto('pengiriman'); });
    $('#pengiriman-body').addEventListener('change', (e) => {
      if (e.target.name === 'ship') { state.shippingId = e.target.value; persistBagPrefs(); }
    });
    $('#pengiriman-cta').addEventListener('click', () => { if (state.address) goto('pembayaran'); });
    $('#pembayaran-body').addEventListener('change', (e) => {
      if (e.target.name === 'pay') {
        state.payMethod = e.target.value;
        persistBagPrefs();
        const labels = Object.fromEntries(PAYMENTS);
        const note = $('#pembayaran-body .fineprint b');
        if (note) note.textContent = labels[state.payMethod];
        const cta = $('#pembayaran-cta');
        if (cta.textContent.startsWith('Bayar')) cta.textContent = `Bayar • ${fmtIDR(cartTotals().total)}`;
      }
    });
    $('#pembayaran-cta').addEventListener('click', pay);
    $('#pesanan-cta').addEventListener('click', () => goto('shop'));

    // Chat
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      chatPush('user', q);
      renderChat(true);
      setTimeout(() => {
        state.chat.push({ who: 'bot', text: botReply(q) });
        renderChat();
      }, 950);
    });

    // Pencarian katalog
    $('#search-input').addEventListener('input', (e) => {
      state.search.q = e.target.value;
      renderAutocomplete();
      renderCatalog();
    });
    $('#search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('#autocomplete').hidden = true; }
    });
    $('#search-clear').addEventListener('click', () => {
      state.search.q = '';
      $('#search-input').value = '';
      $('#autocomplete').hidden = true;
      renderCatalog();
    });
    $('#sort-select').addEventListener('change', (e) => {
      state.search.sort = e.target.value;
      renderCatalog();
    });

    // Voucher
    $('#bag-body').addEventListener('click', (e) => {
      if (e.target.closest('#voucher-apply')) {
        const code = ($('#voucher-input').value || '').trim().toUpperCase();
        if (VOUCHERS[code]) {
          state.voucher = { code, amount: VOUCHERS[code] };
          state.voucherError = '';
          persistBagPrefs(); renderBag();
          toast(`Voucher ${code} terpasang — potongan ${fmtIDR(VOUCHERS[code])}.`);
        } else {
          state.voucher = null;
          state.voucherError = 'Kode tidak valid atau kedaluwarsa.';
          renderBag();
        }
      }
      if (e.target.closest('#voucher-remove')) {
        state.voucher = null;
        persistBagPrefs(); renderBag();
      }
    });
  }

  /* -------------------------------------------------- kamera cermin: hemat baterai */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopMirror();
    } else if (state.route === 'cermin' && !state.mirror.on) {
      startMirror();
    }
  });

  /* -------------------------------------------------- ticker status pesanan */
  setInterval(() => {
    let changed = false;
    let arrived = null;
    state.orders.forEach((o) => {
      if (o.statusIndex < ORDER_STAGES.length - 1) {
        o.statusIndex += 1;
        o.timeline.push({ stage: o.statusIndex, at: new Date().toISOString() });
        changed = true;
        if (o.statusIndex === ORDER_STAGES.length - 1) arrived = o;
      }
    });
    if (!changed) return;
    save(STORE.orders, state.orders);
    if (state.route === 'pesanan') renderPesanan(state.param);
    if (state.route === 'akun') renderAkun();
    if (arrived) toast(`Pesanan ${arrived.id} tiba di ${arrived.address.kota} — selamat menikmati! 🎉`);
  }, STAGE_ADVANCE_MS);

  /* -------------------------------------------------- live viewers */
  setInterval(() => {
    state.viewers = Math.max(12, Math.min(47, state.viewers + Math.floor(Math.random() * 7) - 3));
    const el = $('#live-viewers');
    if (el && state.route === 'produk') el.textContent = state.viewers;
  }, 7000);

  /* -------------------------------------------------- init */
  function writeFormFromProfile(p) {
    if (!p) return;
    $('#f-height').value = p.metrics.height_cm;
    $('#f-weight').value = p.metrics.weight_kg;
    $('#f-age').value = p.age;
    const g = $(`input[name="gender"][value="${p.gender}"]`); if (g) g.checked = true;
    const f = $(`input[name="fit"][value="${p.fit_preference}"]`); if (f) f.checked = true;
    const s = $(`input[name="shape"][value="${p.metrics.body_shape}"]`); if (s) s.checked = true;
  }

  buildShapes();
  writeFormFromProfile(state.profile);
  if (state.profile) applyResultForCurrent();
  bind();
  renderBadges();
  applyRoute();

  // sinkronisasi awal dengan database (bila tersedia & punya sesi)
  Cloud.ping();
  if (state.auth && Cloud.token) syncPull(state.auth.email);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline-first opsional */ });
  }
})();
