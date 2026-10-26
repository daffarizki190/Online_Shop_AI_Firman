/** Port size-engine.js ke TypeScript (DOM-free, logika identik dengan self-learning feedback loop & stock awareness). */
import type { FeedbackItem, FitFeedbackBias, FitProfile, FitResult, Product, ScoredSize, SizeSpec, ZoneFit } from './types';

interface ShapeAdj { chest: number; waist: number; hips: number; shoulder: number }
const BODY_SHAPE_ADJUST: Record<string, ShapeAdj> = {
  athletic: { chest: +2.0, waist: -2.0, hips: 0.0, shoulder: +1.5 },
  rectangle: { chest: 0.0, waist: +2.0, hips: 0.0, shoulder: 0.0 },
  pear: { chest: -1.5, waist: 0.0, hips: +4.0, shoulder: -1.0 },
  hourglass: { chest: +1.5, waist: -3.0, hips: +2.0, shoulder: 0.0 },
  oval: { chest: +2.5, waist: +4.5, hips: +1.5, shoulder: -0.5 },
  inverted_triangle: { chest: +2.5, waist: 0.0, hips: -2.0, shoulder: +2.0 },
};

export const FIT_PREFERENCE_EASE: Record<string, { chest: number; shoulder: number; lengthRatio: number }> = {
  tight: { chest: 4, shoulder: 0, lengthRatio: 0.395 },
  regular: { chest: 9, shoulder: 2, lengthRatio: 0.405 },
  oversized: { chest: 14, shoulder: 4, lengthRatio: 0.415 },
};

const ZONE_TOLERANCE = { chest: 3.5, shoulder: 2.5, length: 2.5 };
const ZONE_WEIGHT = { chest: 0.5, shoulder: 0.3, length: 0.2 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Menganalisis riwayat umpan balik pesanan pengguna untuk pembelajaran adaptif.
 * - 'too_small': Pengguna merasa sempit -> AI meningkatkan kelonggaran target (+cm).
 * - 'too_big': Pengguna merasa longgar -> AI mengurangi kelonggaran target (-cm).
 * - 'perfect': Memperkuat keyakinan model dan menambah skor confidence (+%).
 */
export function computeFeedbackBias(feedbackList: FeedbackItem[] = []): FitFeedbackBias {
  if (!feedbackList || !feedbackList.length) {
    return { chestBiasCm: 0, shoulderBiasCm: 0, confidenceDelta: 0, appliedCount: 0, summaryNote: '' };
  }

  const recent = feedbackList.slice(-10);
  let tooSmall = 0;
  let tooBig = 0;
  let perfect = 0;

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

export function estimateBody(input: { gender: string; height_cm: number; weight_kg: number; age: number; body_shape: string }) {
  const { gender, height_cm: h, weight_kg: w, age } = input;
  const adj = BODY_SHAPE_ADJUST[input.body_shape] || BODY_SHAPE_ADJUST.rectangle;
  const ageAdj = clamp((age - 30) * 0.15, -2, 4);

  // Penyesuaian distribusi volume tubuh berbasis IMT (BMI)
  const bmi = w / ((h / 100) * (h / 100));
  const bmiAdjChest = clamp((bmi - 22) * 0.45, -2.5, 3.5);
  const bmiAdjWaist = clamp((bmi - 22) * 0.65, -3, 4.5);

  let chest: number, waist: number, hips: number, shoulder: number;
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

  const sleeve = round1(0.34 * h);
  const torso = round1(0.40 * h);

  return {
    height_cm: h, weight_kg: w,
    estimated_chest_cm: round1(chest + adj.chest),
    estimated_waist_cm: round1(waist + adj.waist),
    estimated_hips_cm: round1(hips + adj.hips),
    estimated_shoulder_cm: round1(shoulder + adj.shoulder),
    estimated_sleeve_cm: sleeve,
    estimated_torso_cm: torso,
  };
}

export function calibrateGarment(size: SizeSpec, fabric: { shrinkage_after_wash_pct: number; stretch_factor: number }) {
  const shrink = 1 - (fabric.shrinkage_after_wash_pct || 0) / 100;
  const chestCirc = size.chest_width_cm * 2 * shrink;
  return {
    chest_circ_cm: round1(chestCirc),
    chest_circ_max_stretch_cm: round1(chestCirc * (fabric.stretch_factor || 1)),
    shoulder_cm: round1(size.shoulder_width_cm * shrink),
    length_cm: round1(size.body_length_cm * shrink),
  };
}

function zoneStatus(diff: number, tol: number): ZoneFit['status'] {
  if (diff < -tol) return 'tight';
  if (diff > tol) return 'loose';
  return 'fit';
}

export function scoreSize(
  body: Record<string, number>,
  size: SizeSpec,
  product: Product,
  preference: string,
  bias?: { chestBiasCm: number; shoulderBiasCm: number }
): ScoredSize {
  const pref = FIT_PREFERENCE_EASE[preference] || FIT_PREFERENCE_EASE.regular;
  const g = calibrateGarment(size, product.fabric_specs);
  const cut = product.cut_ease || { chest: 0, shoulder: 0 };
  const bChest = bias?.chestBiasCm || 0;
  const bShoulder = bias?.shoulderBiasCm || 0;

  const rawChestEase = g.chest_circ_cm - body.estimated_chest_cm;
  const chestEase = rawChestEase < 0 ? g.chest_circ_max_stretch_cm - body.estimated_chest_cm : rawChestEase;
  const chestDiff = chestEase - (pref.chest + cut.chest + bChest);

  const shoulderEase = g.shoulder_cm - body.estimated_shoulder_cm;
  const shoulderDiff = shoulderEase - (pref.shoulder + cut.shoulder + bShoulder);

  const idealLength = body.height_cm * pref.lengthRatio;
  const lengthDiff = g.length_cm - idealLength;

  const mk = (ease: number, diff: number): ZoneFit => ({ ease: round1(ease), diff: round1(diff), status: zoneStatus(diff, 3.5) });
  const zones = {
    chest: mk(chestEase, chestDiff),
    shoulder: mk(shoulderEase, shoulderDiff),
    length: mk(lengthDiff, lengthDiff),
  };
  zones.chest.status = zoneStatus(chestDiff, ZONE_TOLERANCE.chest);
  zones.shoulder.status = zoneStatus(shoulderDiff, ZONE_TOLERANCE.shoulder);
  zones.length.status = zoneStatus(lengthDiff, ZONE_TOLERANCE.length);

  let penalty = 0;
  (Object.keys(zones) as (keyof typeof zones)[]).forEach((key) => {
    const d = zones[key].diff;
    const norm = (d < 0 ? d * 1.4 : d) / (ZONE_TOLERANCE[key] * 2.2);
    penalty += ZONE_WEIGHT[key] * norm * norm;
  });
  const score = clamp(100 * Math.exp(-penalty * 0.9), 0, 100);

  const stockCount = (product.stock as Record<string, number>)?.[size.size_label] ?? 0;
  const inStock = stockCount > 0;

  return { size_label: size.size_label, score: Math.round(score), zones, garment: g, inStock, stockCount };
}

export function recommend(
  profile: FitProfile,
  product: Product,
  feedbackList: FeedbackItem[] = []
): FitResult {
  const body = (profile.metrics.estimated_chest_cm
    ? profile.metrics
    : { ...estimateBody({ ...(profile.metrics as any), gender: profile.gender, age: profile.age }), height_cm: profile.metrics.height_cm }) as Record<string, number>;

  const bias = computeFeedbackBias(feedbackList);

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

  return {
    best,
    alternative,
    bestInStock,
    isBestOutOfStock,
    ranked,
    confidence,
    feedbackBias: bias,
    isCalibratedFromFeedback: bias.appliedCount > 0,
  };
}

