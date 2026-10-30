/** Port size-engine.js ke TypeScript + Professional AI Stylist & Personal Colorimetry Engine (CIELAB / ITA°). */
import type {
  ColorHarmonyResult,
  FeedbackItem,
  FitFeedbackBias,
  FitProfile,
  FitResult,
  Product,
  ScoredSize,
  SizeSpec,
  SkinToneId,
  SkinToneSpec,
  StylistReport,
  ZoneFit,
} from './types';

export const SKIN_TONES: SkinToneSpec[] = [
  {
    id: 'fair_cool',
    label: 'Terang · Cool Undertone',
    shortLabel: 'Terang (Cool)',
    undertone: 'cool',
    season: 'Cool Winter / Summer',
    hex: '#F3D3C4',
    desc: 'Kulit putih gading dengan rona kemerahan/pink; urat nadi tampak kebiruan.',
  },
  {
    id: 'light_warm',
    label: 'Cerah · Warm Undertone',
    shortLabel: 'Cerah (Warm)',
    undertone: 'warm',
    season: 'Warm Spring',
    hex: '#EBC1A1',
    desc: 'Kulit terang kekuningan cerah; segar saat terkena cahaya matahari.',
  },
  {
    id: 'medium_warm',
    label: 'Kuning Langsat · Warm-Neutral',
    shortLabel: 'Kuning Langsat',
    undertone: 'warm',
    season: 'Warm Autumn / Spring',
    hex: '#DDA67E',
    desc: 'Rona kulit kuning langsat khas tropis dengan pigmen keemasan hangat.',
  },
  {
    id: 'olive_neutral',
    label: 'Olive · Neutral Undertone',
    shortLabel: 'Olive (Netral)',
    undertone: 'neutral',
    season: 'Soft Autumn / Neutral',
    hex: '#C6906A',
    desc: 'Perpaduan rona netral-kehijauan halus; fleksibel di palet tanah maupun monokrom.',
  },
  {
    id: 'tan_warm',
    label: 'Sawo Matang · Golden Warm',
    shortLabel: 'Sawo Matang',
    undertone: 'warm',
    season: 'Deep Autumn',
    hex: '#AE744D',
    desc: 'Kulit coklat keemasan hangat yang tampak bercahaya dengan warna bumi & krem.',
  },
  {
    id: 'deep_rich',
    label: 'Eksotis Gelap · Deep Rich',
    shortLabel: 'Eksotis (Deep)',
    undertone: 'cool',
    season: 'Deep Winter',
    hex: '#7C4D34',
    desc: 'Pigmen kulit gelap mendalam yang sangat memukau dengan warna kontras tinggi & tegas.',
  },
];

interface GarmentColorMeta {
  hex: string;
  undertone: 'cool' | 'warm' | 'neutral';
  scores: Record<SkinToneId, number>;
  reasons: Record<SkinToneId, string>;
}

export const GARMENT_COLOR_SPECS: Record<string, GarmentColorMeta> = {
  '04 Noir': {
    hex: '#1F1F23',
    undertone: 'cool',
    scores: { fair_cool: 97, light_warm: 90, medium_warm: 92, olive_neutral: 95, tan_warm: 91, deep_rich: 94 },
    reasons: {
      fair_cool: 'Kontras tinggi Noir mempertegas garis rahang dan membuat kulit Cool tampak porselen.',
      light_warm: 'Hitam pekat memberi siluet tegas dan merampingkan proporsi bahu-dada.',
      medium_warm: 'Memberi kontras modern yang bersih pada kulit kuning langsat.',
      olive_neutral: 'Noir menyatu harmonis dengan undertone netral tanpa membuat wajah kusam.',
      tan_warm: 'Klasik dan maskulin/elegan, menonjolkan struktur bahu boxy.',
      deep_rich: 'Menciptakan tampilan monokromatik mewah dengan kedalaman tekstur 360 GSM.',
    },
  },
  '05 Bone': {
    hex: '#E8E2D4',
    undertone: 'warm',
    scores: { fair_cool: 86, light_warm: 95, medium_warm: 97, olive_neutral: 96, tan_warm: 98, deep_rich: 96 },
    reasons: {
      fair_cool: 'Krem gading lembut memberi nuansa quiet-luxury yang hangat.',
      light_warm: 'Senada dengan pigmen hangat kulit sehingga wajah terlihat lebih segar.',
      medium_warm: 'Sangat direkomendasikan: rona Bone memantulkan cahaya hangat ke wajah kuning langsat.',
      olive_neutral: 'Menetralkan rona kehijauan pada kulit olive dan memberi efek bersih.',
      tan_warm: 'Pilihan #1 untuk Sawo Matang: kontras hangatnya membuat kulit tampak glowing & eksotis.',
      deep_rich: 'Kontras terang namun lembut (tidak menyilaukan seperti putih kapur), sangat berkelas.',
    },
  },
  '06 Slate': {
    hex: '#6E7278',
    undertone: 'cool',
    scores: { fair_cool: 96, light_warm: 88, medium_warm: 89, olive_neutral: 94, tan_warm: 88, deep_rich: 93 },
    reasons: {
      fair_cool: 'Abu-abu kebiruan (Slate) sangat selaras dengan urat nadi cool undertone Anda.',
      light_warm: 'Transisi warna netral yang lebih lembut dibandingkan hitam pekat.',
      medium_warm: 'Memberi kesan minimalis urban yang seimbang untuk aktivitas harian.',
      olive_neutral: 'Mid-tone grey menyeimbangkan spektrum kulit netral secara effortless.',
      tan_warm: 'Memberi nuansa industrial-minimalis yang kalem.',
      deep_rich: 'Abu-abu medium menonjolkan kilau alami kulit gelap dengan kontras seimbang.',
    },
  },
  '07 Ink': {
    hex: '#26282E',
    undertone: 'cool',
    scores: { fair_cool: 98, light_warm: 91, medium_warm: 92, olive_neutral: 95, tan_warm: 90, deep_rich: 96 },
    reasons: {
      fair_cool: 'Hitam-kebiruan (Ink) adalah warna terbaik untuk Cool Undertone — tegas tanpa terlihat keras.',
      light_warm: 'Kedalaman warna Ink berpadu apik dengan tekstur rib 2×2.',
      medium_warm: 'Memberi definisi tajam pada siluet tubuh bagian atas.',
      olive_neutral: 'Tone biru-gelap tersembunyi di balik Ink mengangkat kecerahan kulit olive.',
      tan_warm: 'Alternatif hitam yang lebih kaya dimensi untuk acara malam.',
      deep_rich: 'Sangat harmonis dengan pigmen Deep Winter, menghadirkan siluet ramping.',
    },
  },
  '08 Carbon': {
    hex: '#313136',
    undertone: 'neutral',
    scores: { fair_cool: 94, light_warm: 92, medium_warm: 94, olive_neutral: 97, tan_warm: 93, deep_rich: 92 },
    reasons: {
      fair_cool: 'Charcoal matte memberi kontras lebih lembut dari hitam murni.',
      light_warm: 'Tidak menyerap rona hangat wajah, ideal untuk layering outerwear.',
      medium_warm: 'Warna netral serbaguna yang menyamarkan bayangan lipatan tubuh.',
      olive_neutral: 'Skor tertinggi untuk kulit Olive: Carbon berada tepat di titik keseimbangan netral.',
      tan_warm: 'Memberi kesan tangguh dan maskulin dengan tekstur fleece 480 GSM.',
      deep_rich: 'Gradasi abu-gelap menonjolkan struktur bahu drop-shoulder.',
    },
  },
  '09 Moss': {
    hex: '#5C6650',
    undertone: 'warm',
    scores: { fair_cool: 85, light_warm: 95, medium_warm: 98, olive_neutral: 97, tan_warm: 99, deep_rich: 91 },
    reasons: {
      fair_cool: 'Hijau sage/moss memberi aksen organik yang menenangkan.',
      light_warm: 'Memperkuat rona keemasan alami kulit Warm Spring Anda.',
      medium_warm: 'Sangat harmonis! Hijau bumi (Moss) mengunci rona hangat kuning langsat agar tampak cerah.',
      olive_neutral: 'Menyatu sempurna dengan pigmen olive alami Anda (monochromatic earth harmony).',
      tan_warm: 'Match Sempurna (99%): palet Deep Autumn terbaik yang membuat kulit sawo matang tampak mewah.',
      deep_rich: 'Earth-tone kaya pigmen yang memberi dimensi hangat pada kulit gelap.',
    },
  },
  '10 Ecru': {
    hex: '#EDE6D6',
    undertone: 'warm',
    scores: { fair_cool: 88, light_warm: 97, medium_warm: 98, olive_neutral: 95, tan_warm: 98, deep_rich: 97 },
    reasons: {
      fair_cool: 'Putih hangat (Ecru) di atas kain Tencel memberi kilau lembut di dekat wajah.',
      light_warm: 'Mencerahkan wajah secara instan tanpa efek pucat seperti putih optik.',
      medium_warm: 'Pilihan terbaik untuk kemeja: rona gading Ecru menyatu mulus dengan kuning langsat.',
      olive_neutral: 'Memberi kesan bersih, rapi, dan resort-ready pada kulit netral.',
      tan_warm: 'Menghadirkan efek sun-kissed yang bersih dan elegan pada kulit sawo matang.',
      deep_rich: 'Kontras cerah yang mewah dan menonjolkan kejernihan wajah.',
    },
  },
  '11 Indigo': {
    hex: '#3E4668',
    undertone: 'cool',
    scores: { fair_cool: 98, light_warm: 92, medium_warm: 93, olive_neutral: 95, tan_warm: 94, deep_rich: 98 },
    reasons: {
      fair_cool: 'Match Sempurna (98%): biru Indigo memantulkan rona sejuk yang membuat kulit tampak sangat bersih.',
      light_warm: 'Kombinasi kontras komplementer dengan rona hangat kulit Anda.',
      medium_warm: 'Biru tua klasik yang memberi kesan profesional sekaligus santai.',
      olive_neutral: 'Pigmen biru Indigo menyeimbangkan undertone netral dengan sangat baik.',
      tan_warm: 'Biru indigo kaya pigmen memberi kontras komplementer terhadap kilau keemasan sawo matang.',
      deep_rich: 'Match Sempurna (98%): biru royal gelap memperkuat kedalaman rona kulit Deep Winter.',
    },
  },
};

export function getSkinToneSpec(id?: string): SkinToneSpec {
  return SKIN_TONES.find((s) => s.id === id) || SKIN_TONES[2]; // default: medium_warm (Kuning Langsat)
}

/**
 * Deteksi warna kulit & undertone dari piksel kamera (sRGB -> CIE XYZ -> CIELAB + ITA° angle).
 */
export function detectSkinToneFromRGB(r: number, g: number, b: number): SkinToneSpec {
  const toLin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.00000;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);

  // Individual Typology Angle (ITA°) dalam derajat
  const ita = (Math.atan2(L - 50, Math.max(1, bLab)) * 180) / Math.PI;
  const warmRatio = bLab / Math.max(1, a);

  if (ita > 48) return warmRatio > 1.35 ? getSkinToneSpec('light_warm') : getSkinToneSpec('fair_cool');
  if (ita > 34) return getSkinToneSpec('light_warm');
  if (ita > 20) return warmRatio < 1.25 ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('medium_warm');
  if (ita > 8) return warmRatio < 1.2 ? getSkinToneSpec('olive_neutral') : getSkinToneSpec('tan_warm');
  if (ita > -15) return getSkinToneSpec('tan_warm');
  return getSkinToneSpec('deep_rich');
}

export function scoreColorHarmony(skinToneId: string | undefined, variant: string): ColorHarmonyResult {
  const skin = getSkinToneSpec(skinToneId);
  const spec = GARMENT_COLOR_SPECS[variant] || GARMENT_COLOR_SPECS['04 Noir'];
  const score = spec.scores[skin.id] ?? 90;
  const verdict: ColorHarmonyResult['verdict'] =
    score >= 95 ? 'Sangat Harmonis' : score >= 90 ? 'Cocok & Seimbang' : 'Kontras Eksperimental';
  return {
    skinTone: skin,
    variant,
    colorHex: spec.hex,
    colorUndertone: spec.undertone,
    score,
    verdict,
    reason: spec.reasons[skin.id],
  };
}

export function recommendColorsForSkin(skinToneId: string | undefined, catalog: Product[]) {
  const skin = getSkinToneSpec(skinToneId);
  return catalog
    .map((p) => {
      const h = scoreColorHarmony(skin.id, p.variant);
      return {
        sku_id: p.sku_id,
        name: p.name,
        category: p.category,
        variant: p.variant,
        score: h.score,
        hex: h.colorHex,
        verdict: h.verdict,
        reason: h.reason,
      };
    })
    .sort((a, b) => b.score - a.score);
}

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
export function computeFeedbackBias(feedbackList: FeedbackItem[] = [], targetSku?: string): FitFeedbackBias {
  if (!feedbackList || !feedbackList.length) {
    return { chestBiasCm: 0, shoulderBiasCm: 0, confidenceDelta: 0, appliedCount: 0, summaryNote: '' };
  }

  const recent = feedbackList.slice(-10);
  const targetPrefix = targetSku ? targetSku.split('-')[0] : '';
  let weightedNet = 0;
  let tooSmall = 0;
  let tooBig = 0;
  let perfect = 0;

  for (const item of recent) {
    const itemPrefix = item.sku_id ? item.sku_id.split('-')[0] : '';
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
    sleeve_cm: round1((size.sleeve_length_cm || 0) * shrink),
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

  // Perhitungkan kontur perut/pinggul (terutama bentuk tubuh Oval/Pear) agar tidak sempit di bagian tengah/bawah torso
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

  // Penalti tambahan bila pinggang/pinggul melampaui kapasitas regang garmen
  if (body.estimated_waist_cm && g.chest_circ_max_stretch_cm < body.estimated_waist_cm + 2) {
    const waistDeficit = (body.estimated_waist_cm + 2) - g.chest_circ_max_stretch_cm;
    penalty += 0.18 * (waistDeficit / 4) ** 2;
  }

  const score = clamp(100 * Math.exp(-penalty * 0.9), 0, 100);

  const stockCount = (product.stock as Record<string, number>)?.[size.size_label] ?? 0;
  const inStock = stockCount > 0;

  return { size_label: size.size_label, score: Math.round(score), zones, garment: g, inStock, stockCount };
}

export function generateStylistReport(
  profile: FitProfile,
  product: Product,
  bestSize: ScoredSize,
  catalog: Product[] = []
): StylistReport {
  const skinId = (profile.skin_tone || profile.metrics.skin_tone || 'medium_warm') as SkinToneId;
  const colorAnalysis = scoreColorHarmony(skinId, product.variant);
  const h = profile.metrics.height_cm || 170;
  const w = profile.metrics.weight_kg || 65;
  const bmi = w / ((h / 100) * (h / 100));
  const shape = String(profile.metrics.body_shape || 'rectangle');
  const pref = profile.fit_preference || 'regular';

  const shapeNotes: Record<string, string> = {
    athletic: `Postur Atletis Anda memiliki rasio V-taper alami (bahu ${profile.metrics.estimated_shoulder_cm} cm vs pinggang ${profile.metrics.estimated_waist_cm} cm). Size ${bestSize.size_label} menjaga garis bahu tetap tegas tanpa menggelembung di bagian pinggang.`,
    inverted_triangle: `Dengan bahu bidang (${profile.metrics.estimated_shoulder_cm} cm), potongan drop-shoulder pada Size ${bestSize.size_label} memberi ruang artikulasi lengan yang leluasa sekaligus menyeimbangkan volume tubuh atas dan bawah.`,
    rectangle: `Untuk postur Persegi, struktur potongan ${product.category} pada Size ${bestSize.size_label} menciptakan ilusi dimensi bahu yang lebih tegas (+${bestSize.zones.chest.ease} cm ruang gerak di dada).`,
    pear: `Untuk menyeimbangkan proporsi pinggul (${profile.metrics.estimated_hips_cm} cm), Size ${bestSize.size_label} menarik fokus visual ke garis bahu dan kerah atas dengan panjang jatuh ${bestSize.garment.length_cm} cm yang tidak menekan pinggul.`,
    oval: `Untuk postur Oval (IMT ${bmi.toFixed(1)}), kami memprioritaskan kelonggaran di area torso tengah (pinggang ${profile.metrics.estimated_waist_cm} cm). Size ${bestSize.size_label} (${bestSize.garment.chest_circ_cm} cm) memastikan kain jatuh lurus vertikal tanpa mencetak lekuk perut.`,
    hourglass: `Proporsi Jam Pasir Anda yang seimbang di dada dan pinggul tampil optimal dengan Size ${bestSize.size_label}, memberikan drape rapi yang mengikuti garis bahu tanpa menghilangkan siluet.`,
  };

  const silhouetteAnalysis = shapeNotes[shape] || shapeNotes.rectangle;

  const gsmMatch = product.fabric_specs.material.match(/(\d+)\s*GSM/i);
  const gsm = gsmMatch ? Number(gsmMatch[1]) : 280;
  const fabricAnalysis =
    gsm >= 400
      ? `Konstruksi ultra-heavyweight ${product.fabric_specs.material} memiliki struktur mandiri (self-supporting drape) yang menyamarkan ketidakrataan kontur tubuh dan menjaga siluet tetap arsitektural.`
      : gsm >= 300
        ? `Gramasi tebal ${product.fabric_specs.material} memberi jatuhan kain yang tegas (tidak menerawang atau menempel di kulit), sangat ideal untuk proporsi TB ${h} cm / BB ${w} kg Anda.`
        : `Material ${product.fabric_specs.material} dengan kelenturan ${Math.round((product.fabric_specs.stretch_factor - 1) * 100)}% memberikan sirkulasi udara tinggi dan jatuhan fluida yang mengikuti gerak tubuh di iklim tropis.`;

  const stylingTips: string[] = [
    colorAnalysis.score >= 95
      ? `Warna ${product.variant} adalah Signature Match (${colorAnalysis.score}%) untuk kulit ${colorAnalysis.skinTone.shortLabel} (${colorAnalysis.skinTone.season}) — kenakan langsung di dekat wajah tanpa perlu layer kontras.`
      : `Padukan ${product.variant} dengan aksen bawah berwarna ${colorAnalysis.skinTone.undertone === 'warm' ? 'krem/olive hangat' : 'hitam/abu-abu arang'} untuk mengunci harmoni ${colorAnalysis.skinTone.season}.`,
    pref === 'oversized'
      ? `Styling Oversized: padukan Size ${bestSize.size_label} dengan celana wide-leg atau straight-cut berstruktur agar proporsi siluet atas-bawah tetap 1:1.4.`
      : pref === 'tight'
        ? `Styling Clean-Fit: padukan Size ${bestSize.size_label} dengan tailored trousers atau chino slim-straight untuk kesan smart-casual yang tajam.`
        : `Styling Essential: Size ${bestSize.size_label} jatuh pas di tulang pinggul (${bestSize.garment.length_cm} cm) — sempurna dipakai mandiri maupun sebagai layer di balik overshirt.`,
  ];

  const bestColorProducts = (catalog.length ? recommendColorsForSkin(skinId, catalog) : []).slice(0, 3);

  return {
    headline: `Rekomendasi Master Tailor: Size ${bestSize.size_label} · Harmoni Warna ${colorAnalysis.score}% (${colorAnalysis.verdict})`,
    silhouetteAnalysis,
    fabricAnalysis,
    colorAnalysis,
    stylingTips,
    bestColorProducts,
  };
}

export function recommend(
  profile: FitProfile,
  product: Product,
  feedbackList: FeedbackItem[] = [],
  catalog: Product[] = []
): FitResult {
  const body = (profile.metrics.estimated_chest_cm
    ? profile.metrics
    : { ...estimateBody({ ...(profile.metrics as any), gender: profile.gender, age: profile.age }), height_cm: profile.metrics.height_cm }) as Record<string, number>;

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

  const skinId = (profile.skin_tone || profile.metrics.skin_tone || 'medium_warm') as SkinToneId;
  const colorHarmony = scoreColorHarmony(skinId, product.variant);
  const stylistReport = generateStylistReport(profile, product, best, catalog);

  return {
    best,
    alternative,
    bestInStock,
    isBestOutOfStock,
    ranked,
    confidence,
    feedbackBias: bias,
    isCalibratedFromFeedback: bias.appliedCount > 0,
    colorHarmony,
    stylistReport,
  };
}

