import React, { useEffect, useRef, useState } from 'react';
import { CATALOG, prod } from '../data';
import {
  analyzeSkinColorimetry,
  correctPoseShoulderWidth,
  detectFiveFingerGesture,
  detectSkinToneFromRGB,
  evaluateFullBodyFraming,
  filterMeasurementSpike,
  scoreColorHarmony,
  SKIN_TONES,
} from '../engine';
import { useApp, inStock, STORE } from '../store';
import type { SkinToneId } from '../types';
import { Subbar, useSmartBack } from '../ui';

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

function playTone(freq = 880, durationSec = 0.08) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, durationSec * 1000 + 80);
  } catch { /* audio dibatasi browser */ }
}

export default function MirrorScreen() {
  const { s, set, ensureResult, toast } = useApp();
  const smartBack = useSmartBack('fitting');
  const p = prod(s.mirrorSku || s.currentSku);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lmRef = useRef<any>(null);
  const handLmRef = useRef<any>(null);
  const landmarkerRef = useRef<any>(null);
  const handLandmarkerRef = useRef<any>(null);
  const rafRef = useRef(0);
  const lastT = useRef(-1);
  const trackingRef = useRef(false);
  const onRef = useRef(false);
  const smoothRef = useRef({ cx: 0, cy: 0, shoulderPx: 0, scaleYRatio: 1, angle: 0, initialized: false });
  const measuredShoulderRef = useRef<number | null>(null);
  const shoulderHistoryRef = useRef<number[]>([]);
  const validFrameStreakRef = useRef(0);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCountRef = useRef(0);
  const rgbSmoothRef = useRef({ r: 210, g: 165, b: 130, initialized: false });

  // Mode Kamera (user = depan, environment = belakang) & Mode Tampilan (full_body = seluruh badan 9:16, half_body = 3:4)
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const facingRef = useRef<'user' | 'environment'>('user');
  const [bodyMode, setBodyMode] = useState<'full_body' | 'half_body'>('full_body');
  const bodyModeRef = useRef<'full_body' | 'half_body'>('full_body');

  // Gestur 5 Jari & Countdown Auto-Capture
  const [gestureEnabled, setGestureEnabled] = useState(true);
  const gestureEnabledRef = useRef(true);
  const prevWristRef = useRef<{ x: number; y: number } | null>(null);
  const fiveFingerStreakRef = useRef(0);
  const lastCaptureAtRef = useRef(0);
  const countdownTimerRef = useRef<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [gestureHoldPct, setGestureHoldPct] = useState(0);
  const gestureHoldRef = useRef(0);
  const [dataIntegrityNote, setDataIntegrityNote] = useState<string>('Data Tervalidasi AI ✓');
  const dataNoteRef = useRef('Data Tervalidasi AI ✓');

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

  const updateDataNote = (note: string) => {
    if (dataNoteRef.current !== note) {
      dataNoteRef.current = note;
      setDataIntegrityNote(note);
    }
  };

  const updateGestureHold = (pct: number) => {
    if (gestureHoldRef.current !== pct) {
      gestureHoldRef.current = pct;
      setGestureHoldPct(pct);
    }
  };

  const sizes: string[] = p.sizes.map((x) => x.size_label as string).filter((l) => inStock(p.sku_id, l));
  const r = s.profile ? ensureResult(p.sku_id) : null;
  const def: string = ((r && sizes.includes(r.best.size_label) ? r.best.size_label : null)
    || (s.selectedSize && sizes.includes(s.selectedSize) ? s.selectedSize : null)
    || sizes[Math.min(1, sizes.length - 1)]) as string;
  const mirrorSize = sizes.includes(s.mirrorSize || '') ? s.mirrorSize! : def!;

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    countdownRef.current = null;
    setCountdown(null);
    fiveFingerStreakRef.current = 0;
    updateGestureHold(0);
  };

  const stop = () => {
    onRef.current = false;
    cancelCountdown();
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try { landmarkerRef.current?.close(); } catch { /* ignore */ }
    try { handLandmarkerRef.current?.close(); } catch { /* ignore */ }
    streamRef.current = null;
    landmarkerRef.current = null;
    handLandmarkerRef.current = null;
    lmRef.current = null;
    handLmRef.current = null;
    trackingRef.current = false;
    smoothRef.current.initialized = false;
  };

  // Konversi koordinat ternormalisasi MediaPipe ke kanvas (memperhitungkan efek mirror kamera depan vs non-mirror kamera belakang)
  const lmToCanvas = (lm: any, canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const dw = vw * scale, dh = vh * scale;
    const isFrontMirrored = facingRef.current === 'user';
    const normX = isFrontMirrored ? (1 - lm.x) : lm.x;
    return { x: (canvas.width - dw) / 2 + normX * dw, y: (canvas.height - dh) / 2 + lm.y * dh };
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
    const framing = evaluateFullBodyFraming(lm);
    const lmOk = framing.tier !== 'invalid' && lm && lm[11] && lm[12];
    let cx: number, cy: number, shoulderPx: number, scaleYRatio = 1, angle = 0;

    // Panduan Bingkai Seluruh Badan (Full-Body Framing Guide) saat mode seluruh badan aktif
    if (bodyModeRef.current === 'full_body') {
      ctx.save();
      const padX = W * 0.12;
      const topY = H * 0.07;
      const botY = H * 0.78;
      const corner = Math.min(W, H) * 0.055;
      ctx.strokeStyle = framing.fullBodyLocked ? 'rgba(125, 216, 168, 0.55)' : 'rgba(250, 249, 246, 0.32)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      // Sudut kiri-atas & kanan-atas
      ctx.moveTo(padX, topY + corner); ctx.lineTo(padX, topY); ctx.lineTo(padX + corner, topY);
      ctx.moveTo(W - padX - corner, topY); ctx.lineTo(W - padX, topY); ctx.lineTo(W - padX, topY + corner);
      // Sudut kiri-bawah & kanan-bawah
      ctx.moveTo(padX, botY - corner); ctx.lineTo(padX, botY); ctx.lineTo(padX + corner, botY);
      ctx.moveTo(W - padX - corner, botY); ctx.lineTo(W - padX, botY); ctx.lineTo(W - padX, botY - corner);
      ctx.stroke();

      // Titik skeleton kaki/pinggul saat seluruh badan terkunci
      if (lmOk && framing.fullBodyLocked) {
        const joints = [23, 24, 25, 26, 27, 28].filter((idx) => lm[idx] && (lm[idx].visibility ?? 0) > 0.4);
        ctx.fillStyle = 'rgba(125, 216, 168, 0.78)';
        for (const idx of joints) {
          const pt = lmToCanvas(lm[idx], canvas, video);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    if (lmOk) {
      // Pencegahan salah orientasi (kamera depan vs belakang / balik badan): urutkan bahu kiri-layar ke kanan-layar
      const p11 = lmToCanvas(lm[11], canvas, video);
      const p12 = lmToCanvas(lm[12], canvas, video);
      const sL = p11.x <= p12.x ? p11 : p12;
      const sR = p11.x <= p12.x ? p12 : p11;
      const rawShoulderPx = Math.hypot(sR.x - sL.x, sR.y - sL.y);
      const rawCx = (sL.x + sR.x) / 2;
      const rawCy = (sL.y + sR.y) / 2;
      const rawAngle = Math.max(-0.52, Math.min(0.52, Math.atan2(sR.y - sL.y, Math.max(1, sR.x - sL.x))));

      // Kalibrasi panjang baju ke garis pinggul asli (lm[23], lm[24]) saat berdiri agak jauh (Full-Body / Three-Quarter)
      let rawScaleYRatio = 1;
      if (framing.fullBodyLocked && lm[23] && lm[24]) {
        const h23 = lmToCanvas(lm[23], canvas, video);
        const h24 = lmToCanvas(lm[24], canvas, video);
        const hipMidY = (h23.y + h24.y) / 2;
        const hipDistPx = Math.max(20, hipMidY - rawCy);
        const baseScale = (rawShoulderPx * 1.28) / 440;
        const expectedHemPx = 543 * baseScale;
        rawScaleYRatio = Math.max(0.84, Math.min(1.26, (hipDistPx * 1.08) / Math.max(1, expectedHemPx)));
      }

      // Filter Low-Pass / Exponential Moving Average (EMA) agar fitting stabil & tidak jitter saat bergerak
      const sm = smoothRef.current;
      if (!sm.initialized) {
        sm.cx = rawCx;
        sm.cy = rawCy;
        sm.shoulderPx = rawShoulderPx;
        sm.scaleYRatio = rawScaleYRatio;
        sm.angle = rawAngle;
        sm.initialized = true;
      } else {
        const alpha = 0.30;
        sm.cx += (rawCx - sm.cx) * alpha;
        sm.cy += (rawCy - sm.cy) * alpha;
        sm.shoulderPx += (rawShoulderPx - sm.shoulderPx) * alpha;
        sm.scaleYRatio += (rawScaleYRatio - sm.scaleYRatio) * alpha;
        let diffA = rawAngle - sm.angle;
        while (diffA < -Math.PI) diffA += Math.PI * 2;
        while (diffA > Math.PI) diffA -= Math.PI * 2;
        sm.angle += diffA * alpha;
      }
      cx = sm.cx;
      cy = sm.cy;
      shoulderPx = sm.shoulderPx;
      scaleYRatio = sm.scaleYRatio;
      angle = sm.angle;
    } else {
      smoothRef.current.initialized = false;
      shoulderPx = bodyModeRef.current === 'full_body' ? W * 0.28 : W * 0.44;
      cx = W / 2;
      cy = bodyModeRef.current === 'full_body' ? H * 0.28 : H * 0.40;
      scaleYRatio = 1;
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
    ctx.scale(scale, scale * scaleYRatio);
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

    const torsoGrad = ctx.createLinearGradient(260, 340, 636, 340);
    torsoGrad.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
    torsoGrad.addColorStop(0.22, 'rgba(255, 255, 255, 0.06)');
    torsoGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.11)');
    torsoGrad.addColorStop(0.78, 'rgba(255, 255, 255, 0.05)');
    torsoGrad.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = torsoGrad;
    ctx.fillRect(100, 300, 700, 680);

    const vertGrad = ctx.createLinearGradient(448, 310, 448, 950);
    vertGrad.addColorStop(0, 'rgba(255, 255, 255, 0.09)');
    vertGrad.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
    vertGrad.addColorStop(1, 'rgba(0, 0, 0, 0.22)');
    ctx.fillStyle = vertGrad;
    ctx.fillRect(100, 300, 700, 680);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(274, 478);
    ctx.quadraticCurveTo(302, 560, 296, 670);
    ctx.moveTo(622, 478);
    ctx.quadraticCurveTo(594, 560, 600, 670);
    ctx.stroke();

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

    // Visualisasi Indikator Gestur 5 Jari (Open Palm 🖐️) di atas kanvas
    const hands = handLmRef.current;
    if (gestureEnabledRef.current && Array.isArray(hands) && hands.length > 0) {
      for (const hLm of hands) {
        const gRes = detectFiveFingerGesture(hLm, null);
        if (gRes.extendedCount >= 4 && hLm[9]) {
          const palmPt = lmToCanvas(hLm[9], canvas, video);
          ctx.save();
          ctx.strokeStyle = gRes.isFiveFingers ? '#7DD8A8' : 'rgba(255, 210, 110, 0.8)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(palmPt.x, palmPt.y, 28, 0, Math.PI * 2);
          ctx.stroke();
          for (const tipIdx of [4, 8, 12, 16, 20]) {
            if (hLm[tipIdx]) {
              const tPt = lmToCanvas(hLm[tipIdx], canvas, video);
              ctx.fillStyle = gRes.isFiveFingers ? '#7DD8A8' : '#FFD26E';
              ctx.beginPath();
              ctx.arc(tPt.x, tPt.y, 4.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }
      }
    }

    const next: typeof hud = { ...hudRef.current, ok: false, warn: false };
    if (lmOk) {
      validFrameStreakRef.current = Math.min(60, validFrameStreakRef.current + 1);
      if (!framing.isPostureValid && framing.postureWarning) {
        next.status = `⚠️ ${framing.postureWarning}`;
        next.warn = true;
        updateDataNote(`Data Ditahan: ${framing.postureWarning}`);
      } else if (bodyModeRef.current === 'full_body' && framing.tier === 'upper_body') {
        next.status = 'Mundur ±1.5–2 m agar seluruh badan masuk bingkai';
        updateDataNote('Mode Seluruh Badan: mundur sedikit agar pinggul & kaki terdeteksi');
      } else {
        next.status = framing.tier === 'full_body'
          ? 'Seluruh Badan Terkunci ✓ — diproses di perangkat Anda'
          : trackingRef.current
            ? 'Terkunci ✓ — diproses di perangkat Anda'
            : 'Cermin manual';
        updateDataNote(
          validFrameStreakRef.current >= 6
            ? `Data Tervalidasi AI ✓ (${framing.tier === 'full_body' ? 'Full-Body' : 'Upper-Body'} · Bebas Outlier)`
            : 'Mengumpulkan sampel stabil…'
        );
      }

      // Deteksi rona kulit wajah otomatis (CIELAB / ITA°) dilengkapi Filter Anti-Silau & Anti-Bayangan
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
              const luma = 0.299 * pr + 0.587 * pg + 0.114 * pb;
              // Guard pencahayaan: tolak piksel terlalu gelap (<50) atau silau/blown-out (>240)
              if (luma >= 50 && luma <= 240 && pr > pb && pr > 52) {
                rSum += pr; gSum += pg; bSum += pb; count++;
              }
            }
            if (count >= 18) {
              const avgR = rSum / count, avgG = gSum / count, avgB = bSum / count;
              const smRgb = rgbSmoothRef.current;
              if (!smRgb.initialized) {
                smRgb.r = avgR; smRgb.g = avgG; smRgb.b = avgB; smRgb.initialized = true;
              } else {
                smRgb.r = smRgb.r * 0.72 + avgR * 0.28;
                smRgb.g = smRgb.g * 0.72 + avgG * 0.28;
                smRgb.b = smRgb.b * 0.72 + avgB * 0.28;
              }
              // Ambil sampel pencahayaan latar (sudut kiri/kanan atas frame) untuk Koreksi White-Balance Von Kries (Buchsbaum 1980)
              sctx.drawImage(video, 8, 8, 6, 6, 0, 0, 6, 6);
              sctx.drawImage(video, Math.max(8, video.videoWidth - 16), 8, 6, 6, 6, 0, 6, 6);
              const ambData = sctx.getImageData(0, 0, 12, 6).data;
              let ar = 0, ag = 0, ab = 0, ac = 0;
              for (let j = 0; j < ambData.length; j += 4) {
                ar += ambData[j]; ag += ambData[j + 1]; ab += ambData[j + 2]; ac++;
              }
              const ambientRgb = ac > 0 ? { r: ar / ac, g: ag / ac, b: ab / ac } : null;
              const colMetrics = analyzeSkinColorimetry(smRgb.r, smRgb.g, smRgb.b, ambientRgb);
              const spec = colMetrics.spec;
              setDetectedSkin((prev) => (prev === spec.id ? prev : spec.id));
            }
          }
        } catch { /* abaikan bila canvas tainted */ }
      }

      // Kalibrasi Lebar Bahu Multi-Referensi + Koreksi Perspektif 3D Yaw (BlazePose / ISO 8559-1)
      const heightCm = Math.max(135, Math.min(215, Number(s.profile?.metrics.height_cm) || 170));
      const weightKg = Math.max(35, Math.min(160, Number(s.profile?.metrics.weight_kg) || 65));
      const userBmi = weightKg / ((heightCm / 100) * (heightCm / 100));
      const profileShoulderCm = Math.max(36, Math.min(54, Number((s.profile?.metrics as any)?.shoulder_cm || (s.profile?.metrics as any)?.estimated_shoulder_cm) || (heightCm * 0.264)));

      if (framing.isPostureValid) {
        const poseCorr = correctPoseShoulderWidth(shoulderPx, lm[11], lm[12], userBmi);
        const effShoulderPx = poseCorr.correctedPx;
        const deltoidFactor = poseCorr.deltoidFactor;
        const estimates: number[] = [];

        // Referensi 1: Lebar kranial antar-telinga (lm[7] - lm[8])
        if (lm[7] && lm[8] && (lm[7].visibility ?? 1) > 0.35 && (lm[8].visibility ?? 1) > 0.35) {
          const eL = lmToCanvas(lm[7], canvas, video);
          const eR = lmToCanvas(lm[8], canvas, video);
          const earDistPx = Math.hypot(eR.x - eL.x, eR.y - eL.y);
          if (earDistPx > 14) {
            estimates.push((effShoulderPx / earDistPx) * 24.1 * (heightCm / 170));
          }
        }

        // Referensi 2: Jarak mata-ke-mulut (lm[2,5] ke lm[9,10])
        if (lm[2] && lm[5] && lm[9] && lm[10]) {
          const eyeL = lmToCanvas(lm[2], canvas, video);
          const eyeR = lmToCanvas(lm[5], canvas, video);
          const mouthL = lmToCanvas(lm[9], canvas, video);
          const mouthR = lmToCanvas(lm[10], canvas, video);
          const eyeMid = { x: (eyeL.x + eyeR.x) / 2, y: (eyeL.y + eyeR.y) / 2 };
          const mouthMid = { x: (mouthL.x + mouthR.x) / 2, y: (mouthL.y + mouthR.y) / 2 };
          const eyeToMouthPx = Math.hypot(mouthMid.x - eyeMid.x, mouthMid.y - eyeMid.y);
          if (eyeToMouthPx > 10) {
            estimates.push((effShoulderPx / eyeToMouthPx) * 9.45 * (heightCm / 170));
          }
        }

        // Referensi 3: Torso / Full-body bila berdiri agak jauh (pinggul lm[24] atau pergelangan kaki lm[28] terlihat)
        if (lm[28] && lm[28].visibility > 0.5) {
          const bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[28], canvas, video).y);
          if (bodyPx > effShoulderPx * 2.2) estimates.push(((effShoulderPx * deltoidFactor) / bodyPx) * (heightCm * 0.90));
        } else if (lm[24] && lm[24].visibility > 0.5) {
          const torsoPx = Math.abs(cy - lmToCanvas(lm[24], canvas, video).y);
          if (torsoPx > effShoulderPx * 0.90) estimates.push(((effShoulderPx * deltoidFactor) / torsoPx) * (heightCm * 0.30));
        }

        const validEstimates = estimates.filter((v) => Number.isFinite(v) && v >= 34 && v <= 58);
        const rawCameraShoulder = validEstimates.length > 0
          ? validEstimates.reduce((a, b) => a + b, 0) / validEstimates.length
          : profileShoulderCm;

        const fusedShoulder = s.profile
          ? rawCameraShoulder * 0.62 + profileShoulderCm * 0.38
          : rawCameraShoulder * 0.74 + profileShoulderCm * 0.26;

        // Filter Anti-Spike (Sliding Median) untuk menolak lonjakan 1-frame yang tidak wajar
        const filtered = filterMeasurementSpike(fusedShoulder, shoulderHistoryRef.current, 5.5, 37, 53);
        shoulderHistoryRef.current = filtered.history;
        const prevMeasured = measuredShoulderRef.current ?? filtered.value;
        const shoulderCm = prevMeasured * 0.80 + filtered.value * 0.20;
        measuredShoulderRef.current = Math.round(shoulderCm * 10) / 10;
      }

      const activeShoulderCm = measuredShoulderRef.current ?? profileShoulderCm;
      const sz = p.sizes.find((x) => x.size_label === mirrorSize);
      const eff = (sz?.shoulder_width_cm || 46) * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100);
      const diff = eff - activeShoulderCm;
      next.shoulder = `Bahu Anda ±${Math.round(activeShoulderCm)} cm`;
      if (diff >= -2.5 && diff <= 3.5) { next.fit = `Size ${mirrorSize} ✓ Pas di bahu`; next.ok = true; }
      else if (diff < -2.5) { next.fit = `Size ${mirrorSize} agak ketat`; next.warn = true; }
      else next.fit = `Size ${mirrorSize} agak longgar`;

      const camBest = p.sizes
        .filter((x) => inStock(p.sku_id, x.size_label))
        .map((x) => ({ l: x.size_label, eff: x.shoulder_width_cm * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) }))
        .sort((a, b) => Math.abs(a.eff - activeShoulderCm - 1.5) - Math.abs(b.eff - activeShoulderCm - 1.5))[0];
      const profileBest = r ? (r.isBestOutOfStock && r.bestInStock ? r.bestInStock.size_label : r.best.size_label) : null;
      const sugLabel = (!next.ok && camBest && camBest.l !== mirrorSize)
        ? camBest.l
        : (profileBest && profileBest !== mirrorSize ? profileBest : camBest?.l);
      if (sugLabel && sugLabel !== mirrorSize) next.fit += ` → AI: ${sugLabel}`;
    } else {
      validFrameStreakRef.current = 0;
      next.status = trackingRef.current
        ? (bodyModeRef.current === 'full_body' ? 'Mengunci seluruh badan… berdiri ±1.5–2.5 m' : 'Mengunci tubuh… jaga jarak ±1–2 m')
        : 'Cermin manual — AI belum aktif';
      next.shoulder = 'Bahu: mengunci…';
      next.fit = `Size ${mirrorSize}`;
      updateDataNote('Menunggu deteksi tubuh masuk ke dalam bingkai…');
    }
    updateHud(next);
  };

  const capture = (fromGesture = false) => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !video.videoWidth || !canvas || !canvas.width) return;

    // Pencegahan kesalahan data saat auto-capture gestur: pastikan subjek masih di dalam bingkai & postur valid
    if (fromGesture && trackingRef.current) {
      const check = evaluateFullBodyFraming(lmRef.current);
      if (check.tier === 'invalid' || !check.isPostureValid) {
        toast(`⚠️ Foto dibatalkan otomatis: ${check.postureWarning || 'Subjek keluar dari bingkai'}`);
        return;
      }
    }

    playTone(1320, 0.14);
    setFlash(true);
    setTimeout(() => setFlash(false), 260);

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    const scale = Math.max(out.width / video.videoWidth, out.height / video.videoHeight);
    const dw = video.videoWidth * scale, dh = video.videoHeight * scale;

    ctx.save();
    if (facingRef.current === 'user') {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (out.width - dw) / 2, (out.height - dh) / 2, dw, dh);
    ctx.restore();
    ctx.drawImage(canvas, 0, 0);

    // Label metadata tervalidasi di sudut bawah foto
    const shCm = Math.round(measuredShoulderRef.current || 45);
    ctx.save();
    ctx.fillStyle = 'rgba(18, 18, 18, 0.72)';
    const badgeH = Math.max(26, Math.round(out.height * 0.038));
    ctx.fillRect(0, out.height - badgeH, out.width, badgeH);
    ctx.fillStyle = '#FAF9F6';
    ctx.font = `600 ${Math.max(11, Math.round(badgeH * 0.44))}px sans-serif`;
    ctx.fillText(
      `Aura Atelier Cermin AI · ${p.name} (${p.variant} · Size ${mirrorSize}) · Bahu ±${shCm} cm · Kulit ${colorHarmony.skinTone.shortLabel}`,
      12,
      out.height - Math.round(badgeH * 0.32)
    );
    ctx.restore();

    set({ sheet: 'foto', param: out.toDataURL('image/png') } as any);
  };

  const triggerGestureCountdown = () => {
    if (countdownRef.current !== null) return;
    if (Date.now() - lastCaptureAtRef.current < 4500) return;

    fiveFingerStreakRef.current = 0;
    updateGestureHold(0);
    countdownRef.current = 3;
    setCountdown(3);
    playTone(880, 0.08);

    countdownTimerRef.current = window.setInterval(() => {
      const cur = countdownRef.current;
      if (cur === null) {
        cancelCountdown();
        return;
      }
      if (cur > 1) {
        const nextVal = cur - 1;
        countdownRef.current = nextVal;
        setCountdown(nextVal);
        playTone(880, 0.08);
      } else {
        cancelCountdown();
        lastCaptureAtRef.current = Date.now();
        capture(true);
      }
    }, 950);
  };

  const loop = () => {
    if (!onRef.current) return;
    const video = videoRef.current;
    if (trackingRef.current && video && video.readyState >= 2 && video.currentTime !== lastT.current) {
      lastT.current = video.currentTime;
      const now = performance.now();
      try {
        if (landmarkerRef.current) {
          const res = landmarkerRef.current.detectForVideo(video, now);
          lmRef.current = res?.landmarks?.[0] || null;
        }
      } catch { /* frame pose dilewati */ }

      // Deteksi Gestur 5 Jari (Open Palm 🖐️) untuk Auto-Foto saat berdiri agak jauh
      if (
        gestureEnabledRef.current &&
        countdownRef.current === null &&
        Date.now() - lastCaptureAtRef.current >= 4500 &&
        handLandmarkerRef.current &&
        frameCountRef.current % 2 === 0
      ) {
        try {
          const hRes = handLandmarkerRef.current.detectForVideo(video, now + 0.1);
          const hands: any[] = hRes?.landmarks || [];
          handLmRef.current = hands;

          let matchedFive = false;
          for (const hLm of hands) {
            const check = detectFiveFingerGesture(hLm, prevWristRef.current);
            if (check.wrist) prevWristRef.current = check.wrist;
            if (check.isFiveFingers) {
              matchedFive = true;
              break;
            }
          }

          // Fallback jarak jauh (>2.2 m): bila Pose mendeteksi telapak tangan diangkat setinggi bahu/kepala secara stabil
          if (!matchedFive && hands.length === 0 && lmRef.current) {
            const plm = lmRef.current;
            const checkPoseHand = (wIdx: number, pIdx: number, iIdx: number, tIdx: number, sIdx: number) => {
              const w = plm[wIdx], pk = plm[pIdx], ix = plm[iIdx], th = plm[tIdx], sh = plm[sIdx];
              if (!w || !pk || !ix || !th || !sh) return false;
              if ((w.visibility ?? 0) < 0.65 || (pk.visibility ?? 0) < 0.55 || (ix.visibility ?? 0) < 0.55) return false;
              // Tangan harus diangkat jelas di atas garis bahu/dada atas & terbuka lebar
              const raised = w.y < sh.y + 0.05 && w.y > 0.04;
              const spread = Math.hypot(pk.x - th.x, pk.y - th.y);
              const prevW = prevWristRef.current;
              const steady = !prevW || Math.hypot(w.x - prevW.x, w.y - prevW.y) < 0.025;
              if (raised && spread > 0.032 && steady) {
                prevWristRef.current = { x: w.x, y: w.y };
                return true;
              }
              return false;
            };
            if (checkPoseHand(15, 17, 19, 21, 11) || checkPoseHand(16, 18, 20, 22, 12)) {
              matchedFive = true;
            }
          }

          if (matchedFive) {
            fiveFingerStreakRef.current = Math.min(6, fiveFingerStreakRef.current + 1);
            updateGestureHold(Math.min(100, Math.round((fiveFingerStreakRef.current / 5) * 100)));
            if (fiveFingerStreakRef.current >= 5) {
              triggerGestureCountdown();
            }
          } else {
            fiveFingerStreakRef.current = Math.max(0, fiveFingerStreakRef.current - 1);
            updateGestureHold(Math.round((fiveFingerStreakRef.current / 5) * 100));
          }
        } catch { /* frame hand dilewati */ }
      } else if (!gestureEnabledRef.current) {
        handLmRef.current = null;
        fiveFingerStreakRef.current = 0;
        updateGestureHold(0);
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(loop);
  };

  const start = async (overrideFacing?: 'user' | 'environment') => {
    if (onRef.current) stop();
    onRef.current = true;
    setFallback(false);
    const targetFacing = overrideFacing || facingRef.current;
    facingRef.current = targetFacing;
    setCameraFacing(targetFacing);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: bodyModeRef.current === 'full_body' ? 720 : 720 },
            height: { ideal: bodyModeRef.current === 'full_body' ? 1280 : 960 },
          },
          audio: false,
        });
      } catch {
        // Fallback apabila perangkat hanya memiliki 1 kamera (mis. webcam laptop)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (targetFacing === 'environment') {
          facingRef.current = 'user';
          setCameraFacing('user');
          toast('Kamera belakang tidak ditemukan di perangkat ini — menggunakan kamera utama');
        }
      }
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
    setHud((h) => ({ ...h, status: 'Memuat model pose & gestur 5 jari…' }));
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const vision: any = await Promise.race([import(/* @vite-ignore */ `${MP_URL}/vision_bundle.mjs`), timeout]);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
      landmarkerRef.current = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      // Muat HandLandmarker untuk deteksi akurat Gestur 5 Jari (Open Palm)
      try {
        handLandmarkerRef.current = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      } catch {
        handLandmarkerRef.current = null;
      }
      trackingRef.current = true;
    } catch {
      landmarkerRef.current = null;
      handLandmarkerRef.current = null;
      trackingRef.current = false;
    }
    lastT.current = -1;
    rafRef.current = requestAnimationFrame(loop);
  };

  const switchCamera = () => {
    const nextFacing = facingRef.current === 'user' ? 'environment' : 'user';
    smoothRef.current.initialized = false;
    start(nextFacing);
  };

  const toggleBodyMode = (mode: 'full_body' | 'half_body') => {
    bodyModeRef.current = mode;
    setBodyMode(mode);
    smoothRef.current.initialized = false;
  };

  const toggleGesture = () => {
    const next = !gestureEnabledRef.current;
    gestureEnabledRef.current = next;
    setGestureEnabled(next);
    if (!next) cancelCountdown();
    toast(next ? '🖐️ Auto-Foto Gestur 5 Jari diaktifkan' : 'Auto-Foto Gestur 5 Jari dinonaktifkan');
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

  return (
    <section className="screen is-active screen--sub" id="screen-cermin" data-tab="studio" aria-label="Cermin AI">
      <Subbar backTo="fitting" title="Cermin AI" sub={`${p.name} — ${p.variant}`} />
      <div className="screen__body">
        {/* Toolbar Kontrol Mode Seluruh Badan, Kamera Depan/Belakang, & Gestur 5 Jari */}
        <div className="mirror-toolbar" role="toolbar" aria-label="Pengaturan Cermin AI">
          <div className="mirror-toolbar__group">
            <button
              type="button"
              className={`mirror-tool-btn${bodyMode === 'full_body' ? ' is-active' : ''}`}
              onClick={() => toggleBodyMode('full_body')}
            >
              🧍 Seluruh Badan
            </button>
            <button
              type="button"
              className={`mirror-tool-btn${bodyMode === 'half_body' ? ' is-active' : ''}`}
              onClick={() => toggleBodyMode('half_body')}
            >
              👤 Setengah Badan
            </button>
          </div>
          <div className="mirror-toolbar__group">
            <button
              type="button"
              className={`mirror-tool-btn${gestureEnabled ? ' is-active' : ''}`}
              onClick={toggleGesture}
              title="Angkat 5 jari terbuka untuk hitung mundur foto otomatis"
            >
              🖐️ 5 Jari {gestureEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className="mirror-tool-btn"
              onClick={switchCamera}
              title="Ganti Kamera Depan / Belakang"
            >
              🔄 {cameraFacing === 'user' ? 'Kamera Belakang' : 'Kamera Depan'}
            </button>
          </div>
        </div>

        <div className={`mirror-stage${bodyMode === 'full_body' ? ' mirror-stage--full' : ''}`} id="mirror-stage">
          <video
            id="mirror-video"
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none',
            }}
          />
          <canvas id="mirror-canvas" ref={canvasRef} />

          {/* Efek Flash Kamera saat memotret */}
          {flash && <div className="mirror-flash" aria-hidden="true" />}

          <div className="mirror-hud">
            <span className="hud-chip" id="hud-status">{hud.status}</span>
            <span className="hud-chip hud-chip--dim" id="hud-shoulder">{hud.shoulder}</span>
            <span className={`hud-chip${hud.ok ? ' hud-chip--ok' : ''}${hud.warn ? ' hud-chip--warn' : ''}`} id="hud-fit">{hud.fit}</span>
          </div>

          {/* Indikator Hold Gestur 5 Jari */}
          {gestureEnabled && gestureHoldPct > 0 && countdown === null && (
            <div className="mirror-gesture-pill" aria-live="polite">
              <span>🖐️ Gestur 5 Jari Terdeteksi — Tahan ({gestureHoldPct}%)</span>
              <div className="mirror-gesture-bar"><i style={{ width: `${gestureHoldPct}%` }} /></div>
            </div>
          )}

          {/* Overlay Hitung Mundur Auto-Foto (3..2..1) */}
          {countdown !== null && (
            <div className="mirror-countdown" role="status" aria-live="assertive">
              <div className="mirror-countdown__num">{countdown}</div>
              <p>Turunkan tangan & berpose tegak!</p>
              <button type="button" className="btn btn--outline btn--sm" style={{ background: 'rgba(18,18,18,0.75)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }} onClick={cancelCountdown}>
                Batalkan Foto
              </button>
            </div>
          )}

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
              {CATALOG
                .toSorted((a, b) => scoreColorHarmony(activeSkinId, b.variant).score - scoreColorHarmony(activeSkinId, a.variant).score)
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

        {/* Banner Status Validasi & Pencegahan Kesalahan Data */}
        <div className="mirror-integrity-bar">
          <span>🛡️ {dataIntegrityNote}</span>
          <span>{gestureEnabled ? '🖐️ Angkat 5 jari untuk foto otomatis' : '📸 Mode foto manual'}</span>
        </div>

        {fallback && (
          <div className="empty-state" id="mirror-fallback" style={{ padding: '40px 24px' }}>
            <div className="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" /><rect x="2" y="8" width="20" height="12" rx="2" /><circle cx="12" cy="14" r="3.2" /></svg></div>
            <p className="serif-sm">Kamera belum siap</p>
            <p className="muted-sm">Izinkan akses kamera di browser (butuh HTTPS — sudah aktif di situs ini). Proses 100% di perangkat, video tidak dikirim ke mana pun.</p>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => start()}>Coba Buka Kamera</button>
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
            {CATALOG
              .toSorted((a, b) => scoreColorHarmony(activeSkinId, b.variant).score - scoreColorHarmony(activeSkinId, a.variant).score)
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
      <div className="screen__cta" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn btn--ghost" style={{ flex: '0 0 auto', padding: '0 12px' }} onClick={smartBack} title="Kembali">
          ← Kembali
        </button>
        <button type="button" className="btn btn--outline" style={{ flex: '0 0 auto', padding: '0 14px' }} onClick={triggerGestureCountdown} title="Hitung mundur 3 detik untuk berdiri jauh">
          ⏱️ 3d
        </button>
        <button type="button" className="btn btn--dark btn--block" style={{ flex: 1 }} onClick={() => capture(false)}>Ambil Foto 📸</button>
      </div>

      {(s.sheet as any) === 'foto' && (
        <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) set({ sheet: null }); }}>
          <div className="bottom-sheet" role="dialog" aria-modal="true">
            <div className="bottom-sheet__grip" aria-hidden="true" />
            <div className="row-between">
              <button type="button" className="link-btn" onClick={() => set({ sheet: null })}>← Kembali</button>
              <h4 style={{ margin: 0 }}>Hasil Cermin AI</h4>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Tutup" onClick={() => set({ sheet: null })}>✕</button>
            </div>
            <img src={(s.param as any) || ''} alt="Foto hasil coba pakaian" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', margin: '12px 0' }} />
            <div className="row-between">
              <a className="btn btn--outline btn--sm" href={(s.param as any) || '#'} download="aura-cermin.png">Unduh Foto</a>
              <button type="button" className="btn btn--dark btn--sm" onClick={() => set({ sheet: null })}>← Kembali ke Cermin</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
