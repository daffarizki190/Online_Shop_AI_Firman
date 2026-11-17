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
   * (1) Estimasi dimensi tubuh dari kuesioner (ISO 8559-1:2017, Chuan et al. 2010, Heymsfield et al. 2008).
   * @param {{gender:'male'|'female', height_cm:number, weight_kg:number, age:number, body_shape:string}} input
   */
  function estimateBody(input) {
    const { gender, height_cm: h, weight_kg: w, age } = input;
    const adj = BODY_SHAPE_ADJUST[input.body_shape] || BODY_SHAPE_ADJUST.rectangle;
    const ageAdj = clamp((age - 30) * 0.15, -2, 4);

    const bmi = w / ((h / 100) * (h / 100));
    const allometricBmi = Math.sqrt(Math.max(0.65, Math.min(1.65, bmi / 22))) - 1;
    const bmiAdjChest = clamp((bmi - 22) * 0.45 + allometricBmi * 2.2, -2.5, 4.0);
    const bmiAdjWaist = clamp((bmi - 22) * 0.65 + allometricBmi * 3.1, -3, 5.0);

    let chest, waist, hips, shoulder, biacromial, bideltoid;
    if (gender === 'female') {
      chest = 0.2 * h + 0.72 * w + 12 + bmiAdjChest;
      waist = 0.85 * w + 0.1 * h + 3 + ageAdj + bmiAdjWaist;
      hips = 0.65 * w + 0.33 * h + 4;
      biacromial = 0.212 * h + 0.045 * (w - 55);
      bideltoid = biacromial * clamp(1.13 + (bmi - 21.5) * 0.0045, 1.08, 1.24);
      shoulder = 0.21 * h + 0.1 * w;
    } else {
      chest = 0.22 * h + 0.7 * w + 9 + bmiAdjChest;
      waist = 0.9 * w + 0.12 * h - 2 + ageAdj + bmiAdjWaist;
      hips = 0.55 * w + 0.32 * h + 3;
      biacromial = 0.228 * h + 0.05 * (w - 65);
      bideltoid = biacromial * clamp(1.15 + (bmi - 22.0) * 0.005, 1.10, 1.26);
      shoulder = 0.21 * h + 0.09 * w;
    }

    return {
      height_cm: h,
      weight_kg: w,
      estimated_chest_cm: round1(chest + adj.chest),
      estimated_waist_cm: round1(waist + adj.waist),
      estimated_hips_cm: round1(hips + adj.hips),
      estimated_shoulder_cm: round1(shoulder + adj.shoulder),
      biacromial_shoulder_cm: round1(biacromial + adj.shoulder * 0.7),
      bideltoid_shoulder_cm: round1(bideltoid + adj.shoulder),
      estimated_sleeve_cm: round1(0.34 * h),
      estimated_torso_cm: round1(0.40 * h),
    };
  }

  function correctPoseShoulderWidth(rawShoulderPx, lm11, lm12, bmi = 22.5) {
    let yawRad = 0;
    if (lm11 && lm12 && typeof lm11.z === 'number' && typeof lm12.z === 'number') {
      const dx = Math.max(0.04, Math.abs(lm12.x - lm11.x));
      const dz = Math.abs(lm12.z - lm11.z);
      yawRad = Math.min(0.52, Math.atan2(dz * 0.55, dx));
    }
    const secYaw = 1 / Math.max(0.84, Math.cos(yawRad));
    const deltoidFactor = clamp(1.28 + (bmi - 22) * 0.0055, 1.22, 1.38);
    return {
      correctedPx: rawShoulderPx * secYaw,
      yawDeg: Math.round((yawRad * 180) / Math.PI),
      deltoidFactor: round1(deltoidFactor),
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

  function analyzeSkinColorimetry(r, g, b, ambientRgb) {
    let cr = r, cg = g, cb = b;
    let illuminantCorrected = false;
    if (ambientRgb && ambientRgb.r > 25 && ambientRgb.g > 25 && ambientRgb.b > 25) {
      const lumAmb = 0.299 * ambientRgb.r + 0.587 * ambientRgb.g + 0.114 * ambientRgb.b;
      const gainR = Math.max(0.84, Math.min(1.18, lumAmb / ambientRgb.r));
      const gainG = Math.max(0.88, Math.min(1.14, lumAmb / ambientRgb.g));
      const gainB = Math.max(0.84, Math.min(1.22, lumAmb / ambientRgb.b));
      cr = Math.max(0, Math.min(255, r * (0.45 + 0.55 * gainR)));
      cg = Math.max(0, Math.min(255, g * (0.45 + 0.55 * gainG)));
      cb = Math.max(0, Math.min(255, b * (0.45 + 0.55 * gainB)));
      illuminantCorrected = true;
    }
    const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = toLin(cr), G = toLin(cg), B = toLin(cb);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X), fy = f(Y), fz = f(Z);
    const L = 116 * fy - 16, a = 500 * (fx - fy), bLab = 200 * (fy - fz);
    const ita = (Math.atan2(L - 50, Math.max(1, bLab)) * 180) / Math.PI;
    const chroma = Math.hypot(a, bLab);
    const hueAngle = (Math.atan2(bLab, Math.max(0.5, a)) * 180) / Math.PI;
    const warmRatio = bLab / Math.max(1, a);
    let spec;
    if (ita > 48) spec = (warmRatio > 1.35 || hueAngle > 58) ? getSkinToneSpec('light_warm') : getSkinToneSpec('fair_cool');
    else if (ita > 34) spec = getSkinToneSpec('light_warm');
    else if (ita > 20) spec = (warmRatio < 1.25 || (hueAngle < 56 && chroma < 21)) ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('medium_warm');
    else if (ita > 8) spec = (warmRatio < 1.20 || (hueAngle < 55 && chroma < 20)) ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('tan_warm');
    else if (ita > -15) spec = getSkinToneSpec('tan_warm');
    else spec = getSkinToneSpec('deep_rich');
    return {
      spec,
      L: Math.round(L * 10) / 10,
      a: Math.round(a * 10) / 10,
      b: Math.round(bLab * 10) / 10,
      ita: Math.round(ita * 10) / 10,
      chroma: Math.round(chroma * 10) / 10,
      hueAngle: Math.round(hueAngle * 10) / 10,
      illuminantCorrected,
    };
  }

  function detectSkinToneFromRGB(r, g, b, ambientRgb) {
    return analyzeSkinColorimetry(r, g, b, ambientRgb).spec;
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

  function detectFiveFingerGesture(handLandmarks, prevWrist) {
    if (!Array.isArray(handLandmarks) || handLandmarks.length < 21) {
      return { isFiveFingers: false, extendedCount: 0, confidence: 0, wrist: null, reason: 'no_hand' };
    }
    for (let i = 0; i < 21; i++) {
      const pt = handLandmarks[i];
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return { isFiveFingers: false, extendedCount: 0, confidence: 0, wrist: null, reason: 'corrupt_landmark' };
      }
      if (pt.x < 0.015 || pt.x > 0.985 || pt.y < 0.015 || pt.y > 0.985) {
        return { isFiveFingers: false, extendedCount: 0, confidence: 0, wrist: { x: handLandmarks[0].x, y: handLandmarks[0].y }, reason: 'edge_clipped' };
      }
    }
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wrist = { x: handLandmarks[0].x, y: handLandmarks[0].y };
    const palmSize = dist(handLandmarks[0], handLandmarks[9]);
    if (palmSize < 0.022) {
      return { isFiveFingers: false, extendedCount: 0, confidence: 0, wrist, reason: 'hand_too_small' };
    }
    if (prevWrist && Number.isFinite(prevWrist.x) && Number.isFinite(prevWrist.y)) {
      if (dist(wrist, prevWrist) > palmSize * 0.62) {
        return { isFiveFingers: false, extendedCount: 0, confidence: 0, wrist, reason: 'hand_moving' };
      }
    }
    let extendedCount = 0;
    const dThumbTipPinky = dist(handLandmarks[4], handLandmarks[17]);
    const dThumbIpPinky = dist(handLandmarks[3], handLandmarks[17]);
    const dThumbMcpPinky = dist(handLandmarks[2], handLandmarks[17]);
    const dThumbTipWrist = dist(handLandmarks[4], handLandmarks[0]);
    const dThumbMcpWrist = dist(handLandmarks[2], handLandmarks[0]);
    if (dThumbTipPinky > dThumbIpPinky * 1.07 && dThumbTipPinky > dThumbMcpPinky * 1.18 && dThumbTipWrist > dThumbMcpWrist * 1.15) {
      extendedCount++;
    }
    const fingers = [[5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
    for (const [mcp, pip, dip, tip] of fingers) {
      const dTip = dist(handLandmarks[tip], handLandmarks[0]);
      const dDip = dist(handLandmarks[dip], handLandmarks[0]);
      const dPip = dist(handLandmarks[pip], handLandmarks[0]);
      const dMcp = dist(handLandmarks[mcp], handLandmarks[0]);
      if (dTip > dPip * 1.14 && dTip > dDip * 1.03 && dPip > dMcp * 1.06) extendedCount++;
    }
    const totalSpan = dist(handLandmarks[4], handLandmarks[20]);
    const tipGaps = [
      dist(handLandmarks[4], handLandmarks[8]),
      dist(handLandmarks[8], handLandmarks[12]),
      dist(handLandmarks[12], handLandmarks[16]),
      dist(handLandmarks[16], handLandmarks[20]),
    ];
    const minGap = Math.min(...tipGaps);
    const spreadOk = totalSpan >= palmSize * 1.10 && minGap >= palmSize * 0.14;
    const isFiveFingers = extendedCount === 5 && spreadOk;
    const confidence = isFiveFingers ? clamp(Math.round(80 + Math.min(19, (totalSpan / palmSize - 1.1) * 25)), 80, 99) : Math.round((extendedCount / 5) * 65);
    return {
      isFiveFingers,
      extendedCount,
      confidence,
      wrist,
      reason: isFiveFingers ? 'valid_five_fingers' : extendedCount === 5 ? 'fingers_not_spread' : `only_${extendedCount}_fingers`,
    };
  }

  function filterMeasurementSpike(newSample, history = [], maxJumpCm = 6.0, minCm = 36, maxCm = 54) {
    if (!Number.isFinite(newSample)) {
      const fallback = history.length > 0 ? history[history.length - 1] : 45;
      return { value: clamp(fallback, minCm, maxCm), history, rejectedSpike: true };
    }
    const cleanSample = clamp(newSample, minCm, maxCm);
    if (history.length === 0) {
      return { value: round1(cleanSample), history: [cleanSample], rejectedSpike: false };
    }
    const sorted = history.toSorted((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    const diff = cleanSample - median;
    const rejectedSpike = Math.abs(diff) > maxJumpCm;
    const accepted = rejectedSpike ? median + Math.sign(diff) * 1.2 : cleanSample;
    const nextHistory = [...history.slice(-8), accepted];
    const smoothed = median * 0.65 + accepted * 0.35;
    return { value: round1(clamp(smoothed, minCm, maxCm)), history: nextHistory, rejectedSpike };
  }

  function evaluateFullBodyFraming(lm) {
    if (!Array.isArray(lm) || lm.length < 29 || !lm[11] || !lm[12]) {
      return { tier: 'invalid', isPostureValid: false, postureWarning: 'Berdiri menghadap kamera agar bahu terlihat jelas', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
    }
    const vis = (idx, min = 0.45) => {
      const p = lm[idx];
      return Boolean(p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 1) >= min && p.x >= 0.02 && p.x <= 0.98 && p.y >= 0.02 && p.y <= 0.98);
    };
    if (!vis(11, 0.45) || !vis(12, 0.45)) {
      return { tier: 'invalid', isPostureValid: false, postureWarning: 'Pastikan kedua bahu masuk ke dalam bingkai cermin', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
    }
    const sMidX = (lm[11].x + lm[12].x) / 2;
    const sMidY = (lm[11].y + lm[12].y) / 2;
    const shoulderSpan = Math.hypot(lm[12].x - lm[11].x, lm[12].y - lm[11].y);
    if (shoulderSpan < 0.06) {
      return { tier: 'invalid', isPostureValid: false, postureWarning: 'Anda terlalu jauh dari kamera — maju sedikit', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
    }
    const shoulderSlopeRad = Math.atan2(Math.abs(lm[12].y - lm[11].y), Math.max(0.001, Math.abs(lm[12].x - lm[11].x)));
    if (shoulderSlopeRad > 0.56) {
      return { tier: 'upper_body', isPostureValid: false, postureWarning: 'Bahu terlalu miring — tegakkan postur tubuh Anda', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
    }
    const hipsVisible = vis(23, 0.45) && vis(24, 0.45);
    const kneesVisible = vis(25, 0.42) && vis(26, 0.42);
    const anklesVisible = vis(27, 0.38) && vis(28, 0.38);
    let torsoLengthRatio = 1.25;
    let hipWidthRatio = 0.88;
    if (hipsVisible) {
      const hMidX = (lm[23].x + lm[24].x) / 2;
      const hMidY = (lm[23].y + lm[24].y) / 2;
      const torsoDy = hMidY - sMidY;
      const torsoDx = Math.abs(hMidX - sMidX);
      if (torsoDy < shoulderSpan * 0.78) {
        return { tier: 'three_quarter', isPostureValid: false, postureWarning: 'Postur terdeteksi membungkuk/duduk — berdiri tegak untuk akurasi ukuran', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
      }
      if (torsoDx > torsoDy * 0.42) {
        return { tier: 'three_quarter', isPostureValid: false, postureWarning: 'Tubuh terlalu condong ke samping — berdiri lurus di tengah bingkai', torsoLengthRatio: 1.25, hipWidthRatio: 0.88, fullBodyLocked: false };
      }
      torsoLengthRatio = clamp(torsoDy / shoulderSpan, 0.95, 1.75);
      const hipSpan = Math.hypot(lm[24].x - lm[23].x, lm[24].y - lm[23].y);
      hipWidthRatio = clamp(hipSpan / shoulderSpan, 0.68, 1.25);
    }
    const tier = hipsVisible && (kneesVisible || anklesVisible) ? 'full_body' : hipsVisible ? 'three_quarter' : 'upper_body';
    return { tier, isPostureValid: true, postureWarning: null, torsoLengthRatio: round1(torsoLengthRatio), hipWidthRatio: round1(hipWidthRatio), fullBodyLocked: tier === 'full_body' || tier === 'three_quarter' };
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
    analyzeSkinColorimetry,
    detectSkinToneFromRGB,
    correctPoseShoulderWidth,
    scoreColorHarmony,
    recommendColorsForSkin,
    detectFiveFingerGesture,
    filterMeasurementSpike,
    evaluateFullBodyFraming,
  };
})(typeof window !== 'undefined' ? window : globalThis);
