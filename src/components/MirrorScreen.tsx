import React, { useEffect, useRef, useState } from 'react';
import { CATALOG, prod } from '../data';
import { detectSkinToneFromRGB, scoreColorHarmony, SKIN_TONES } from '../engine';
import { useApp, inStock, STORE } from '../store';
import type { SkinToneId } from '../types';
import { Subbar } from '../ui';

const MIRROR_SHAPES: Record<string, string> = {
  tee: 'M 360 330 Q 448 385 536 330 L 646 360 L 726 505 L 646 540 L 614 480 L 602 920 Q 448 945 294 920 L 282 480 L 250 540 L 170 505 L 250 360 Z',
  longsleeve: 'M 360 330 Q 448 385 536 330 L 646 360 L 774 845 L 702 870 L 614 485 L 602 920 Q 448 945 294 920 L 282 485 L 194 870 L 122 845 L 250 360 Z',
  hoodie: 'M 350 326 Q 448 376 546 326 L 646 360 L 730 525 L 650 558 L 616 490 L 602 935 Q 448 958 294 935 L 280 490 L 246 558 L 166 525 L 250 360 Z',
  shirt: 'M 360 328 L 416 352 L 448 390 L 480 352 L 536 328 L 646 360 L 726 510 L 646 545 L 614 485 L 602 930 Q 448 955 294 930 L 282 485 L 250 545 L 170 510 L 250 360 Z',
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
    const sizeFactor = 1 + ((idx < 0 ? 1 : idx) - (idxM < 0 ? 1 : idxM)) * 0.05;

    // Patokan langsung dari kedua sisi bahu (sL dan sR):
    // Lebar bahu di SVG adalah 396 unit (X: 250 ke 646), disesuaikan dengan drop shoulder boxy (1.08x)
    const targetShoulderPx = Math.min(shoulderPx * 1.08 * sizeFactor, W * 0.98);
    const scale = targetShoulderPx / 396;

    ctx.save();
    // Anchor persis di garis tengah kedua bahu (sL dan sR)
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    // Titik tengah garis bahu pada shape SVG berada di (448, 360)
    ctx.translate(-448, -360);

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = color;
    ctx.fill(shape);

    ctx.globalAlpha = 1;
    ctx.lineWidth = 3.0 / scale;
    ctx.strokeStyle = 'rgba(18,18,18,0.38)';
    ctx.stroke(shape);

    // Garis ribbing kerah melengkung halus mengikuti lekukan leher
    ctx.beginPath();
    ctx.moveTo(360, 330);
    ctx.quadraticCurveTo(448, 385, 536, 330);
    ctx.lineWidth = 2.4 / scale;
    ctx.strokeStyle = 'rgba(250,249,246,0.55)';
    ctx.stroke();
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

      const heightCm = s.profile?.metrics.height_cm || 170;
      let bodyPx = 0;
      if (lm[28] && lm[28].visibility > 0.45) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[28], canvas, video).y);
      else if (lm[24] && lm[24].visibility > 0.45) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[24], canvas, video).y) * 1.95;
      else if (lm[0] && lm[9] && lm[10]) {
        const mouthY = (lmToCanvas(lm[9], canvas, video).y + lmToCanvas(lm[10], canvas, video).y) / 2;
        const headH = Math.abs(mouthY - lmToCanvas(lm[0], canvas, video).y) * 3.5;
        if (headH > 40) bodyPx = headH * 7.5;
      }
      if (bodyPx > 0) {
        const rawShoulderCm = shoulderPx! / (bodyPx / heightCm);
        const shoulderCm = Math.max(34, Math.min(58, rawShoulderCm));
        measuredShoulderRef.current = Math.round(shoulderCm * 10) / 10;
        const sz = p.sizes.find((x) => x.size_label === mirrorSize);
        const eff = (sz?.shoulder_width_cm || 46) * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100);
        const diff = eff - shoulderCm;
        next.shoulder = `Bahu Anda ±${Math.round(shoulderCm)} cm`;
        if (diff >= -2.5 && diff <= 3.5) { next.fit = `Size ${mirrorSize} ✓ Pas di bahu`; next.ok = true; }
        else if (diff < -2.5) { next.fit = `Size ${mirrorSize} agak ketat`; next.warn = true; }
        else next.fit = `Size ${mirrorSize} agak longgar`;
        const sug = r
          ? { l: r.isBestOutOfStock && r.bestInStock ? r.bestInStock.size_label : r.best.size_label }
          : p.sizes
              .filter((x) => inStock(p.sku_id, x.size_label))
              .map((x) => ({ l: x.size_label, eff: x.shoulder_width_cm * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) }))
              .sort((a, b) => Math.abs(a.eff - shoulderCm - 2) - Math.abs(b.eff - shoulderCm - 2))[0];
        if (sug && sug.l !== mirrorSize) next.fit += ` → AI: ${sug.l}`;
      }
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
