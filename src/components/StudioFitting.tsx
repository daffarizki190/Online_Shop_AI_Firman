import React, { useEffect, useState } from 'react';
import { prod } from '../data';
import { estimateBody, FIT_PREFERENCE_EASE } from '../engine';
import { useApp, STORE, Cloud, fmtK, inStock } from '../store';
import { Subbar } from '../ui';
import type { FitResult } from '../types';

const SHAPES = [
  { id: 'inverted_triangle', label: 'Segitiga Terbalik', desc: 'Bahu jauh lebih lebar dari pinggul.', path: 'M8 12 Q20 6 32 12 L36 28 L28 58 L12 58 L4 28 Z' },
  { id: 'rectangle', label: 'Persegi', desc: 'Bahu, pinggang, dan pinggul relatif sejajar.', path: 'M12 12 Q20 8 28 12 L29 58 L11 58 Z' },
  { id: 'oval', label: 'Oval', desc: 'Volume terpusat di tengah badan.', path: 'M12 12 Q20 7 28 12 Q34 30 28 48 Q20 60 12 48 Q6 30 12 12 Z' },
  { id: 'hourglass', label: 'Jam Pasir', desc: 'Dada & pinggul seimbang, pinggang terdefinisi.', path: 'M10 12 Q20 7 30 12 L26 30 L31 58 L9 58 L14 30 Z' },
];

export function StudioScreen() {
  const { s, set, goto, toast } = useApp();
  const [height, setHeight] = useState(String(s.profile?.metrics.height_cm ?? 172));
  const [weight, setWeight] = useState(String(s.profile?.metrics.weight_kg ?? 68));
  const [age, setAge] = useState(String(s.profile?.age ?? 27));
  const [gender, setGender] = useState<'male' | 'female'>((s.profile?.gender as any) ?? 'male');
  const [fit, setFit] = useState<'tight' | 'regular' | 'oversized'>(s.profile?.fit_preference ?? 'regular');
  const [shape, setShape] = useState((s.profile?.metrics.body_shape as string) ?? 'rectangle');
  const [bad, setBad] = useState<Record<string, boolean>>({});

  const bmi = Number(height) && Number(weight) ? Number(weight) / (Number(height) / 100) ** 2 : 0;
  const step = s.studioStep;

  const compute = () => {
    const now = new Date().toISOString();
    const body = estimateBody({ gender, height_cm: +height, weight_kg: +weight, age: +age, body_shape: shape });
    const profile = {
      user_id: 'usr_demo_001', profile_name: 'My Fit', gender, age: +age, input_method: 'questionnaire_v1',
      metrics: { ...body, height_cm: +height, weight_kg: +weight, body_shape: shape },
      fit_preference: fit, created_at: s.profile?.created_at ?? now, updated_at: now,
    };
    localStorage.setItem(STORE.profile, JSON.stringify(profile));
    set({ profile, results: {} });
    if (Cloud.token && s.auth) Cloud.call('/profile', { method: 'PUT', body: { profile } }).catch(() => {});
    const p = prod(s.currentSku);
    toast(`Rekomendasi siap. Profil tersimpan.`);
    goto('fitting');
    void p;
  };

  const next = () => {
    if (step === 1) {
      const errs: Record<string, boolean> = {};
      const chk: [string, number, number][] = [['h', +height, 100], ['w', +weight, 30], ['a', +age, 10]];
      const lim: Record<string, [number, number]> = { h: [100, 230], w: [30, 200], a: [10, 99] };
      chk.forEach(([k, v]) => { const [lo, hi] = lim[k]; errs[k] = !(v >= lo && v <= hi); });
      setBad(errs);
      if (Object.values(errs).some(Boolean)) return toast('Periksa kembali angka yang Anda masukkan.');
      set({ draft: { height: +height, weight: +weight, age: +height ? +age : age, gender }, studioStep: 2 });
      return;
    }
    compute();
  };

  return (
    <section className="screen is-active" id="screen-studio" data-tab="studio" aria-label="Konsultasi ukuran">
      <Subbar backTo="shop" title="Atelier Consultation" sub={step === 1 ? '01 / 02' : '02 / 02'} />
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={step === 1 ? 50 : 100}>
        <span style={{ width: step === 1 ? '50%' : '100%' }} />
      </div>
      <div className="screen__body">
        {step === 1 ? (
          <div className="studio-step" data-step="1">
            <h2 className="serif-title">Detail Tubuh Anda</h2>
            <p className="muted-sm">Masukkan data berikut untuk analisis presisi. Hanya dipakai menghitung pola potongan — tidak dibagikan.</p>
            <div className="field-row">
              <div className={`field${bad.h ? ' field--error' : ''}`}>
                <label htmlFor="f-height">Tinggi Badan</label>
                <div className="field__control"><input type="number" inputMode="numeric" value={height} onChange={(e) => { setHeight(e.target.value); setBad({ ...bad, h: false }); }} /><span className="unit">cm</span></div>
              </div>
              <div className={`field${bad.w ? ' field--error' : ''}`}>
                <label htmlFor="f-weight">Berat Badan</label>
                <div className="field__control"><input type="number" inputMode="numeric" value={weight} onChange={(e) => { setWeight(e.target.value); setBad({ ...bad, w: false }); }} /><span className="unit">kg</span></div>
              </div>
              <div className={`field${bad.a ? ' field--error' : ''}`}>
                <label htmlFor="f-age">Usia</label>
                <div className="field__control"><input type="number" inputMode="numeric" value={age} onChange={(e) => { setAge(e.target.value); setBad({ ...bad, a: false }); }} /><span className="unit">th</span></div>
              </div>
            </div>
            <p className="label-xs">Jenis Kelamin</p>
            <div className="segmented" role="radiogroup" aria-label="Jenis kelamin">
              <label><input type="radio" checked={gender === 'male'} onChange={() => setGender('male')} /><span>Laki-laki</span></label>
              <label><input type="radio" checked={gender === 'female'} onChange={() => setGender('female')} /><span>Perempuan</span></label>
            </div>
            {bmi > 0 && <p className="bmi-hint mono">IMT {bmi.toFixed(1)} — membantu AI mengestimasi lingkar dada &amp; pinggang Anda.</p>}
          </div>
        ) : (
          <div className="studio-step" data-step="2">
            <h2 className="serif-title">Preferensi &amp; Postur</h2>
            <p className="muted-sm">Dua data terakhir untuk mengkalibrasi jatuh potongan boxy.</p>
            <p className="label-xs">Preferensi Fit</p>
            <div className="choice-row" role="radiogroup" aria-label="Preferensi potongan">
              {([['tight', 'Terpotong'], ['regular', 'Reguler'], ['oversized', 'Longgar']] as const).map(([v, l]) => (
                <label key={v} className="choice"><input type="radio" checked={fit === v} onChange={() => setFit(v)} /><span>{l}</span></label>
              ))}
            </div>
            <p className="label-xs">Bentuk Tubuh</p>
            <div className="shape-grid" role="radiogroup" aria-label="Bentuk postur tubuh">
              {SHAPES.map((sh) => (
                <label key={sh.id} className="shape">
                  <input type="radio" checked={shape === sh.id} onChange={() => setShape(sh.id)} />
                  <span className="shape__box">
                    <svg viewBox="0 0 40 64" aria-hidden="true"><circle cx="20" cy="6" r="4" /><path d={sh.path} /></svg>
                    <span className="shape__label">{sh.label}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="fineprint">{SHAPES.find((x) => x.id === shape)?.desc}</p>
          </div>
        )}
      </div>
      <div className="screen__cta screen__cta--split">
        <button type="button" className="btn btn--ghost" hidden={step === 1} onClick={() => set({ studioStep: 1 })}>Kembali</button>
        <button type="button" className="btn btn--dark btn--block" onClick={next}>{step === 1 ? 'Lanjut →' : 'Lihat Rekomendasi →'}</button>
      </div>
    </section>
  );
}

/* ---------------- Fitting ---------------- */
const STATUS_LABEL: Record<string, string> = { fit: 'Pas', tight: 'Agak Ketat', loose: 'Agak Longgar' };
const zoneCopy = {
  shoulder: (z: any) => ({ fit: 'Drop-shoulder jatuh pas', tight: 'Bahu terasa sempit', loose: 'Bahu turun berlebih' } as Record<string, string>)[z.status],
  chest: (z: any) => ({ fit: `${z.ease >= 0 ? '+' : ''}${z.ease} cm ruang gerak`, tight: `Hanya ${z.ease} cm ruang gerak`, loose: `+${z.ease} cm, terlalu lapang` } as Record<string, string>)[z.status],
  length: (z: any) => ({ fit: 'Jatuh di atas pinggul', tight: 'Cenderung pendek', loose: 'Melewati pinggul' } as Record<string, string>)[z.status],
};
const ZONE_NAME: Record<string, string> = { shoulder: 'Bahu', chest: 'Dada', length: 'Panjang' };
const ZONE_TOL: Record<string, number> = { chest: 3.5, shoulder: 2.5, length: 2.5 };

function teeSvg(zones: any) {
  return (
    <svg className="tee-svg" viewBox="0 0 120 112" role="img" aria-label={`Peta fit: bahu ${STATUS_LABEL[zones.shoulder.status]}, dada ${STATUS_LABEL[zones.chest.status]}, panjang ${STATUS_LABEL[zones.length.status]}`}>
      <defs><clipPath id="tee-clip"><path d="M40 8 L20 14 L4 36 L19 47 L27 40 L27 106 L93 106 L93 40 L101 47 L116 36 L100 14 L80 8 Q60 22 40 8 Z" /></clipPath></defs>
      <g clipPath="url(#tee-clip)">
        <rect x="0" y="0" width="120" height="112" fill="#F4F2ED" />
        <rect className={`zone zone--${zones.shoulder.status}`} x="0" y="0" width="120" height="30" />
        <rect className={`zone zone--${zones.chest.status}`} x="0" y="34" width="120" height="34" />
        <rect className={`zone zone--${zones.length.status}`} x="0" y="86" width="120" height="26" />
      </g>
      <path className="tee-outline" d="M40 8 L20 14 L4 36 L19 47 L27 40 L27 106 L93 106 L93 40 L101 47 L116 36 L100 14 L80 8 Q60 22 40 8 Z" />
    </svg>
  );
}

export function FittingScreen() {
  const { s, set, goto, ensureResult, addToCart } = useApp();
  const p = prod(s.currentSku);
  const r: FitResult | null = s.profile ? ensureResult(p.sku_id) : null;
  const [anim, setAnim] = useState(0);
  useEffect(() => { setAnim((a) => a + 1); }, [s.previewSize]);

  if (!r) {
    return (
      <section className="screen is-active screen--sub" id="screen-fitting" data-tab="studio" aria-label="Hasil fitting">
        <Subbar backTo="studio" title="Atelier Fitting" />
        <div className="screen__body">
          <div className="empty-state">
            <div className="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17 17 3l4 4L7 21z" /><path d="m7 13 2 2M10 10l2 2M13 7l2 2" /></svg></div>
            <p className="serif-sm">Belum ada profil tubuh</p>
            <p className="muted-sm">Isi konsultasi 30 detik di Studio untuk melihat ukuran tepat &amp; peta fit per zona.</p>
            <button type="button" className="btn btn--outline btn--sm" onClick={() => goto('studio')}>Isi Konsultasi →</button>
          </div>
        </div>
      </section>
    );
  }

  const preview = r.ranked.find((x) => x.size_label === (s.previewSize || r.best.size_label)) || r.best;
  const isBest = preview.size_label === r.best.size_label;
  const prof = s.profile!;
  const shownConf = isBest ? r.confidence : Math.round(preview.score * 0.97);
  const proof = Math.max(72, Math.min(96, r.confidence - 6 + (prof.metrics.height_cm % 5)));
  const idealLength = Math.round(prof.metrics.height_cm * FIT_PREFERENCE_EASE[prof.fit_preference].lengthRatio * 10) / 10;
  const g = preview.garment;
  const preciseCount = (['chest', 'shoulder', 'length'] as const).filter((k) => preview.zones[k].status === 'fit').length;
  const circ = 2 * Math.PI * 26;
  const available = inStock(p.sku_id, preview.size_label);
  const compareRows = [
    { name: 'Lebar Dada', body: `${prof.metrics.estimated_chest_cm} cm`, g: `${g.chest_circ_cm} cm`, z: preview.zones.chest },
    { name: 'Lebar Bahu', body: `${prof.metrics.estimated_shoulder_cm} cm`, g: `${g.shoulder_cm} cm`, z: preview.zones.shoulder },
    { name: 'Panjang', body: `${idealLength} cm`, g: `${g.length_cm} cm`, z: preview.zones.length },
  ];

  return (
    <section className="screen is-active screen--sub" id="screen-fitting" data-tab="studio" aria-label="Hasil fitting">
      <Subbar backTo="studio" title="Atelier Fitting" sub={`${p.name} — ${p.variant}`} />
      <div className="screen__body">
        <p className="fitting__eyebrow">{isBest ? 'Hasil Analisis Atelier' : 'Pratinjau Ukuran Lain'}</p>
        <div className="fitting__head">
          <div className="fitting__size">{preview.size_label}<small>{isBest ? 'Ukuran Terbaik Anda' : 'Ukuran Dicek'}</small></div>
          <div className="ring" role="img" aria-label={`Kecocokan ${shownConf} persen`}>
            <svg viewBox="0 0 62 62" aria-hidden="true">
              <circle className="ring__bg" cx="31" cy="31" r="26" />
              <circle className={`ring__fg${shownConf < 75 ? ' is-low' : ''}`} cx="31" cy="31" r="26"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - shownConf / 100)} />
            </svg>
            <span className="ring__label"><b>{shownConf}%</b><small>COCOK</small></span>
          </div>
        </div>
        <p className="fitting__sub">
          {isBest ? (preciseCount === 3 ? 'Presisi di 3 titik — potongan jatuh pas di bahu, dada, dan panjang.' : `Presisi di ${preciseCount} dari 3 titik.`) : `AI tetap merekomendasikan ${r.best.size_label}.`}
        </p>
        <span className="method-badge">◎ Kuesioner · {({ tight: 'Terpotong', regular: 'Reguler', oversized: 'Longgar' } as Record<string, string>)[prof.fit_preference]} · {SHAPES.find((x) => x.id === prof.metrics.body_shape)?.label ?? '—'}</span>

        {isBest && (
          <div className="proof"><span className="proof__check">✓</span>
            <span><b>{proof}% pembeli</b> dengan TB {prof.metrics.height_cm} / BB {prof.metrics.weight_kg} kg memilih {r.best.size_label} &amp; tidak mengembalikannya. <span className="mono-muted">(data demo)</span></span>
          </div>
        )}

        <div className="tee-figure">{teeSvg(preview.zones)}</div>
        <div className="legend">
          <span><i style={{ background: '#CFE5D8' }} />Pas</span>
          <span><i style={{ background: '#F1C9BA' }} />Agak ketat</span>
          <span><i style={{ background: '#F0E0B4' }} />Agak longgar</span>
        </div>

        <p className="label-xs">Tingkat Jatuh Garmen</p>
        {(['shoulder', 'chest', 'length'] as const).map((k) => {
          const z = preview.zones[k];
          const x = Math.max(4, Math.min(96, 50 + (z.diff / ZONE_TOL[k]) * 22));
          return (
            <div key={k} className="zone-row">
              <div className="zone-row__top"><b>{ZONE_NAME[k]}</b><span className={`zone-row__status is-${z.status}`}>{zoneCopy[k](z)}</span></div>
              <div className="zone-bar"><span className={`zone-bar__marker is-${z.status}`} style={{ ['--x' as any]: `${x}%` }} /></div>
              <div className="zone-bar__scale"><span>Ketat</span><span>Pas</span><span>Longgar</span></div>
            </div>
          );
        })}

        <p className="label-xs">Bandingkan Ukuran</p>
        <div className="size-compare">
          {p.sizes.map((sz) => {
            const sc = r.ranked.find((x) => x.size_label === sz.size_label)!;
            return (
              <button key={sz.size_label} type="button" aria-pressed={sz.size_label === preview.size_label}
                className={sz.size_label === r.best.size_label ? 'is-best' : ''}
                onClick={() => set({ previewSize: sz.size_label })}>
                <b>{sz.size_label}</b><small>{sc.score}%</small>
              </button>
            );
          })}
        </div>

        <p className="label-xs">Ukuran Anda vs Size {preview.size_label}</p>
        <table className="spec-table">
          <thead><tr><th>Bagian</th><th className="num">Tubuh Anda</th><th className="num">Size {preview.size_label}</th><th className="num">Kelonggaran</th></tr></thead>
          <tbody>
            {compareRows.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td><td className="num">{row.body}</td><td className="num">{row.g}</td>
                <td className="num"><span className={`chip chip--${row.z.status}`}>{row.z.ease >= 0 ? '+' : ''}{row.z.ease} cm</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="construction">
          <h4>Konstruksi</h4>
          <ul>
            <li>{p.fabric_specs.material}</li>
            <li>Ribbed bound neckline, double-needle hem</li>
            <li>Garment-washed — susut stabil ±{p.fabric_specs.shrinkage_after_wash_pct}%</li>
            <li>Stretch kain {Math.round((p.fabric_specs.stretch_factor - 1) * 100)}% ikut dihitung</li>
          </ul>
        </div>
        <p className="fineprint" style={{ marginTop: 10 }}>Estimasi dimensi tubuh: dada {prof.metrics.estimated_chest_cm} · pinggang {prof.metrics.estimated_waist_cm} · pinggul {prof.metrics.estimated_hips_cm} cm.</p>

        <button type="button" className="btn btn--outline btn--sm btn--block" style={{ margin: '12px 0 2px' }}
          onClick={() => { set({ mirrorSku: p.sku_id, mirrorSize: null }); goto('cermin'); }}>🪞 Coba Cermin AI — lihat pas di badan lewat kamera</button>
      </div>
      <div className="screen__cta">
        <button type="button" className="btn btn--dark btn--block" disabled={!available}
          onClick={() => { set({ selectedSize: preview.size_label }); addToCart(p.sku_id, preview.size_label); goto('bag'); }}>
          {available ? `Pesan dengan Ukuran ${preview.size_label} · ${fmtK(p.price)}` : `Size ${preview.size_label} Stok Habis`}
        </button>
      </div>
    </section>
  );
}
