import React, { useEffect, useRef, useState } from 'react';
import { prod } from '../data';
import { useApp, inStock } from '../store';
import { Subbar } from '../ui';

const MIRROR_SHAPES: Record<string, string> = {
  tee: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 900 Q448 930 574 900 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 372 356 300 Z',
  hoodie: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 930 Q448 960 574 930 L574 470 L596 512 L680 470 L628 336 L540 300 Q448 396 356 300 Z',
  shirt: 'M356 300 L268 336 L216 470 L300 512 L322 470 L322 940 Q448 966 574 940 L574 470 L596 512 L680 470 L628 336 L540 300 L470 330 L426 300 Z',
};
const SHAPE_BY_CAT: Record<string, string> = { 'T-Shirt': 'tee', 'Longsleeve': 'tee', 'Hoodie': 'hoodie', 'Kemeja': 'shirt' };
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
  const [fallback, setFallback] = useState(false);
  const [hud, setHud] = useState({ status: 'Menyiapkan kamera…', shoulder: 'Bahu: —', fit: '', ok: false, warn: false });

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
    const lmOk = lm && lm[11] && lm[12] && lm[11].visibility > 0.5 && lm[12].visibility > 0.5;
    let cx: number, topY: number, shoulderPx: number;
    if (lmOk) {
      const sL = lmToCanvas(lm[11], canvas, video), sR = lmToCanvas(lm[12], canvas, video);
      shoulderPx = Math.hypot(sR.x - sL.x, sR.y - sL.y);
      cx = (sL.x + sR.x) / 2;
      topY = Math.min(sL.y, sR.y) - shoulderPx * 0.22;
    } else {
      shoulderPx = W * 0.26; cx = W / 2; topY = H * 0.24;
    }

    const idx = p.sizes.findIndex((x) => x.size_label === mirrorSize);
    const idxM = p.sizes.findIndex((x) => x.size_label === 'M');
    const sizeFactor = 1 + ((idx < 0 ? 1 : idx) - (idxM < 0 ? 1 : idxM)) * 0.055;
    const gw = shoulderPx * 2.08 * sizeFactor, gh = gw * (1200 / 896);

    ctx.save();
    ctx.translate(cx - gw / 2, topY);
    ctx.scale(gw / 896, gh / 1200);
    ctx.globalAlpha = 0.88; ctx.fillStyle = color; ctx.fill(shape);
    ctx.globalAlpha = 1; ctx.lineWidth = 3.5 * (896 / gw); ctx.strokeStyle = 'rgba(18,18,18,0.35)'; ctx.stroke(shape);
    ctx.beginPath(); ctx.moveTo(356, 318); ctx.lineTo(540, 318);
    ctx.lineWidth = 2.5 * (896 / gw); ctx.strokeStyle = 'rgba(250,249,246,0.55)'; ctx.stroke();
    ctx.restore();

    const next: typeof hud = { ...hud, ok: false, warn: false };
    if (lmOk) {
      next.status = trackingRef.current ? 'Terkunci ✓ — diproses di perangkat Anda' : 'Cermin manual';
      const heightCm = s.profile?.metrics.height_cm || 170;
      let bodyPx = 0;
      if (lm[28] && lm[28].visibility > 0.4) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[28], canvas, video).y);
      else if (lm[24]) bodyPx = Math.abs(lmToCanvas(lm[0], canvas, video).y - lmToCanvas(lm[24], canvas, video).y) * 1.95;
      if (bodyPx > 0) {
        const shoulderCm = shoulderPx! / (bodyPx / heightCm);
        const sz = p.sizes.find((x) => x.size_label === mirrorSize);
        const eff = (sz?.shoulder_width_cm || 46) * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100);
        const diff = eff - shoulderCm;
        next.shoulder = `Bahu Anda ±${Math.round(shoulderCm)} cm`;
        if (diff >= -2.5 && diff <= 3.5) { next.fit = `Size ${mirrorSize} ✓ Pas di bahu`; next.ok = true; }
        else if (diff < -2.5) { next.fit = `Size ${mirrorSize} agak ketat`; next.warn = true; }
        else next.fit = `Size ${mirrorSize} agak longgar`;
        const sug = p.sizes
          .map((x) => ({ l: x.size_label, eff: x.shoulder_width_cm * (1 - (p.fabric_specs.shrinkage_after_wash_pct || 0) / 100) }))
          .sort((a, b) => Math.abs(a.eff - shoulderCm - 2) - Math.abs(b.eff - shoulderCm - 2))[0];
        if (sug && sug.l !== mirrorSize) next.fit += ` → AI: ${sug.l}`;
      }
    } else {
      next.status = trackingRef.current ? 'Mengunci tubuh… jaga jarak ±1–2 m' : 'Cermin manual — AI belum aktif';
      next.shoulder = 'Bahu: mengunci…';
      next.fit = `Size ${mirrorSize}`;
    }
    setHud(next);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
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
        <p className="fineprint" style={{ padding: '8px 16px 16px' }}>
          {s.profile ? '🪞 Pose AI berjalan di perangkat — pakaian diposisikan mengikuti bahu Anda, dan lebar bahu diestimasi dari kamera untuk cek kecocokan size.' : '🪞 Pose AI berjalan di perangkat. Tip: isi Atelier Consultation dulu agar estimasi bahu memakai tinggi badan Anda.'}
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
