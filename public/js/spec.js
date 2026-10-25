/**
 * Aura Atelier — prototype controller
 * Menghubungkan 4 layar: PDP → Kuesioner/Scan → Hasil Fit → Tas & Checkout → Micro-survey.
 * State disimpan di localStorage untuk mensimulasikan "Persistent User Body Profile".
 */
(function () {
  'use strict';

  const product = window.AURA_PRODUCT;
  const Engine = window.AuraSizeEngine;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const STORE = { profile: 'aura.profile.v1', cart: 'aura.cart.v1', feedback: 'aura.fitFeedback.v1' };
  const load = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage penuh / private mode */ } };

  const SHIPPING = 18000;
  const VOUCHER = { code: 'FITPERTAMA', amount: 45000 };

  const SHAPES = [
    { id: 'athletic', label: 'Atletis', path: 'M3 4 L19 4 L15 16 L16 28 L6 28 L7 16 Z', desc: 'Bahu & dada lebar, pinggang ramping.' },
    { id: 'rectangle', label: 'Lurus', path: 'M6 4 L16 4 L16.5 16 L16 28 L6 28 L5.5 16 Z', desc: 'Bahu, pinggang, dan pinggul relatif sejajar.' },
    { id: 'pear', label: 'Pir', path: 'M8 4 L14 4 L15 14 L19 28 L3 28 L7 14 Z', desc: 'Pinggul lebih lebar dari bahu.' },
    { id: 'hourglass', label: 'Jam Pasir', path: 'M4 4 L18 4 L13 15 L18 28 L4 28 L9 15 Z', desc: 'Dada & pinggul seimbang, pinggang terdefinisi.' },
    { id: 'inverted_triangle', label: 'Segitiga', path: 'M2 4 L20 4 L14 28 L8 28 Z', desc: 'Bahu jauh lebih lebar dari pinggul.' },
  ];
  const FIT_LABEL = { tight: 'Pas Tubuh', regular: 'Standar', oversized: 'Longgar' };
  const STATUS_LABEL = { fit: 'Pas', tight: 'Agak Ketat', loose: 'Agak Longgar' };

  const state = {
    selectedSize: null,
    profile: load(STORE.profile, null),
    result: null,
    previewSize: null,
    cart: load(STORE.cart, []),
    qStep: 1,
    method: 'quick',
    scan: 'idle', // idle | scanning | done
    payMethod: 'va',
  };

  const fmtIDR = (n) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const fmtK = (n) => 'Rp ' + Math.round(n / 1000) + 'k';
  const sizeByLabel = (label) => product.sizes.find((s) => s.size_label === label);
  const inStock = (label) => (product.stock[label] ?? 0) > 0;

  /* -------------------------------------------------- toast & journey */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  function setJourney(step) {
    $$('#journey .journey__step').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-active', n === step);
      li.classList.toggle('is-done', n < step);
    });
  }

  function focusScreen(n) {
    const col = $('#screen-' + n);
    col.classList.remove('is-focus');
    void col.offsetWidth; // restart animation
    col.classList.add('is-focus');
    col.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    setTimeout(() => col.classList.remove('is-focus'), 1400);
  }

  /* -------------------------------------------------- SCREEN 01: PDP */
  function renderPdpStatic() {
    $('#pdp-title').textContent = `${product.name} — ${product.variant}`;
    $('#pdp-price').textContent = fmtIDR(product.price);
    $('#pdp-compare').textContent = fmtIDR(product.compare_at_price);
    $('#fab-material').textContent = product.fabric_specs.material;
    $('#fab-stretch').textContent = `${product.fabric_specs.stretch_factor.toFixed(2)} (${Math.round((product.fabric_specs.stretch_factor - 1) * 100)}% stretch)`;
    $('#fab-shrink').textContent = `±${product.fabric_specs.shrinkage_after_wash_pct}%`;
    $('#pdp-viewers').textContent = 18 + Math.floor(Math.random() * 14);
  }

  function renderSizes() {
    const wrap = $('#pdp-sizes');
    const best = state.result?.best.size_label;
    wrap.innerHTML = product.sizes.map((s) => {
      const l = s.size_label;
      const checked = state.selectedSize === l;
      return `<button type="button" class="size-chip" role="radio" aria-checked="${checked}" data-size="${l}"
        ${inStock(l) ? '' : 'disabled aria-label="' + l + ', stok habis"'}>${l}${best === l ? '<span class="size-chip__ai">AI</span>' : ''}</button>`;
    }).join('');

    const note = $('#pdp-size-note');
    note.classList.remove('is-warn');
    if (!state.selectedSize) {
      note.textContent = best ? `AI merekomendasikan ${best} untuk profil Anda.` : 'Ragu ukuran? Coba AI Size Finder di bawah.';
    } else if (best && state.selectedSize !== best) {
      note.textContent = `Perhatian: AI merekomendasikan ${best}. Ukuran ${state.selectedSize} kemungkinan ${sizeIndex(state.selectedSize) < sizeIndex(best) ? 'terlalu ketat' : 'terlalu longgar'}.`;
      note.classList.add('is-warn');
    } else {
      const stock = product.stock[state.selectedSize];
      note.textContent = stock <= 5 ? `Sisa ${stock} pcs untuk ukuran ${state.selectedSize}.` : `Ukuran ${state.selectedSize} tersedia.`;
    }

    const btn = $('#pdp-add');
    btn.disabled = !state.selectedSize;
    btn.textContent = state.selectedSize ? `Tambahkan Keranjang • ${fmtK(product.price)}` : 'Pilih Ukuran Dulu';
  }

  const sizeIndex = (label) => product.sizes.findIndex((s) => s.size_label === label);

  function renderAiCard() {
    const card = $('#ai-card');
    const r = state.result;
    if (!r) {
      card.className = 'ai-card';
      card.innerHTML = `
        <div class="ai-card__row">
          <span class="ai-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg></span>
          <div><strong>Cari Ukuran Pas Anda (Cek 30 Detik)</strong><p>Rekomendasi dari 1.400+ pembeli serupa.</p></div>
        </div>
        <button type="button" class="btn btn--outline btn--block" data-action="open-finder">Hitung Fit Saya →</button>`;
      return;
    }
    const p = state.profile;
    card.className = 'ai-card ai-card--done';
    card.innerHTML = `
      <div class="ai-card__row">
        <span class="ai-card__icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></span>
        <div><strong>Ukuran Anda: ${r.best.size_label} — <span class="ai-card__match">${r.confidence}% Match</span></strong>
        <p>Profil "${p.profile_name}" · ${p.metrics.height_cm} cm / ${p.metrics.weight_kg} kg · ${FIT_LABEL[p.fit_preference]}</p></div>
      </div>
      <div class="row-between">
        <button type="button" class="link-btn" data-action="open-finder">Ubah profil</button>
        <button type="button" class="link-btn" data-action="see-result">Lihat detail fit →</button>
      </div>`;
  }

  function renderSizeChart() {
    const best = state.result?.best.size_label;
    $('#size-chart-body').innerHTML = product.sizes.map((s) => `
      <tr class="${best === s.size_label ? 'is-rec' : ''}">
        <td>${s.size_label}</td><td>${s.chest_width_cm}</td><td>${s.body_length_cm}</td><td>${s.shoulder_width_cm}</td><td>${s.sleeve_length_cm}</td>
      </tr>`).join('');
  }

  /* -------------------------------------------------- SCREEN 02: questionnaire */
  function renderShapes() {
    $('#shape-grid').innerHTML = SHAPES.map((s, i) => `
      <label class="shape"><input type="radio" name="shape" value="${s.id}" ${i === 0 ? 'checked' : ''}>
        <span><svg viewBox="0 0 22 32" aria-hidden="true"><circle cx="11" cy="2.2" r="2" /><path d="${s.path}" /></svg>${s.label}</span>
      </label>`).join('');
  }

  function syncRange(input) {
    const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty('--slider-progress', pct + '%');
    const unit = { 'in-height': ' cm', 'in-weight': ' kg', 'in-age': ' th' }[input.id];
    const out = $(`output[for="${input.id}"]`);
    out.textContent = input.value + unit;
    input.setAttribute('aria-valuetext', input.value + unit);
  }

  function updateBmiHint() {
    const h = Number($('#in-height').value) / 100;
    const w = Number($('#in-weight').value);
    const bmi = w / (h * h);
    const cat = bmi < 18.5 ? 'ramping' : bmi < 25 ? 'proporsional' : bmi < 30 ? 'berisi' : 'besar';
    $('#bmi-hint').textContent = `Indeks massa tubuh ${bmi.toFixed(1)} (${cat}). AI memakai ini untuk mengestimasi lingkar dada & pinggang.`;
  }

  function updateShapeDesc() {
    const v = $('input[name="shape"]:checked')?.value;
    $('#shape-desc').textContent = SHAPES.find((s) => s.id === v)?.desc ?? '';
  }

  function readForm() {
    return {
      gender: $('input[name="gender"]:checked').value,
      height_cm: Number($('#in-height').value),
      weight_kg: Number($('#in-weight').value),
      age: Number($('#in-age').value),
      fit_preference: $('input[name="fit"]:checked').value,
      body_shape: $('input[name="shape"]:checked').value,
    };
  }

  function writeForm(p) {
    if (!p) return;
    const set = (sel, v) => { const el = $(sel); if (el) el.checked = true; return v; };
    set(`input[name="gender"][value="${p.gender}"]`);
    set(`input[name="fit"][value="${p.fit_preference}"]`);
    set(`input[name="shape"][value="${p.metrics.body_shape}"]`);
    $('#in-height').value = p.metrics.height_cm;
    $('#in-weight').value = p.metrics.weight_kg;
    $('#in-age').value = p.age;
  }

  function renderQuestionnaire() {
    const quick = state.method === 'quick';
    $('#tab-quick').setAttribute('aria-selected', quick);
    $('#tab-camera').setAttribute('aria-selected', !quick);
    $('#panel-quick').hidden = !quick;
    $('#panel-camera').hidden = quick;

    $$('.q-step').forEach((fs) => { fs.hidden = Number(fs.dataset.qStep) !== state.qStep; });

    const pct = quick ? (state.qStep === 1 ? 50 : 100) : (state.scan === 'done' ? 100 : state.scan === 'scanning' ? 60 : 20);
    $('#q-progress').style.setProperty('--p', pct + '%');
    $('#q-progress').setAttribute('aria-valuenow', pct);
    $('#q-step-pct').textContent = pct + '%';
    $('#q-step-label').textContent = quick ? `Langkah ${state.qStep} dari 2` : 'Mode Akurasi Tinggi';

    const back = $('#q-back');
    const next = $('#q-next');
    back.hidden = !(quick && state.qStep === 2);
    next.disabled = false;
    if (quick) {
      next.textContent = state.qStep === 1 ? 'Lanjut →' : 'Lihat Rekomendasi Ukuran →';
    } else if (state.scan === 'idle') {
      next.textContent = 'Mulai Pemindaian (2 Pose)';
    } else if (state.scan === 'scanning') {
      next.textContent = 'Memindai…';
      next.disabled = true;
    } else {
      next.textContent = 'Lihat Rekomendasi Ukuran →';
    }
  }

  function runScan() {
    const stage = $('#scan-stage');
    const status = $('#scan-status');
    state.scan = 'scanning';
    stage.dataset.state = 'scanning';
    $('#pose-front').hidden = false;
    $('#pose-side').hidden = true;
    status.textContent = 'Pose 1/2 · Memindai tampak depan…';
    renderQuestionnaire();
    setJourney(2);

    setTimeout(() => {
      $('#pose-front').hidden = true;
      $('#pose-side').hidden = false;
      status.textContent = 'Pose 2/2 · Putar badan 90° ke kanan…';
    }, 1700);
    setTimeout(() => {
      state.scan = 'done';
      stage.dataset.state = 'done';
      status.textContent = 'Kontur terekstraksi · 33 keypoints · foto dihapus';
      renderQuestionnaire();
    }, 3400);
  }

  /* -------------------------------------------------- compute recommendation */
  function computeFromForm(method) {
    const f = readForm();
    const now = new Date().toISOString();
    const metrics = { height_cm: f.height_cm, weight_kg: f.weight_kg, body_shape: f.body_shape };

    let body = Engine.estimateBody({ ...f });
    if (method === 'camera_scan') {
      // Simulasi output SDK kamera: hasil ukur sedikit berbeda dari estimasi statistik.
      const j = (seed) => Math.round((Math.sin(f.height_cm * seed + f.weight_kg) * 0.9) * 10) / 10;
      body = { ...body,
        estimated_chest_cm: +(body.estimated_chest_cm + j(1.3)).toFixed(1),
        estimated_waist_cm: +(body.estimated_waist_cm + j(2.1)).toFixed(1),
        estimated_hips_cm: +(body.estimated_hips_cm + j(0.7)).toFixed(1),
        estimated_shoulder_cm: +(body.estimated_shoulder_cm + j(1.9)).toFixed(1) };
    }

    // Mengikuti skema `user_body_profile` pada blueprint (Bagian 5B)
    state.profile = {
      user_id: 'usr_demo_001',
      profile_name: 'My Fit',
      gender: f.gender,
      age: f.age,
      input_method: method === 'camera_scan' ? 'camera_scan' : 'questionnaire_v1',
      metrics: { ...metrics, ...body },
      fit_preference: f.fit_preference,
      created_at: state.profile?.created_at ?? now,
      updated_at: now,
    };
    save(STORE.profile, state.profile);
    applyResult();
  }

  function applyResult() {
    if (!state.profile) { state.result = null; return; }
    state.result = Engine.recommend(state.profile, product);
    state.previewSize = state.result.best.size_label;
    if (!state.selectedSize && inStock(state.result.best.size_label)) state.selectedSize = state.result.best.size_label;
    renderAll();
  }

  /* -------------------------------------------------- SCREEN 03: result */
  const zoneCopy = {
    shoulder: (z) => ({ fit: 'Drop-shoulder jatuh pas', tight: 'Bahu terasa sempit', loose: 'Bahu turun berlebih' }[z.status]),
    chest: (z) => ({ fit: `${z.ease >= 0 ? '+' : ''}${z.ease} cm ruang gerak`, tight: `Hanya ${z.ease} cm ruang gerak`, loose: `+${z.ease} cm, terlalu lapang` }[z.status]),
    length: (z) => ({ fit: 'Jatuh di atas pinggul', tight: 'Cenderung pendek (crop)', loose: 'Melewati pinggul' }[z.status]),
  };
  const ZONE_NAME = { shoulder: 'Bahu (Shoulder)', chest: 'Dada (Chest)', length: 'Panjang (Length)' };
  const ZONE_TOL = { chest: 3.5, shoulder: 2.5, length: 2.5 };

  function teeSvg(zones) {
    return `
      <svg class="tee-svg" viewBox="0 0 120 112" role="img" aria-label="Visualisasi fit: bahu ${STATUS_LABEL[zones.shoulder.status]}, dada ${STATUS_LABEL[zones.chest.status]}, panjang ${STATUS_LABEL[zones.length.status]}">
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

  function renderResult() {
    const body = $('#result-body');
    const addBtn = $('#result-add');
    const r = state.result;

    if (!r) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/></svg></div>
          <p class="serif-sm">Belum ada profil tubuh</p>
          <p class="muted-sm">Isi kuesioner 30 detik di Layar 02 untuk melihat ukuran tepat &amp; peta fit per zona.</p>
          <div class="skeleton" style="width:80%;margin:6px auto 0"></div>
          <div class="skeleton" style="width:60%;margin:0 auto"></div>
          <button type="button" class="btn btn--outline" data-action="open-finder">Isi Kuesioner →</button>
        </div>`;
      addBtn.disabled = true;
      addBtn.textContent = 'Lengkapi Kuesioner Dulu';
      return;
    }

    const preview = r.ranked.find((x) => x.size_label === state.previewSize) || r.best;
    const isBest = preview.size_label === r.best.size_label;
    const alt = isBest ? r.alternative : r.best;
    const p = state.profile;
    const circ = 2 * Math.PI * 26;
    const shownConf = isBest ? r.confidence : Math.round(preview.score * (p.input_method === 'camera_scan' ? 1 : 0.97));
    const proof = Math.max(72, Math.min(96, r.confidence - 6 + (p.metrics.height_cm % 5)));
    const s = sizeByLabel(preview.size_label);
    const sa = sizeByLabel(alt.size_label);

    body.innerHTML = `
      <div class="result">
        <div>
          <p class="result__eyebrow">${isBest ? 'Hasil Analisis' : 'Pratinjau Ukuran Lain'}</p>
          <div class="result__head">
            <div>
              <h3 class="result__title">Ukuran ${isBest ? 'Tepat' : 'Dicek'}: <em>Size ${preview.size_label}</em></h3>
              <p class="result__sub">${isBest ? 'Potongan boxy jatuh presisi di bahu & dada.' : `AI tetap merekomendasikan ${r.best.size_label}.`}</p>
            </div>
            <div class="ring" aria-label="${shownConf}% kecocokan">
              <svg viewBox="0 0 62 62" aria-hidden="true">
                <circle class="ring__bg" cx="31" cy="31" r="26"/>
                <circle class="ring__fg" cx="31" cy="31" r="26" stroke-dasharray="${circ}" stroke-dashoffset="${circ}" data-offset="${circ * (1 - shownConf / 100)}" style="${shownConf < 75 ? 'stroke:var(--accent)' : ''}"/>
              </svg>
              <span class="ring__label"><b>${shownConf}%</b><small>MATCH</small></span>
            </div>
          </div>
        </div>

        <span class="method-badge">${p.input_method === 'camera_scan' ? '◉ Scan kamera · presisi tinggi' : '◎ Kuesioner · ' + FIT_LABEL[p.fit_preference]}</span>

        ${isBest ? `<div class="proof"><span class="proof__check">✓</span><span><b>${proof}% pembeli</b> dengan TB ${p.metrics.height_cm} / BB ${p.metrics.weight_kg} kg memilih ${r.best.size_label} &amp; tidak mengembalikannya. <span class="muted-sm">(data demo)</span></span></div>` : ''}

        <div class="fit-visual">
          ${teeSvg(preview.zones)}
          <div class="legend">
            <span><i style="background:#CFE5D8"></i>Pas</span>
            <span><i style="background:#F1C9BA"></i>Agak ketat</span>
            <span><i style="background:#F0E0B4"></i>Agak longgar</span>
          </div>
        </div>

        <div>
          <p class="label-xs" style="margin-bottom:8px">Tingkat Jatuh Garmen</p>
          <div class="zones">
            ${['shoulder', 'chest', 'length'].map((k) => {
              const z = preview.zones[k];
              const x = Math.max(4, Math.min(96, 50 + (z.diff / ZONE_TOL[k]) * 22));
              return `<div class="zone-row">
                <div class="zone-row__top"><b>${ZONE_NAME[k]}</b><span class="zone-row__status is-${z.status}">${zoneCopy[k](z)}</span></div>
                <div class="zone-bar" role="img" aria-label="${ZONE_NAME[k]}: ${STATUS_LABEL[z.status]}"><span class="zone-bar__marker" style="--x:${x}%"></span></div>
                <div class="zone-bar__scale" aria-hidden="true"><span>Ketat</span><span>Pas</span><span>Longgar</span></div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div>
          <p class="label-xs" style="margin-bottom:8px">Bandingkan Ukuran</p>
          <div class="size-compare" role="group" aria-label="Pratinjau fit ukuran lain">
            ${product.sizes.map((sz) => {
              const sc = r.ranked.find((x) => x.size_label === sz.size_label);
              return `<button type="button" data-preview="${sz.size_label}" aria-pressed="${sz.size_label === preview.size_label}" class="${sz.size_label === r.best.size_label ? 'is-best' : ''}">${sz.size_label}<small>${sc.score}%</small></button>`;
            }).join('')}
          </div>
        </div>

        <table class="spec-table">
          <thead><tr><th>Bagian</th><th>Size ${s.size_label}${isBest ? ' (Pilihan)' : ''}</th><th>Size ${sa.size_label}</th></tr></thead>
          <tbody>
            <tr><td>Lebar Dada</td><td>${s.chest_width_cm.toFixed(1)} cm</td><td class="muted">${sa.chest_width_cm.toFixed(1)} cm</td></tr>
            <tr><td>Panjang Badan</td><td>${s.body_length_cm.toFixed(1)} cm</td><td class="muted">${sa.body_length_cm.toFixed(1)} cm</td></tr>
            <tr><td>Lebar Bahu</td><td>${s.shoulder_width_cm.toFixed(1)} cm</td><td class="muted">${sa.shoulder_width_cm.toFixed(1)} cm</td></tr>
          </tbody>
        </table>

        <div>
          <p class="label-xs" style="margin-bottom:6px">Estimasi Dimensi Tubuh</p>
          <dl class="body-estimate">
            <div><dt>Dada</dt><dd>${p.metrics.estimated_chest_cm}</dd></div>
            <div><dt>Pinggang</dt><dd>${p.metrics.estimated_waist_cm}</dd></div>
            <div><dt>Pinggul</dt><dd>${p.metrics.estimated_hips_cm}</dd></div>
          </dl>
          <p class="fineprint">Sudah memperhitungkan stretch kain ${Math.round((product.fabric_specs.stretch_factor - 1) * 100)}% &amp; susut cuci ${product.fabric_specs.shrinkage_after_wash_pct}%.</p>
        </div>
      </div>`;

    // Animate ring after paint
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const fg = $('.ring__fg', body);
      if (fg) fg.style.strokeDashoffset = fg.dataset.offset;
    }));

    const available = inStock(preview.size_label);
    addBtn.disabled = !available;
    addBtn.textContent = available ? `Tambahkan ke Tas (Size ${preview.size_label})` : `Size ${preview.size_label} Stok Habis`;
  }

  /* -------------------------------------------------- SCREEN 04: cart */
  function addToCart(size) {
    const r = state.result;
    const verified = !!r && r.best.size_label === size;
    const existing = state.cart.find((i) => i.size === size);
    if (existing) existing.qty += 1;
    else state.cart.push({ sku: product.sku_id, size, qty: 1, verified, confidence: verified ? r.confidence : null });
    save(STORE.cart, state.cart);
    renderCart();
    const badge = $('#bag-count');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
    toast(verified ? `Size ${size} masuk tas — terverifikasi AI (${r.confidence}% match).` : `Size ${size} masuk tas.`);
    setJourney(4);
    focusScreen(4);
  }

  function cartTotals() {
    const subtotal = state.cart.reduce((a, i) => a + i.qty * product.price, 0);
    const discount = state.cart.some((i) => i.verified) ? VOUCHER.amount : 0;
    const shipping = subtotal > 0 ? SHIPPING : 0;
    return { subtotal, discount, shipping, total: Math.max(0, subtotal + shipping - discount) };
  }

  function renderCart() {
    const count = state.cart.reduce((a, i) => a + i.qty, 0);
    $('#cart-count-label').textContent = `${count} item`;
    const badge = $('#bag-count');
    badge.hidden = count === 0;
    badge.textContent = count;

    const body = $('#cart-body');
    const pay = $('#cart-pay');
    if (!count) {
      body.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg></div>
          <p class="serif-sm">Tas masih kosong</p>
          <p class="muted-sm">Ukuran yang direkomendasikan AI otomatis mendapat lencana terverifikasi &amp; voucher ${VOUCHER.code}.</p>
        </div>`;
      pay.disabled = true;
      pay.textContent = 'Tas Masih Kosong';
      return;
    }

    const t = cartTotals();
    const anyVerified = state.cart.some((i) => i.verified);
    body.innerHTML = `
      <div class="guarantee"><span aria-hidden="true">🛡</span><span><b>Jaminan Ukuran Pas:</b> ${anyVerified ? 'profil fit tersimpan, tukar ukuran gratis bila tidak pas.' : 'gunakan rekomendasi AI agar tukar ukuran gratis.'}</span></div>
      <ul class="cart-list">
        ${state.cart.map((i, idx) => `
          <li class="cart-item">
            <img src="${product.image}" alt="" width="62" height="78" loading="lazy">
            <div>
              <p class="cart-item__name">${product.name}</p>
              <p class="cart-item__meta">Ukuran ${i.size} · ${product.variant}</p>
              ${i.verified ? `<span class="ai-verified">✓ Rekomendasi AI · ${i.confidence}%</span>` : `<span class="ai-unverified">Belum diverifikasi AI</span>`}
              <div class="cart-item__foot">
                <span class="cart-item__price">${fmtIDR(product.price * i.qty)}</span>
                <span class="stepper" role="group" aria-label="Jumlah size ${i.size}">
                  <button type="button" data-qty="-1" data-idx="${idx}" aria-label="Kurangi">−</button>
                  <span>${i.qty}</span>
                  <button type="button" data-qty="1" data-idx="${idx}" aria-label="Tambah">+</button>
                </span>
              </div>
            </div>
          </li>`).join('')}
      </ul>

      <p class="label-xs">Metode Pembayaran</p>
      <div class="pay-methods" role="radiogroup" aria-label="Metode pembayaran">
        ${[['va', 'Virtual Account'], ['ewallet', 'E-Wallet'], ['cc', 'Kartu Kredit'], ['paylater', 'PayLater']].map(([v, l]) =>
          `<label><input type="radio" name="pay" value="${v}" ${state.payMethod === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>

      <dl class="summary">
        <div><dt>Subtotal</dt><dd>${fmtIDR(t.subtotal)}</dd></div>
        <div><dt>Pengiriman (Reguler)</dt><dd>${fmtIDR(t.shipping)}</dd></div>
        ${t.discount ? `<div class="is-discount"><dt>Voucher (${VOUCHER.code})</dt><dd>−${fmtIDR(t.discount)}</dd></div>` : ''}
        <div class="is-total"><dt>Total Tagihan</dt><dd>${fmtIDR(t.total)}</dd></div>
      </dl>
      <div class="trust-badges"><span>Tukar Ukuran 7 Hari</span><span>100% Original</span></div>`;

    pay.disabled = false;
    pay.textContent = `Lanjut ke Pembayaran • ${fmtK(t.total)}`;
  }

  function checkout() {
    const labels = { va: 'Virtual Account', ewallet: 'E-Wallet', cc: 'Kartu Kredit', paylater: 'PayLater' };
    const orderId = 'AA-' + Date.now().toString(36).toUpperCase().slice(-6);
    state.lastOrder = { id: orderId, items: state.cart.map((i) => ({ ...i })) };
    toast(`Pembayaran via ${labels[state.payMethod]} berhasil (simulasi). Pesanan ${orderId} dikirim.`);
    $('#survey-order').textContent = `Pesanan ${orderId} · Diterima`;
    setTimeout(() => { $('#survey-sheet').hidden = false; $('.survey-opt--good').focus(); }, 1100);
  }

  function submitFeedback(value) {
    const log = load(STORE.feedback, []);
    const items = state.lastOrder?.items ?? [];
    items.forEach((i) => log.push({
      order_id: state.lastOrder.id, sku_id: i.sku, size: i.size, ai_recommended: i.verified,
      feedback: value, profile: state.profile ? { height_cm: state.profile.metrics.height_cm, weight_kg: state.profile.metrics.weight_kg, fit_preference: state.profile.fit_preference } : null,
      at: new Date().toISOString(),
    }));
    save(STORE.feedback, log);
    $('#survey-sheet').hidden = true;
    state.cart = [];
    save(STORE.cart, state.cart);
    renderCart();
    $$('#journey .journey__step').forEach((li) => { li.classList.remove('is-active'); li.classList.add('is-done'); });
    const msg = { perfect: 'Terima kasih! Data "Pas" memperkuat akurasi AI.', too_small: 'Tercatat "Kekecilan" — tukar ukuran gratis diproses & model dikalibrasi.', too_big: 'Tercatat "Kebesaran" — tukar ukuran gratis diproses & model dikalibrasi.' }[value];
    toast(`${msg} (${log.length} data loop tersimpan)`);
  }

  /* -------------------------------------------------- render all */
  function renderAll() {
    renderSizes();
    renderAiCard();
    renderSizeChart();
    renderResult();
    renderCart();
  }

  /* -------------------------------------------------- events */
  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-action]');
      if (!t) return;

      if (t.matches('.size-chip')) {
        state.selectedSize = t.dataset.size;
        renderSizes();
        setJourney(1);
        return;
      }
      if (t.dataset.action === 'open-finder') {
        state.method = 'quick'; state.qStep = 1;
        renderQuestionnaire(); setJourney(2); focusScreen(2);
        setTimeout(() => $('input[name="gender"]:checked').focus({ preventScroll: true }), 400);
        return;
      }
      if (t.dataset.action === 'see-result') { setJourney(3); focusScreen(3); return; }
      if (t.dataset.preview) { state.previewSize = t.dataset.preview; renderResult(); return; }
      if (t.dataset.qty) {
        const item = state.cart[Number(t.dataset.idx)];
        item.qty += Number(t.dataset.qty);
        if (item.qty <= 0) state.cart.splice(Number(t.dataset.idx), 1);
        save(STORE.cart, state.cart);
        renderCart();
        return;
      }
      if (t.dataset.feedback) { submitFeedback(t.dataset.feedback); return; }
      if (t.hasAttribute('data-close-sheet')) { t.closest('.sheet-overlay').hidden = true; return; }
    });

    $('#pdp-add').addEventListener('click', () => { if (state.selectedSize) addToCart(state.selectedSize); });
    $('#pdp-bag-btn').addEventListener('click', () => { setJourney(4); focusScreen(4); });
    $('#btn-size-chart').addEventListener('click', () => { $('#size-chart-sheet').hidden = false; $('#size-chart-sheet [data-close-sheet]').focus(); });
    $('#size-chart-sheet').addEventListener('click', (e) => { if (e.target.id === 'size-chart-sheet') e.currentTarget.hidden = true; });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') $$('.sheet-overlay').forEach((o) => { if (o.id !== 'survey-sheet') o.hidden = true; });
    });

    // Questionnaire
    $$('#panel-quick input[type="range"]').forEach((r) => {
      syncRange(r);
      r.addEventListener('input', () => { syncRange(r); updateBmiHint(); });
    });
    $('#panel-quick').addEventListener('change', (e) => { if (e.target.name === 'shape') updateShapeDesc(); setJourney(2); });
    $('#tab-quick').addEventListener('click', () => { state.method = 'quick'; renderQuestionnaire(); });
    $('#tab-camera').addEventListener('click', () => { state.method = 'camera'; renderQuestionnaire(); });
    $('#q-back').addEventListener('click', () => { state.qStep = 1; renderQuestionnaire(); });
    $('#q-next').addEventListener('click', () => {
      if (state.method === 'quick') {
        if (state.qStep === 1) { state.qStep = 2; renderQuestionnaire(); setJourney(2); return; }
        computeFromForm('questionnaire_v1');
      } else {
        if (state.scan === 'idle') { runScan(); return; }
        if (state.scan !== 'done') return;
        computeFromForm('camera_scan');
      }
      setJourney(3);
      focusScreen(3);
      toast(`Rekomendasi siap: Size ${state.result.best.size_label} · ${state.result.confidence}% match. Profil tersimpan.`);
    });

    // Result & cart
    $('#result-add').addEventListener('click', () => { if (state.previewSize) addToCart(state.previewSize); });
    $('#cart-body').addEventListener('change', (e) => { if (e.target.name === 'pay') state.payMethod = e.target.value; });
    $('#cart-pay').addEventListener('click', checkout);

    // Toolbar
    $('#btn-print').addEventListener('click', () => window.print());
    $('#btn-copy-prompt').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText($('#prompt-text').textContent.trim());
        e.target.textContent = 'Tersalin ✓';
      } catch { e.target.textContent = 'Gagal menyalin'; }
      setTimeout(() => { e.target.textContent = 'Salin Prompt'; }, 1800);
    });
  }

  /* -------------------------------------------------- init */
  renderPdpStatic();
  renderShapes();
  writeForm(state.profile);
  updateBmiHint();
  updateShapeDesc();
  bind();
  renderQuestionnaire();
  if (state.profile) applyResult(); else renderAll();
})();
