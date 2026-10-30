/**
 * Aura Atelier — AI Size Engine (prototype rule engine)
 * ------------------------------------------------------
 * Mesin rekomendasi ukuran hibrida versi MVP:
 *   1. Body Estimator   : TB/BB/usia/gender/bentuk tubuh  -> estimasi lingkar tubuh (cm)
 *   2. Garment Calibrator: stretch_factor & shrinkage per SKU -> dimensi efektif garmen
 *   3. Fit Matcher       : bandingkan "ease" (ruang gerak) per zona vs target preferensi fit + kontur pinggang/pinggul
 *   4. Confidence Score  : skor 0-100 + status heatmap per zona (Ketat / Pas / Longgar)
 *
 * Catatan: koefisien estimator adalah heuristik antropometri untuk prototipe.
 * Di produksi, langkah (1) digantikan oleh output Sizekick / 3DLOOK SDK,
 * sedangkan langkah (2)-(4) tetap menjadi proprietary rule engine internal.
 * Modul ini sengaja bebas DOM agar mudah di-port ke backend (NestJS / Go).
 */
(function (global) {
  'use strict';

  /** Penyesuaian bentuk tubuh (cm) terhadap estimasi dasar. */
  const BODY_SHAPE_ADJUST = {
    athletic:          { chest: +2.0, waist: -2.0, hips: 0.0,  shoulder: +1.5 },
    rectangle:         { chest: 0.0,  waist: +2.0, hips: 0.0,  shoulder: 0.0 },
    pear:              { chest: -1.5, waist: 0.0,  hips: +4.0, shoulder: -1.0 },
    hourglass:         { chest: +1.5, waist: -3.0, hips: +2.0, shoulder: 0.0 },
    oval:              { chest: +2.5, waist: +4.5, hips: +1.5, shoulder: -0.5 },
    inverted_triangle: { chest: +2.5, waist: 0.0,  hips: -2.0, shoulder: +2.0 },
  };

  /** Target ease (cm) di dada berdasarkan preferensi fit pengguna. */
  const FIT_PREFERENCE_EASE = {
    tight:     { chest: 4,  shoulder: 0, lengthRatio: 0.395 },
    regular:   { chest: 9,  shoulder: 2, lengthRatio: 0.405 },
    oversized: { chest: 14, shoulder: 4, lengthRatio: 0.415 },
  };

  /** Toleransi (cm) sebelum sebuah zona dianggap ketat / longgar. */
  const ZONE_TOLERANCE = { chest: 3.5, shoulder: 2.5, length: 2.5 };
  const ZONE_WEIGHT = { chest: 0.5, shoulder: 0.3, length: 0.2 };

  const round1 = (n) => Math.round(n * 10) / 10;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  /**
   * Menganalisis riwayat feedback pesanan pengguna untuk pembelajaran adaptif (category-aware).
   */
  function computeFeedbackBias(feedbackList = [], targetSku) {
    if (!feedbackList || !feedbackList.length) {
      return { chestBiasCm: 0, shoulderBiasCm: 0, confidenceDelta: 0, appliedCount: 0, summaryNote: '' };
    }
    const recent = feedbackList.slice(-10);
    const targetPrefix = targetSku ? String(targetSku).split('-')[0] : '';
    let weightedNet = 0, tooSmall = 0, tooBig = 0, perfect = 0;

    for (const item of recent) {
      const itemPrefix = item.sku_id ? String(item.sku_id).split('-')[0] : '';
      const relWeight = !targetSku || item.sku_id === targetSku ? 1.25 : itemPrefix === targetPrefix ? 1.0 : 0.65;
      if (item.feedback === 'too_small') {
        tooSmall++;
        weightedNet += 1 * relWeight;
      } else if (item.feedback === 'too_big') {
        tooBig++;
        weightedNet -= 1 * relWeight;
      } else if (item.feedback === 'perfect') {
        perfect++;
      }
    }

    const chestBiasCm = clamp(weightedNet * 1.5, -4.5, 4.5);
    const shoulderBiasCm = clamp(weightedNet * 0.75, -2.5, 2.5);
    const confidenceDelta = clamp(perfect * 2 - (tooSmall + tooBig) * 1.5, -6, 8);

    let summaryNote = '';
    if (chestBiasCm > 0.2) {
      summaryNote = `AI Terkalibrasi: preferensi disesuaikan +${chestBiasCm.toFixed(1)} cm dari feedback pesanan sebelumnya.`;
    } else if (chestBiasCm < -0.2) {
      summaryNote = `AI Terkalibrasi: preferensi disesuaikan ${chestBiasCm.toFixed(1)} cm dari feedback pesanan sebelumnya.`;
    } else if (perfect > 0) {
      summaryNote = `AI Terkalibrasi: ${perfect} pesanan terkonfirmasi pas sempurna.`;
    }
    return {
      chestBiasCm: round1(chestBiasCm),
      shoulderBiasCm: round1(shoulderBiasCm),
      confidenceDelta: Math.round(confidenceDelta),
      appliedCount: recent.length,
      summaryNote,
    };
  }

  /**
   * (1) Estimasi dimensi tubuh dari kuesioner.
   * @param {{gender:'male'|'female', height_cm:number, weight_kg:number, age:number, body_shape:string}} input
   */
  function estimateBody(input) {
    const { gender, height_cm: h, weight_kg: w, age } = input;
    const adj = BODY_SHAPE_ADJUST[input.body_shape] || BODY_SHAPE_ADJUST.rectangle;
    const ageAdj = clamp((age - 30) * 0.15, -2, 4);

    const bmi = w / ((h / 100) * (h / 100));
    const bmiAdjChest = clamp((bmi - 22) * 0.45, -2.5, 3.5);
    const bmiAdjWaist = clamp((bmi - 22) * 0.65, -3, 4.5);

    let chest, waist, hips, shoulder;
    if (gender === 'female') {
      chest = 0.2 * h + 0.72 * w + 12 + bmiAdjChest;
      waist = 0.85 * w + 0.1 * h + 3 + ageAdj + bmiAdjWaist;
      hips = 0.65 * w + 0.33 * h + 4;
      shoulder = 0.21 * h + 0.1 * w;
    } else {
      chest = 0.22 * h + 0.7 * w + 9 + bmiAdjChest;
      waist = 0.9 * w + 0.12 * h - 2 + ageAdj + bmiAdjWaist;
      hips = 0.55 * w + 0.32 * h + 3;
      shoulder = 0.21 * h + 0.09 * w;
    }

    return {
      height_cm: h,
      weight_kg: w,
      estimated_chest_cm: round1(chest + adj.chest),
      estimated_waist_cm: round1(waist + adj.waist),
      estimated_hips_cm: round1(hips + adj.hips),
      estimated_shoulder_cm: round1(shoulder + adj.shoulder),
      estimated_sleeve_cm: round1(0.34 * h),
      estimated_torso_cm: round1(0.40 * h),
    };
  }

  /**
   * (2) Kalibrasi garmen: lingkar dada efektif setelah susut cuci & kelenturan kain.
   */
  function calibrateGarment(size, fabric) {
    const shrink = 1 - (fabric.shrinkage_after_wash_pct || 0) / 100;
    const chestCirc = size.chest_width_cm * 2 * shrink;
    return {
      chest_circ_cm: round1(chestCirc),
      chest_circ_max_stretch_cm: round1(chestCirc * (fabric.stretch_factor || 1)),
      shoulder_cm: round1(size.shoulder_width_cm * shrink),
      length_cm: round1(size.body_length_cm * shrink),
      sleeve_cm: round1((size.sleeve_length_cm || 0) * shrink),
    };
  }

  function zoneStatus(diff, tol) {
    if (diff < -tol) return 'tight';
    if (diff > tol) return 'loose';
    return 'fit';
  }

  /** (3) Skor satu ukuran terhadap tubuh pengguna. */
  function scoreSize(body, size, product, preference, bias) {
    const pref = FIT_PREFERENCE_EASE[preference] || FIT_PREFERENCE_EASE.regular;
    const g = calibrateGarment(size, product.fabric_specs);
    const cut = product.cut_ease || { chest: 0, shoulder: 0 };
    const bChest = (bias && bias.chestBiasCm) || 0;
    const bShoulder = (bias && bias.shoulderBiasCm) || 0;

    const effectiveTorsoCirc = Math.max(
      body.estimated_chest_cm || 0,
      (body.estimated_waist_cm || 0) + 2,
      (body.estimated_hips_cm || 0) - 4
    );

    const rawChestEase = g.chest_circ_cm - effectiveTorsoCirc;
    const chestEase = rawChestEase < 0 ? g.chest_circ_max_stretch_cm - effectiveTorsoCirc : rawChestEase;
    const chestDiff = chestEase - (pref.chest + cut.chest + bChest);

    const shoulderEase = g.shoulder_cm - body.estimated_shoulder_cm;
    const shoulderDiff = shoulderEase - (pref.shoulder + cut.shoulder + bShoulder);

    const idealLength = body.height_cm * pref.lengthRatio;
    const lengthDiff = g.length_cm - idealLength;

    const zones = {
      chest: { ease: round1(chestEase), diff: round1(chestDiff), status: zoneStatus(chestDiff, ZONE_TOLERANCE.chest) },
      shoulder: { ease: round1(shoulderEase), diff: round1(shoulderDiff), status: zoneStatus(shoulderDiff, ZONE_TOLERANCE.shoulder) },
      length: { ease: round1(lengthDiff), diff: round1(lengthDiff), status: zoneStatus(lengthDiff, ZONE_TOLERANCE.length) },
    };

    let penalty = 0;
    for (const key of Object.keys(zones)) {
      const d = zones[key].diff;
      const norm = (d < 0 ? d * 1.4 : d) / (ZONE_TOLERANCE[key] * 2.2);
      penalty += ZONE_WEIGHT[key] * norm * norm;
    }
    if (body.estimated_waist_cm && g.chest_circ_max_stretch_cm < body.estimated_waist_cm + 2) {
      const waistDeficit = (body.estimated_waist_cm + 2) - g.chest_circ_max_stretch_cm;
      penalty += 0.18 * Math.pow(waistDeficit / 4, 2);
    }
    const score = clamp(100 * Math.exp(-penalty * 0.9), 0, 100);

    const stockCount = (product.stock && product.stock[size.size_label]) ?? 0;
    const inStock = stockCount > 0;

    return { size_label: size.size_label, score: Math.round(score), zones, garment: g, inStock, stockCount };
  }

  const SKIN_TONES = [
    { id: 'fair_cool', label: 'Terang · Cool Undertone', shortLabel: 'Terang (Cool)', undertone: 'cool', season: 'Cool Winter / Summer', hex: '#F3D3C4' },
    { id: 'light_warm', label: 'Cerah · Warm Undertone', shortLabel: 'Cerah (Warm)', undertone: 'warm', season: 'Warm Spring', hex: '#EBC1A1' },
    { id: 'medium_warm', label: 'Kuning Langsat · Warm-Neutral', shortLabel: 'Kuning Langsat', undertone: 'warm', season: 'Warm Autumn / Spring', hex: '#DDA67E' },
    { id: 'olive_neutral', label: 'Olive · Neutral Undertone', shortLabel: 'Olive (Netral)', undertone: 'neutral', season: 'Soft Autumn / Neutral', hex: '#C6906A' },
    { id: 'tan_warm', label: 'Sawo Matang · Golden Warm', shortLabel: 'Sawo Matang', undertone: 'warm', season: 'Deep Autumn', hex: '#AE744D' },
    { id: 'deep_rich', label: 'Eksotis Gelap · Deep Rich', shortLabel: 'Eksotis (Deep)', undertone: 'cool', season: 'Deep Winter', hex: '#7C4D34' },
  ];

  const GARMENT_COLOR_SPECS = {
    '04 Noir':   { hex: '#1F1F23', undertone: 'cool',    scores: { fair_cool: 97, light_warm: 90, medium_warm: 92, olive_neutral: 95, tan_warm: 91, deep_rich: 94 } },
    '05 Bone':   { hex: '#E8E2D4', undertone: 'warm',    scores: { fair_cool: 86, light_warm: 95, medium_warm: 97, olive_neutral: 96, tan_warm: 98, deep_rich: 96 } },
    '06 Slate':  { hex: '#6E7278', undertone: 'cool',    scores: { fair_cool: 96, light_warm: 88, medium_warm: 89, olive_neutral: 94, tan_warm: 88, deep_rich: 93 } },
    '07 Ink':    { hex: '#26282E', undertone: 'cool',    scores: { fair_cool: 98, light_warm: 91, medium_warm: 92, olive_neutral: 95, tan_warm: 90, deep_rich: 96 } },
    '08 Carbon': { hex: '#313136', undertone: 'neutral', scores: { fair_cool: 94, light_warm: 92, medium_warm: 94, olive_neutral: 97, tan_warm: 93, deep_rich: 92 } },
    '09 Moss':   { hex: '#5C6650', undertone: 'warm',    scores: { fair_cool: 85, light_warm: 95, medium_warm: 98, olive_neutral: 97, tan_warm: 99, deep_rich: 91 } },
    '10 Ecru':   { hex: '#EDE6D6', undertone: 'warm',    scores: { fair_cool: 88, light_warm: 97, medium_warm: 98, olive_neutral: 95, tan_warm: 98, deep_rich: 97 } },
    '11 Indigo': { hex: '#3E4668', undertone: 'cool',    scores: { fair_cool: 98, light_warm: 92, medium_warm: 93, olive_neutral: 95, tan_warm: 94, deep_rich: 98 } },
  };

  function getSkinToneSpec(id) {
    return SKIN_TONES.find((s) => s.id === id) || SKIN_TONES[2];
  }

  function detectSkinToneFromRGB(r, g, b) {
    const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = toLin(r), G = toLin(g), B = toLin(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    const L = 116 * fy - 16, a = 500 * (fx - fy), bLab = 200 * (fy - fz);
    const ita = (Math.atan2(L - 50, Math.max(1, bLab)) * 180) / Math.PI;
    const warmRatio = bLab / Math.max(1, a);
    if (ita > 48) return warmRatio > 1.35 ? getSkinToneSpec('light_warm') : getSkinToneSpec('fair_cool');
    if (ita > 34) return getSkinToneSpec('light_warm');
    if (ita > 20) return warmRatio < 1.25 ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('medium_warm');
    if (ita > 8) return warmRatio < 1.2 ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('tan_warm');
    if (ita > -15) return getSkinToneSpec('tan_warm');
    return getSkinToneSpec('deep_rich');
  }

  function scoreColorHarmony(skinToneId, variant) {
    const skin = getSkinToneSpec(skinToneId);
    const spec = GARMENT_COLOR_SPECS[variant] || GARMENT_COLOR_SPECS['04 Noir'];
    const score = spec.scores[skin.id] ?? 90;
    const verdict = score >= 95 ? 'Sangat Harmonis' : score >= 90 ? 'Cocok & Seimbang' : 'Kontras Eksperimental';
    return { skinTone: skin, variant, colorHex: spec.hex, colorUndertone: spec.undertone, score, verdict };
  }

  function recommendColorsForSkin(skinToneId, catalog = []) {
    const skin = getSkinToneSpec(skinToneId);
    return catalog
      .map((p) => {
        const h = scoreColorHarmony(skin.id, p.variant);
        return { sku_id: p.sku_id, name: p.name, category: p.category, variant: p.variant, score: h.score, hex: h.colorHex, verdict: h.verdict };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * (4) Rekomendasi utama.
   */
  function recommend(profile, product, feedbackList = [], catalog = []) {
    const body = profile.metrics && profile.metrics.estimated_chest_cm
      ? profile.metrics
      : estimateBody({ ...profile.metrics, gender: profile.gender, age: profile.age });

    const bias = computeFeedbackBias(feedbackList, product.sku_id);

    const ranked = product.sizes
      .map((s) => scoreSize(body, s, product, profile.fit_preference, bias))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const alternative = ranked[1];

    const inStockList = ranked.filter((x) => x.inStock);
    const bestInStock = inStockList[0] || alternative;
    const isBestOutOfStock = !best.inStock;

    const methodFactor = profile.input_method === 'camera_scan' ? 1 : 0.97;
    const baseConf = Math.round(best.score * methodFactor) + bias.confidenceDelta;
    const confidence = clamp(baseConf, 40, 99);
    const skinId = profile.skin_tone || (profile.metrics && profile.metrics.skin_tone) || 'medium_warm';
    const colorHarmony = scoreColorHarmony(skinId, product.variant);

    return {
      best,
      alternative,
      bestInStock,
      isBestOutOfStock,
      ranked,
      body,
      confidence,
      feedbackBias: bias,
      isCalibratedFromFeedback: bias.appliedCount > 0,
      colorHarmony,
    };
  }

  global.AuraSizeEngine = {
    estimateBody,
    calibrateGarment,
    scoreSize,
    recommend,
    computeFeedbackBias,
    FIT_PREFERENCE_EASE,
    SKIN_TONES,
    GARMENT_COLOR_SPECS,
    detectSkinToneFromRGB,
    scoreColorHarmony,
    recommendColorsForSkin,
  };
})(typeof window !== 'undefined' ? window : globalThis);
