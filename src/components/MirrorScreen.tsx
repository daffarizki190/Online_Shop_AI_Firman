import React, { useEffect, useRef, useState } from 'react';
import { CATALOG, prod } from '../data';
import { detectSkinToneFromRGB, scoreColorHarmony, SKIN_TONES } from '../engine';
import { useApp, inStock, STORE } from '../store';
import type { SkinToneId } from '../types';
import { Subbar } from '../ui';

const MIRROR_SHAPES: Record<string, string> = {
  tee: 'M 355 316 Q 448 374 541 316 C 585 322 632 334 668 352 L 758 498 L 668 544 L 622 478 L 608 930 Q 448 955 288 930 L 274 478 L 228 544 L 138 498 L 228 352 C 264 334 311 322 355 316 Z',
  longsleeve: 'M 355 316 Q 448 374 541 316 C 585 322 632 334 668 352 L 786 845 L 708 872 L 620 482 L 608 930 Q 448 955 288 930 L 276 482 L 188 872 L 110 845 L 228 352 C 264 334 311 322 355 316 Z',
  hoodie: 'M 346 312 Q 448 368 550 312 C 594 320 638 334 674 354 L 764 522 L 672 562 L 624 488 L 610 940 Q 448 965 286 940 L 272 488 L 224 562 L 132 522 L 222 354 C 258 334 302 320 346 312 Z',
  shirt: 'M 355 314 L 414 344 L 448 386 L 482 344 L 541 314 C 585 320 632 334 668 352 L 758 504 L 668 548 L 622 482 L 608 935 Q 448 960 288 935 L 274 482 L 228 548 L 138 504 L 228 352 C 264 334 311 320 355 314 Z',
};
const SHAPE_BY_CAT: Record<string, string> = { 'T-Shirt': 'tee', 'Longsleeve': 'longsleeve', 'Hoodie': 'hoodie', 'Kemeja': 'shirt' };
const MIRROR_COLORS: Record<string, string> = {
  '04 Noir': '#1F1F23', '05 Bone': '#E8E2D4', '06 Slate': '#6E7278', '07 Ink': '#26282E',
  '08 Carbon': '#313136', '09 Moss': '#5C6650', '10 Ecru': '#EDE6D6', '11 Indigo': '#3E4668',
};
const MP_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export default function MirrorScreen() {
  const { s, set, goto, ensureResult } = useApp();
  const p = prod(s.mirrorSku || s.currentSku);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lmRef = useRef<any>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef(0);
  const lastT = useRef(-1);
  const trackingRef = useRef(false);
  const onRef = useRef(false);
  const smoothRef = useRef({ cx: 0, cy: 0, shoulderPx: 0, angle: 0, initialized: false });
  const measuredShoulderRef = useRef<number | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCountRef = useRef(0);
  const rgbSmoothRef = useRef({ r: 210, g: 165, b: 130, initialized: false });
  const [detectedSkin, setDetectedSkin] = useState<SkinToneId | null>(null);
  const [fallback, setFallback] = useState(false);
  const [hud, setHud] = useState({ status: 'Menyiapkan kamera…', shoulder: 'Bahu: —', fit: '', ok: false, warn: false });
  const hudRef = useRef(hud);

  const activeSkinId: SkinToneId = (detectedSkin || s.profile?.skin_tone || s.profile?.metrics.skin_tone || 'medium_warm') as SkinToneId;
  const colorHarmony = scoreColorHarmony(activeSkinId, p.variant);

  const updateHud = (next: typeof hud) => {
    const cur = hudRef.current;
    if (
      cur.status !== next.status ||
      cur.shoulder !== next.shoulder ||
      cur.fit !== next.fit ||
      cur.ok !== next.ok ||
      cur.warn !== next.warn
    ) {
      hudRef.current = next;
      setHud(next);
    }
  };

  const sizes: string[] = p.sizes.map((x) => x.size_label as string).filter((l) => inStock(p.sku_id, l));
  const r = s.profile ? ensureResult(p.sku_id) : null;
  const def: string = ((r && sizes.includes(r.best.size_label) ? r.best.size_label : null)
    || (s.selectedSize && sizes.includes(s.selectedSize) ? s.selectedSize : null)
    || sizes[Math.min(1, sizes.length - 1)]) as string;
  const mirrorSize = sizes.includes(s.mirrorSize || '') ? s.mirrorSize! : def!;

  const stop = () => {
    onRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { landmarkerRef.current?.close(); } catch { /* ignore */ }
    streamRef.current = null; landmarkerRef.current = null; lmRef.current = null; trackingRef.current = false;
    smoothRef.current.initialized = false;
  };

  const lmToCanvas = (lm: any, canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    return { x: (canvas.width - dw) / 2 + (1 - lm.x) * dw, y: (canvas.height - dh) / 2 + lm.y * dh };
  };

  const draw = () => {
    const canvas = canvasRef.current, video = videoRef.current;
    if (!canvas || !video) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    const shape = new Path2D(MIRROR_SHAPES[SHAPE_BY_CAT[p.category] || 'tee']);
    const color = MIRROR_COLORS[p.variant] || '#2E2E33';
    const lm = lmRef.current;
    const lmOk = lm && lm[11] && lm[12] && lm[11].visibility > 0.45 && lm[12].visibility > 0.45;
    let cx: number, cy: number, shoulderPx: number, angle = 0;

    if (lmOk) {
      // Patokan murni kedua sisi bahu: landmark 11 (bahu kiri) dan landmark 12 (bahu kanan)
      const sL = lmToCanvas(lm[11], canvas, video);
      const sR = lmToCanvas(lm[12], canvas, video);
      const rawShoulderPx = Math.hypot(sR.x - sL.x, sR.y - sL.y);
      const rawCx = (sL.x + sR.x) / 2;
      const rawCy = (sL.y + sR.y) / 2;
      const rawAngle = Math.atan2(sR.y - sL.y, sR.x - sL.x);

      // Filter Low-Pass / Exponential Moving Average (EMA) agar fitting stabil & tidak jitter saat bergerak
      const sm = smoothRef.current;
      if (!sm.initialized) {
        sm.cx = rawCx;
        sm.cy = rawCy;
        sm.shoulderPx = rawShoulderPx;
        sm.angle = rawAngle;
        sm.initialized = true;
      } else {
        const alpha = 0.32;
        sm.cx += (rawCx - sm.cx) * alpha;
        sm.cy += (rawCy - sm.cy) * alpha;
        sm.shoulderPx += (rawShoulderPx - sm.shoulderPx) * alpha;
        let diffA = rawAngle - sm.angle;
        while (diffA < -Math.PI) diffA += Math.PI * 2;
        while (diffA > Math.PI) diffA -= Math.PI * 2;
        sm.angle += diffA * alpha;
      }
      cx = sm.cx;
      cy = sm.cy;
      shoulderPx = sm.shoulderPx;
      angle = sm.angle;
    } else {
      smoothRef.current.initialized = false;
      shoulderPx = W * 0.46;
      cx = W / 2;
      cy = H * 0.40;
      angle = 0;
    }

    const idx = p.sizes.findIndex((x) => x.size_label === mirrorSize);
    const idxM = p.sizes.findIndex((x) => x.size_label === 'M');
    const sizeFactor = 1 + ((idx < 0 ? 1 : idx) - (idxM < 0 ? 1 : idxM)) * 0.055;

    // Patokan anatomi: lm[11] & lm[12] adalah pusat sendi glenohumeral (di bagian dalam bahu).
    // Untuk menutup bahu luar (deltoid) & lengan baju asli secara utuh, rentang bahu efektif = 1.28x jarak antar-sendi.
    const targetShoulderPx = shoulderPx * 1.28 * sizeFactor;
    const scale = targetShoulderPx / 440;

    ctx.save();
    // Anchor di titik tengah sendi bahu (cx, cy) lalu diangkat ke puncak trapezius/pangkal leher (-392 pada ruang SVG)
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    ctx.translate(-448, -392);

    // 1. Bayangan belakang kerah (inner back-neck depth) agar tampak membungkus leher secara 3D
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(355, 316);
    ctx.quadraticCurveTo(448, 336, 541, 316);
    ctx.quadraticCurveTo(448, 382, 355, 316);
    ctx.closePath();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.82)';
    ctx.fill();
    ctx.restore();

    // 2. Base kain opasitas tinggi (0.985) agar logo/warna baju asli di bawahnya tidak tembus (anti ghosting)
    ctx.save();
    ctx.globalAlpha = 0.985;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = color;
    ctx.fill(shape);
    ctx.restore();

    // 3. Pencahayaan 3D & Drape Kain (klip di dalam bentuk pakaian)
    ctx.save();
    ctx.clip(shape);

    // Pencahayaan dada silindris (terang lembut di dada atas, bayangan halus di tepi samping tubuh)
    const torsoGrad = ctx.createLinearGradient(260, 340, 636, 340);
    torsoGrad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    torsoGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.06)');
    torsoGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.11)');
    torsoGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.05)');
    torsoGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = torsoGrad;
    ctx.fillRect(100, 300, 700, 680);

    // Gradasi vertikal dari bahu ke bawah hem
    const vertGrad = ctx.createLinearGradient(448, 310, 448, 950);
    vertGrad.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
    vertGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
    vertGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = vertGrad;
    ctx.fillRect(100, 300, 700, 680);

    // Lipatan natural (drape folds) di sekitar ketiak & dada samping
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(274, 478);
    ctx.quadraticCurveTo(302, 560, 296, 670);
    ctx.moveTo(622, 478);
    ctx.quadraticCurveTo(594, 560, 600, 670);
    ctx.stroke();

    // Jahitan drop-shoulder (seam bahu kiri & kanan)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(232, 350);
    ctx.quadraticCurveTo(258, 415, 274, 478);
    ctx.moveTo(664, 350);
    ctx.quadraticCurveTo(638, 415, 622, 478);
    ctx.stroke();

    ctx.restore();

    // 4. Outline siluet pakaian
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2.6 / scale;
    ctx.strokeStyle = 'rgba(18, 18, 18, 0.45)';
    ctx.stroke(shape);

    // 5. Kerah Crewneck Ribbed 3D (tebal 2.2 cm dengan jahitan ganda / coverstitch)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(352, 317);
    ctx.quadraticCurveTo(448, 378, 544, 317);
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(352, 317);
    ctx.quadraticCurveTo(448, 378, 544, 317);
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.20)';
    ctx.stroke();

    // Garis jahitan atas & bawah kerah rib
    ctx.beginPath();
    ctx.moveTo(355, 313);
    ctx.quadraticCurveTo(448, 372, 541, 313);
    ctx.lineWidth = 1.8 / scale;
    ctx.strokeStyle = 'rgba(250, 249, 246, 0.38)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(349, 323);
    ctx.quadraticCurveTo(448, 386, 547, 323);
    ctx.lineWidth = 1.6 / scale;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    const next: typeof hud = { ...hudRef.current, ok: false, warn: false };
    if (lmOk) {
      next.status = trackingRef.current ? 'Terkunci ✓ — diproses di perangkat Anda' : 'Cermin manual';

      // Deteksi rona kulit wajah otomatis (CIELAB / ITA°) setiap 25 frame dari landmark wajah (lm[0])
      frameCountRef.current += 1;
      if (frameCountRef.current % 25 === 0 && lm[0] && lm[0].visibility > 0.55 && video.videoWidth > 0) {
        try {
          if (!sampleCanvasRef.current) {
            sampleCanvasRef.current = document.createElement('canvas');
            sampleCanvasRef.current.width = 12;
            sampleCanvasRef.current.height = 12;
          }
          const sc = sampleCanvasRef.current;
          const sctx = sc.getContext('2d', { willReadFrequently: true });
          if (sctx) {
            const sx = Math.max(0, Math.min(video.videoWidth - 12, Math.round(lm[0].x * video.videoWidth) - 6));
            const sy = Math.max(0, Math.min(video.videoHeight - 12, Math.round(lm[0].y * video.videoHeight) - 6));
            sctx.drawImage(video, sx, sy, 12, 12, 0, 0, 12, 12);
            const data = sctx.getImageData(0, 0, 12, 12).data;
            let rSum = 0, gSum = 0, bSum = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
              const pr = data[i], pg = data[i + 1], pb = data[i + 2];
              if (pr > 45 && pr < 248 && pr > pb) { rSum += pr; gSum += pg; bSum += pb; count++; }
            }
            if (count >= 16) {
              const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count;
              const smRgb = rgbSmoothRef.current;
              if (!smRgb.initialized) {
                smRgb.r = avgR; smRgb.g = avgG; smRgb.b = avgB; smRgb.initialized = true;
              } else {
                smRgb.r = smRgb.r * 0.7 + avgR * 0.3;
                smRgb.g = smRgb.g * 0.7 + avgG * 0.3;
                smRgb.b = smRgb.b * 0.7 + avgB * 0.3;
              }
              const spec = detectSkinToneFromRGB(smRgb.r, smRgb.g, smRgb.b);
              setDetectedSkin((prev) => (prev === spec.id ? prev : spec.id));
            }
          }
        } catch { /* abaikan bila canvas tainted */ }
      }

      // Kalibrasi Lebar Bahu Multi-Referensi (Akurat untuk Close-Up Selfie maupun Full-Body)
      // Catatan anatomi: lm[11]-lm[12] adalah pusat sendi glenohumeral dalam; lebar bahu jahitan (acromion-deltoid) = ~1.34x jarak sendi.
      const heightCm = Number(s.profile?.metrics.height_cm) || 170;
      const profileShoulderCm = Number((s.profile?.metrics as any)?.shoulder_cm) || (heightCm * 0.264);
      const estimates: number[] = [];

      // Referensi 1: Lebar kranial antar-telinga (lm[7] - lm[8]) -> konversi ke lebar bahu jahitan (faktor 24.1x termasuk koreksi perspektif selfie)
      if (lm[7] && lm[8] && (lm[7].visibility ?? 1) > 0.35 && (lm[8].visibility ?? 1) > 0.35) {
        const eL = lmToCanvas(lm[7], canvas, video);
        const eR = lmToCanvas(lm[8], canvas, video);
        const earDistPx = Math.hypot(eR.x - eL.x, eR.y - eL.y);
        if (earDistPx > 18) {
          estimates.push((shoulderPx / earDistPx) * 24.1 * (heightCm / 170));
        }
      }

      // Referensi 2: Jarak mata-ke-mulut (lm[2,5] ke lm[9,10]) -> stabil saat close-up (faktor 9.45x ke lebar bahu jahitan)
      if (lm[2] && lm[5] && lm[9] && lm[10]) {
        const eyeL = lmToCanvas(lm[2], canvas, video);
        const eyeR = lmToCanvas(lm[5], canvas, video);
        const mouthL = lmToCanvas(lm[9], canvas, video);
        const mouthR = lmToCanvas(lm[10], canvas, video);
        const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
        const mouthMid = { x: (mouthL.x + mouthR.x) / 2, y: (mouthL.y + mouthR.y) / 2 };
        const eyeToMouthPx = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y);
        if (eyeToMouthPx > 12) {
          estimates.push((shoulderPx / eyeToMouthPx) * 9.45 * (heightCm / 170));
        }
      }

      // Referensi 3: Torso / Full-body bila berdiri agak jauh (pinggul lm[24] atau pergelangan kaki lm[28] terlihat)
      if (lm[28] && lm[28].visibility > 0.5) {
        const bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[28], canvas, video).y);
        if (bodyPx > shoulderPx * 2.2) estimates.push(((shoulderPx * 1.32) / bodyPx) * (heightCm * 0.90));
      } else if (lm[24] && lm[24].visibility > 0.5) {
        const torsoPx = Math.abs(cy - lmToCanvas(lm[24], canvas, video).y);
        if (torsoPx > shoulderPx * 0.95) estimates.push(((shoulderPx * 1.32) / torsoPx) * (heightCm * 0.30));
      }

      const rawCameraShoulder = estimates.length > 0
        ? estimates.reduce((a, b) => a + b, 0) / estimates.length
        : profileShoulderCm;

      // Sensor Fusion: gabungkan pengamatan kamera dengan baseline antropometri profil agar tidak melompat ekstrem
      const fusedShoulder = s.profile
        ? rawCameraShoulder * 0.60 + profileShoulderCm * 0.40
        : rawCameraShoulder * 0.72 + profileShoulderCm * 0.28;
      const clampedShoulder = Math.max(38, Math.min(52, fusedShoulder));
      const prevMeasured = measuredShoulderRef.current ?? clampedShoulder;
      const shoulderCm = prevMeasured * 0.82 + clampedShoulder * 0.18;
      measuredShoulderRef.current = Math.round(shoulderCm * 10) / 10;

      const sz = p.sizes.find((x) => x.size_label === mirrorSize);
      const eff = (sz?.shoulder_width_cm || 46) * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100);
      const diff = eff - shoulderCm;
      next.shoulder = `Bahu Anda ±${Math.round(shoulderCm)} cm`;
      if (diff >= -2.5 && diff <= 3.5) { next.fit = `Size ${mirrorSize} ✓ Pas di bahu`; next.ok = true; }
      else if (diff < -2.5) { next.fit = `Size ${mirrorSize} agak ketat`; next.warn = true; }
      else next.fit = `Size ${mirrorSize} agak longgar`;

      // Cari ukuran terbaik berdasarkan lebar bahu terukur di kamera (target boxy ease +1.5 cm)
      const camBest = p.sizes
        .filter((x) => inStock(p.sku_id, x.size_label))
        .map((x) => ({ l: x.size_label, eff: x.shoulder_width_cm * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) }))
        .sort((a, b) => Math.abs(a.eff - shoulderCm - 1.5) - Math.abs(b.eff - shoulderCm - 1.5))[0];
      const profileBest = r ? (r.isBestOutOfStock && r.bestInStock ? r.bestInStock.size_label : r.best.size_label) : null;
      const sugLabel = (!next.ok && camBest && camBest.l !== mirrorSize)
        ? camBest.l
        : (profileBest && profileBest !== mirrorSize ? profileBest : camBest?.l);
      if (sugLabel && sugLabel !== mirrorSize) next.fit += ` → AI: ${sugLabel}`;
    } else {
      next.status = trackingRef.current ? 'Mengunci tubuh… jaga jarak ±1–2 m' : 'Cermin manual — AI belum aktif';
      next.shoulder = 'Bahu: mengunci…';
      next.fit = `Size ${mirrorSize}`;
    }
    updateHud(next);
  };

  const loop = () => {
    if (!onRef.current) return;
    const video = videoRef.current;
    if (trackingRef.current && landmarkerRef.current && video && video.readyState >= 2 && video.currentTime !== lastT.current) {
      lastT.current = video.currentTime;
      try {
        const res = landmarkerRef.current.detectForVideo(video, performance.now());
        lmRef.current = res?.landmarks?.[0] || null;
      } catch { /* frame dilewati */ }
    }
    draw();
    rafRef.current = requestAnimationFrame(loop);
  };

  const start = async () => {
    if (onRef.current) return;
    onRef.current = true;
    setFallback(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 }, aspectRatio: { ideal: 0.75 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
    } catch {
      onRef.current = false;
      setFallback(true);
      setHud((h) => ({ ...h, status: 'Kamera tidak aktif' }));
      return;
    }
    setHud((h) => ({ ...h, status: 'Memuat model pose…' }));
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const vision: any = await Promise.race([import(/* @vite-ignore */ `${MP_URL}/vision_bundle.mjs`), timeout]);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO', numPoses: 1,
      });
      trackingRef.current = true;
    } catch {
      landmarkerRef.current = null;
      trackingRef.current = false;
    }
    lastT.current = -1;
    rafRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    start();
    const onVis = () => {
      if (document.hidden) stop();
      else if (!onRef.current) start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.sku_id]);

  const capture = () => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !video.videoWidth) return;
    const out = document.createElement('canvas');
    out.width = canvas!.width; out.height = canvas!.height;
    const ctx = out.getContext('2d')!;
    const scale = Math.max(out.width / video.videoWidth, out.height / video.videoHeight);
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;
    ctx.save(); ctx.translate(out.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    ctx.restore();
    ctx.drawImage(canvas!, 0, 0);
    set({ sheet: 'foto', param: out.toDataURL('image/png') } as any);
  };

  return (
    <section className="screen is-active screen--sub" id="screen-cermin" data-tab="studio" aria-label="Cermin AI">
      <Subbar backTo="fitting" title="Cermin AI" sub={`${p.name} — ${p.variant}`} />
      <div className="screen__body">
        <div className="mirror-stage" id="mirror-stage">
          <video id="mirror-video" ref={videoRef} playsInline muted autoPlay style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          <canvas id="mirror-canvas" ref={canvasRef} />
          <div className="mirror-hud">
            <span className="hud-chip" id="hud-status">{hud.status}</span>
            <span className="hud-chip hud-chip--dim" id="hud-shoulder">{hud.shoulder}</span>
            <span className={`hud-chip${hud.ok ? ' hud-chip--ok' : ''}${hud.warn ? ' hud-chip--warn' : ''}`} id="hud-fit">{hud.fit}</span>
          </div>

          {/* Floating Glass Dock di bagian bawah Cermin agar kontrol Ukuran & Warna langsung terlihat di layar HP tanpa perlu scroll */}
          <div className="mirror-dock">
            <div className="mirror-dock__top">
              <span className="mirror-dock__skin">
                <i style={{ background: colorHarmony.skinTone.hex }} />
                Kulit {colorHarmony.skinTone.shortLabel} · <b>{p.variant} ({colorHarmony.score}%)</b>
              </span>
              <div className="mirror-dock__sizes" role="radiogroup" aria-label="Pilih ukuran cepat">
                {sizes.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`mirror-dock__size${l === mirrorSize ? ' is-active' : ''}`}
                    onClick={() => set({ mirrorSize: l })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mirror-dock__colors" aria-label="Ganti warna pakaian cepat">
              {[...CATALOG]
                .sort((a, b) => scoreColorHarmony(activeSkinId, b.variant).score - scoreColorHarmony(activeSkinId, a.variant).score)
                .map((item) => {
                  const h = scoreColorHarmony(activeSkinId, item.variant);
                  const isCur = item.sku_id === p.sku_id;
                  return (
                    <button
                      key={item.sku_id}
                      type="button"
                      className={`mirror-dock__color${isCur ? ' is-active' : ''}`}
                      onClick={() => set({ mirrorSku: item.sku_id, currentSku: item.sku_id })}
                    >
                      <i style={{ background: h.colorHex }} />
                      <span>{item.variant.replace(/^\d+\s+/, '')} {h.score}%</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {fallback && (
          <div className="empty-state" id="mirror-fallback" style={{ padding: '40px 24px' }}>
            <div className="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" /><rect x="2" y="8" width="20" height="12" rx="2" /><circle cx="12" cy="14" r="3.2" /></svg></div>
            <p className="serif-sm">Kamera belum siap</p>
            <p className="muted-sm">Izinkan akses kamera di browser (butuh HTTPS — sudah aktif di situs ini). Proses 100% di perangkat, video tidak dikirim ke mana pun.</p>
            <button type="button" className="btn btn--outline btn--sm" onClick={start}>Coba Buka Kamera</button>
          </div>
        )}

        <p className="label-xs" style={{ padding: '0 16px' }}>Coba Ukuran</p>
        <div className="size-chips" style={{ padding: '0 16px' }} id="cermin-sizes">
          {sizes.map((l) => (
            <button key={l} type="button" className="size-chip" role="radio" aria-checked={l === mirrorSize}
              onClick={() => set({ mirrorSize: l })}>{l}</button>
          ))}
        </div>

        {/* Panel Harmoni Warna Kulit & Pencocokan Warna Real-Time */}
        <div style={{ margin: '12px 16px 4px', padding: '10px 12px', borderRadius: 10, background: '#FAF8F3', border: '1px solid var(--line, #E2DFD9)' }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600 }}>
              🎨 Kulit: <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colorHarmony.skinTone.hex, border: '1px solid rgba(0,0,0,0.25)', verticalAlign: 'middle', margin: '0 3px' }} />
              {colorHarmony.skinTone.shortLabel} {detectedSkin ? '(Kamera AI)' : ''}
            </span>
            <span className="chip chip--fit" style={{ fontSize: 10.5, padding: '2px 7px' }}>
              Warna {p.variant}: {colorHarmony.score}% {colorHarmony.verdict}
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '0 0 8px' }}>{colorHarmony.reason}</p>

          <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4 }}>
            {SKIN_TONES.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setDetectedSkin(st.id);
                  if (s.profile) {
                    const updated = { ...s.profile, skin_tone: st.id, metrics: { ...s.profile.metrics, skin_tone: st.id } };
                    localStorage.setItem(STORE.profile, JSON.stringify(updated));
                    set({ profile: updated, results: {} });
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 99,
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                  border: activeSkinId === st.id ? '1.5px solid #121212' : '1px solid var(--line, #E2DFD9)',
                  background: activeSkinId === st.id ? '#EFECE4' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.hex, border: '1px solid rgba(0,0,0,0.2)' }} />
                {st.shortLabel}
              </button>
            ))}
          </div>

          <small style={{ display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', margin: '8px 0 5px' }}>
            Ganti Warna Pakaian di Cermin (Diurutkan AI untuk Kulit Anda):
          </small>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {[...CATALOG]
              .sort((a, b) => scoreColorHarmony(activeSkinId, b.variant).score - scoreColorHarmony(activeSkinId, a.variant).score)
              .map((item) => {
                const h = scoreColorHarmony(activeSkinId, item.variant);
                const isCur = item.sku_id === p.sku_id;
                return (
                  <button
                    key={item.sku_id}
                    type="button"
                    onClick={() => set({ mirrorSku: item.sku_id, currentSku: item.sku_id })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 9px',
                      borderRadius: 8,
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      border: isCur ? '1.5px solid #121212' : '1px solid var(--line, #E2DFD9)',
                      background: isCur ? '#121212' : '#fff',
                      color: isCur ? '#fff' : '#121212',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: h.colorHex, border: '1px solid rgba(255,255,255,0.5)' }} />
                    <span>{item.variant} · {h.score}%</span>
                  </button>
                );
              })}
          </div>
        </div>

        <p className="fineprint" style={{ padding: '8px 16px 16px' }}>
          {s.profile ? '🪞 Pose & Skin-Tone AI berjalan di perangkat — pakaian mengikuti bahu Anda, dan warna dianalisis terhadap rona kulit Anda.' : '🪞 Pose & Skin-Tone AI berjalan di perangkat. Tip: isi Atelier Consultation dulu agar estimasi bahu memakai tinggi badan Anda.'}
        </p>
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" onClick={capture}>Ambil Foto 📸</button>
      </div>

      {(s.sheet as any) === 'foto' && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) set({ sheet: null }); }}>
          <div className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="bottom-sheet__grip" aria-hidden="true" />
            <h4>Hasil Cermin AI</h4>
            <img src={(s.param as any) || ''} alt="Foto hasil coba pakaian" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', margin: '12px 0' }} />
            <div className="row-between">
              <a className="btn btn--outline btn--sm" href={(s.param as any) || '#'} download="aura-cermin.png">Unduh Foto</a>
              <button type="button" className="btn btn--dark btn--sm" onClick={() => set({ sheet: null })}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
