/**
 * Aura Atelier — AI Size Engine (prototype rule engine)
 * ------------------------------------------------------
 * Mesin rekomendasi ukuran hibrida versi MVP:
 *   1. Body Estimator   : TB/BB/usia/gender/bentuk tubuh  -> estimasi lingkar tubuh (cm)
 *   2. Garment Calibrator: stretch_factor & shrinkage per SKU -> dimensi efektif garmen
 *   3. Fit Matcher       : bandingkan "ease" (ruang gerak) per zona vs target preferensi fit
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
   * Menganalisis riwayat feedback pesanan pengguna untuk pembelajaran adaptif.
   */
  function computeFeedbackBias(feedbackList = []) {
    if (!feedbackList || !feedbackList.length) {
      return { chestBiasCm: 0, shoulderBiasCm: 0, confidenceDelta: 0, appliedCount: 0, summaryNote: '' };
    }
    const recent = feedbackList.slice(-10);
    let tooSmall = 0, tooBig = 0, perfect = 0;
    for (const item of recent) {
      if (item.feedback === 'too_small') tooSmall++;
      else if (item.feedback === 'too_big') tooBig++;
      else if (item.feedback === 'perfect') perfect++;
    }
    const netDiff = tooSmall - tooBig;
    const chestBiasCm = clamp(netDiff * 1.5, -4.5, 4.5);
    const shoulderBiasCm = clamp(netDiff * 0.75, -2.5, 2.5);
    const confidenceDelta = clamp(perfect * 2 - (tooSmall + tooBig) * 1.5, -6, 8);

    let summaryNote = '';
    if (tooSmall > tooBig) {
      summaryNote = `AI Terkalibrasi: preferensi disesuaikan +${chestBiasCm.toFixed(1)} cm dari feedback pesanan sebelumnya.`;
    } else if (tooBig > tooSmall) {
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
    const ageAdj = clamp((age - 30) * 0.15, -2, 4); // metabolisme: pinggang bertambah seiring usia

    const bmi = w / ((h / 100) * (h / 100));
    const bmiAdjChest = clamp((bmi - 22) * 0.45, -2.5, 3.5);
    const bmiAdjWaist = clamp((bmi - 22) * 0.65, -3, 4.5);

    let chest, waist, hips, shoulder;
    if (gender === 'female') {
      chest = 0.2 * h + 0.72 * w + 12 + bmiAdjChest;
      waist = 0.85 * w + 0.1 * h + 3 + ageAdj + bmiAdjWaist;
      hips = 0.65 * w + 0.33 * h + 4;
      shoulder = 0.21 * h + 0.1 * w; // lebar bahu dalam satuan ukur garmen, bukan tulang biakromial
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
   * Susut mengurangi dimensi; stretch hanya membantu bila tubuh lebih besar dari garmen.
   */
  function calibrateGarment(size, fabric) {
    const shrink = 1 - (fabric.shrinkage_after_wash_pct || 0) / 100;
    const chestCirc = size.chest_width_cm * 2 * shrink;
    return {
      chest_circ_cm: round1(chestCirc),
      chest_circ_max_stretch_cm: round1(chestCirc * (fabric.stretch_factor || 1)),
      shoulder_cm: round1(size.shoulder_width_cm * shrink),
      length_cm: round1(size.body_length_cm * shrink),
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
    const cut = product.cut_ease || { chest: 0, shoulder: 0 }; // potongan boxy sudah memberi ruang ekstra
    const bChest = (bias && bias.chestBiasCm) || 0;
    const bShoulder = (bias && bias.shoulderBiasCm) || 0;

    // Dada: bila garmen < tubuh, stretch kain ikut diperhitungkan.
    const rawChestEase = g.chest_circ_cm - body.estimated_chest_cm;
    const chestEase = rawChestEase < 0 ? g.chest_circ_max_stretch_cm - body.estimated_chest_cm : rawChestEase;
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

    // Penalti kuadratik ternormalisasi -> skor 0..100. Ketat dihukum 1.4x lebih berat dari longgar
    // karena data retur menunjukkan "kekecilan" adalah alasan retur terbesar.
    let penalty = 0;
    for (const key of Object.keys(zones)) {
      const d = zones[key].diff;
      const norm = (d < 0 ? d * 1.4 : d) / (ZONE_TOLERANCE[key] * 2.2);
      penalty += ZONE_WEIGHT[key] * norm * norm;
    }
    const score = clamp(100 * Math.exp(-penalty * 0.9), 0, 100);

    const stockCount = (product.stock && product.stock[size.size_label]) ?? 0;
    const inStock = stockCount > 0;

    return { size_label: size.size_label, score: Math.round(score), zones, garment: g, inStock, stockCount };
  }

  /**
   * (4) Rekomendasi utama.
   * @returns {{best, alternative, bestInStock, isBestOutOfStock, ranked, body, confidence, feedbackBias, isCalibratedFromFeedback}}
   */
  function recommend(profile, product, feedbackList = []) {
    const body = profile.metrics && profile.metrics.estimated_chest_cm
      ? profile.metrics
      : estimateBody({ ...profile.metrics, gender: profile.gender, age: profile.age });

    const bias = computeFeedbackBias(feedbackList);

    const ranked = product.sizes
      .map((s) => scoreSize(body, s, product, profile.fit_preference, bias))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const alternative = ranked[1];

    const inStockList = ranked.filter((x) => x.inStock);
    const bestInStock = inStockList[0] || alternative;
    const isBestOutOfStock = !best.inStock;

    // Metode kamera lebih presisi -> confidence tidak didiskon.
    const methodFactor = profile.input_method === 'camera_scan' ? 1 : 0.97;
    const baseConf = Math.round(best.score * methodFactor) + bias.confidenceDelta;
    const confidence = clamp(baseConf, 40, 99);

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
    };
  }

  global.AuraSizeEngine = { estimateBody, calibrateGarment, scoreSize, recommend, computeFeedbackBias, FIT_PREFERENCE_EASE };
})(typeof window !== 'undefined' ? window : globalThis);

