/** Port size-engine.js ke TypeScript (DOM-free, logika identik). */
import type { FitProfile, FitResult, Product, ScoredSize, SizeSpec, ZoneFit } from './types';

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

export function estimateBody(input: { gender: string; height_cm: number; weight_kg: number; age: number; body_shape: string }) {
  const { gender, height_cm: h, weight_kg: w, age } = input;
  const adj = BODY_SHAPE_ADJUST[input.body_shape] || BODY_SHAPE_ADJUST.rectangle;
  const ageAdj = clamp((age - 30) * 0.15, -2, 4);

  let chest: number, waist: number, hips: number, shoulder: number;
  if (gender === 'female') {
    chest = 0.2 * h + 0.72 * w + 12;
    waist = 0.85 * w + 0.1 * h + 3 + ageAdj;
    hips = 0.65 * w + 0.33 * h + 4;
    shoulder = 0.21 * h + 0.1 * w;
  } else {
    chest = 0.22 * h + 0.7 * w + 9;
    waist = 0.9 * w + 0.12 * h - 2 + ageAdj;
    hips = 0.55 * w + 0.32 * h + 3;
    shoulder = 0.21 * h + 0.09 * w;
  }
  return {
    height_cm: h, weight_kg: w,
    estimated_chest_cm: round1(chest + adj.chest),
    estimated_waist_cm: round1(waist + adj.waist),
    estimated_hips_cm: round1(hips + adj.hips),
    estimated_shoulder_cm: round1(shoulder + adj.shoulder),
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

export function scoreSize(body: Record<string, number>, size: SizeSpec, product: Product, preference: string): ScoredSize {
  const pref = FIT_PREFERENCE_EASE[preference] || FIT_PREFERENCE_EASE.regular;
  const g = calibrateGarment(size, product.fabric_specs);
  const cut = product.cut_ease || { chest: 0, shoulder: 0 };

  const rawChestEase = g.chest_circ_cm - body.estimated_chest_cm;
  const chestEase = rawChestEase < 0 ? g.chest_circ_max_stretch_cm - body.estimated_chest_cm : rawChestEase;
  const chestDiff = chestEase - (pref.chest + cut.chest);

  const shoulderEase = g.shoulder_cm - body.estimated_shoulder_cm;
  const shoulderDiff = shoulderEase - (pref.shoulder + cut.shoulder);

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

  return { size_label: size.size_label, score: Math.round(score), zones, garment: g };
}

export function recommend(profile: FitProfile, product: Product): FitResult {
  const body = (profile.metrics.estimated_chest_cm
    ? profile.metrics
    : { ...estimateBody({ ...(profile.metrics as any), gender: profile.gender, age: profile.age }), height_cm: profile.metrics.height_cm }) as Record<string, number>;

  const ranked = product.sizes
    .map((s) => scoreSize(body, s, product, profile.fit_preference))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const methodFactor = profile.input_method === 'camera_scan' ? 1 : 0.97;
  const confidence = clamp(Math.round(best.score * methodFactor), 40, 99);
  return { best, alternative: ranked[1], ranked, confidence };
}
