/** Elemen UI bersama — memakai class CSS global yang sama (paritas visual penuh). */
import React from 'react';
import { ORDER_STAGES, useApp } from './store';

export function Stepper({ active }: { active: 1 | 2 | 3 }) {
  const { goto, s } = useApp();
  const curIdx: Record<string, number> = { bag: 1, pengiriman: 2, pembayaran: 3 };
  const items: [string, string][] = [['Informasi', '1'], ['Pengiriman', '2'], ['Pembayaran', '3']];
  return (
    <div className="steps-row">
      <ol className="stepper">
        {items.map(([label, num], i) => {
          const step = i + 1;
          const cls = step < active ? 'is-done' : step === active ? 'is-active' : '';
          return (
            <li key={label} className={cls} data-step={step} onClick={() => {
              if (step < (curIdx[s.route] ?? 9)) goto(['bag', 'pengiriman', 'pembayaran'][step - 1]);
            }}>
              <span className="stepper__num">{step < active ? '✓' : num}</span>
              <span className="stepper__lbl">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Stars({ avg, cls = '' }: { avg: number; cls?: string }) {
  const pct = Math.max(0, Math.min(100, (avg / 5) * 100));
  return (
    <span className={`stars ${cls}`} aria-label={`Rating ${avg} dari 5`}>
      <span className="stars__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

export function EmptyState({ icon, title, desc, children }: { icon?: React.ReactNode; title: string; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__art">{icon}</div>}
      <p className="serif-sm">{title}</p>
      {desc && <p className="muted-sm">{desc}</p>}
      {children}
    </div>
  );
}

export const IconSearch = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const IconHeart = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.6-9.3-9A5.4 5.4 0 0 1 12 6.3 5.4 5.4 0 0 1 21.3 11c-2.3 4.4-9.3 9-9.3 9z" /></svg>;
export const IconBag = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1.2 12H7.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
export const IconBack = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>;

export function CustomerTabBar() {
  const { s, goto, set } = useApp();
  const count = s.cart.reduce((a, i) => a + i.qty, 0);
  const savedN = s.saved.length;
  const tab = (screen: HTMLElement | null) => screen?.dataset.tab ?? 'none';
  return (
    <nav className="tabbar" role="navigation" aria-label="Navigasi utama"
      hidden={s.auth?.role === 'admin' || s.route === 'login'}>
      {([['shop', 'Shop', <svg key="s" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>],
      ['studio', 'Studio', <svg key="t" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="9" width="19" height="7" rx="2" /><path d="M7 9v3.5M11.5 9v3.5M16 9v3.5" /></svg>],
      ['saved', 'Saved', <IconHeart key="h" />],
      ['bag', 'Bag', <IconBag key="b" />]] as [string, string, React.ReactNode][]).map(([id, label, icon]) => {
        const active = tab(document.getElementById('screen-' + s.route)) === id;
        return (
          <button key={id} type="button" className={`tab${active ? ' is-active' : ''}`} onClick={() => goto(id)}>
            {icon}<span>{label}</span>
            {id === 'bag' && <span className="badge" hidden={count === 0}>{count}</span>}
          </button>
        );
      })}
      <span className="badge" hidden={savedN > 0 ? false : true} data-ignored />
    </nav>
  );
}

export function AdminTabBar() {
  const { s, goto } = useApp();
  const items: [string, string, React.ReactNode][] = [
    ['admin', 'Dashboard', <svg key="1" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>],
    ['admin-pesanan', 'Pesanan', <svg key="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13l5 5v3h-2a3 3 0 0 1-6 0H9a3 3 0 0 1-6 0z" /><circle cx="6.5" cy="16" r="1.5" /><circle cx="16.5" cy="16" r="1.5" /></svg>],
    ['admin-ulasan', 'Ulasan', <svg key="3" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" /></svg>],
    ['admin-pengguna', 'Pengguna', <svg key="4" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17.5" cy="9" r="2.5" /><path d="M14.5 14.5A5.5 5.5 0 0 1 21.5 20" /></svg>],
    ['shop', 'Toko', <svg key="5" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" /></svg>],
  ];
  return (
    <nav className="tabbar tabbar--admin" id="admin-tabbar" role="navigation" aria-label="Navigasi admin"
      hidden={!(s.auth?.role === 'admin') || s.route === 'login'}>
      {items.map(([id, label, icon]) => (
        <button key={id} type="button" className={`tab${s.route === id ? ' is-active' : ''}`}
          onClick={() => goto(id === 'shop' ? 'shop' : id)}>
          {icon}<span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function ToastHost() {
  const { s } = useApp();
  if (!s.toast) return null;
  return <div className="toast" role="status" aria-live="polite">{s.toast}</div>;
}

export function SubbarAdmin({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <header className="subbar subbar--admin">
      <span className="admin-pill">ADMIN</span>
      <div className="subbar__titles"><strong>{title}</strong><span className="mono">{sub}</span></div>
      {right ?? <span className="subbar__spacer" aria-hidden="true" />}
    </header>
  );
}

export function Subbar({ backTo, title, sub, right }: { backTo: string; title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  const { goto } = useApp();
  return (
    <header className="subbar">
      <button type="button" className="icon-btn" aria-label="Kembali" onClick={() => goto(backTo)}><IconBack /></button>
      <div className="subbar__titles"><strong>{title}</strong>{sub != null && <span className="mono">{sub}</span>}</div>
      {right ?? <span className="subbar__spacer" aria-hidden="true" />}
    </header>
  );
}

export const StageLabel = (i: number) => ORDER_STAGES[i] ?? '';
