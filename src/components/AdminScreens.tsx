import React, { useEffect, useState } from 'react';
import { useApp, Cloud, fmtIDR, fmtDate, fmtTime, ORDER_STAGES } from '../store';
import type { AdminData } from '../store';
import { SubbarAdmin } from '../ui';

async function loadAdmin(force: boolean, cache: { at: number; data: AdminData | null }): Promise<AdminData> {
  if (!force && cache.data && Date.now() - cache.at < 15000) return cache.data;
  const data = await Cloud.call<AdminData>('/admin');
  return data;
}

function useAdminData(forceKey: string) {
  const { s, set } = useApp();
  const [data, setData] = useState<AdminData | null>(s.adminCache.at && Date.now() - s.adminCache.at < 15000 ? s.adminCache.data : null);
  const [err, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadAdmin(false, s.adminCache)
      .then((d) => { if (live) { setData(d); set({ adminCache: { at: Date.now(), data: d } }); } })
      .catch((e) => live && setError(String(e.message || e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceKey]);
  return { data, err };
}

const Loading = () => <div className="empty-state" style={{ padding: '32px 24px' }}><p className="muted-sm">Memuat data toko…</p></div>;

const ErrBox = ({ msg, retry }: { msg: string; retry: () => void }) => (
  <div className="empty-state">
    <div className="empty-state__art"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg></div>
    <p className="serif-sm">Data tidak dapat dimuat</p>
    <p className="muted-sm">{msg}</p>
    <button type="button" className="btn btn--outline btn--sm" onClick={retry}>Coba Lagi</button>
  </div>
);

export function AdminDashboard() {
  const { s, goto } = useApp();
  const [tick, setTick] = useState(0);
  const { data, err } = useAdminData('dash' + tick);
  return (
    <section className="screen is-active screen--sub" id="screen-admin" data-tab="admin" aria-label="Dashboard admin">
      <SubbarAdmin title="Dashboard Toko" sub="Aura Atelier" right={
        <button type="button" className="icon-btn" aria-label="Akun" onClick={() => goto('akun')}>👤</button>
      } />
      <div className="screen__body" id="admin-body">
        {!data && !err && <Loading />}
        {err && <ErrBox msg={err} retry={() => setTick((t) => t + 1)} />}
        {data && (<>
          <p className="label-xs">Ringkasan Toko</p>
          <div className="adm-stats">
            <div className="adm-stat"><b>{fmtIDR(data.stats.revenue).replace('Rp ', '')}</b><small>Pendapatan</small></div>
            <div className="adm-stat"><b>{data.stats.orders}</b><small>Pesanan</small></div>
            <div className="adm-stat"><b>{data.stats.itemsSold}</b><small>Item Terjual</small></div>
            <div className="adm-stat"><b>{data.stats.users}</b><small>Pengguna</small></div>
            <div className="adm-stat"><b>{data.stats.reviews}</b><small>Ulasan</small></div>
            <div className="adm-stat"><b>{data.stats.avgRating ?? '—'}</b><small>Rata² Rating</small></div>
          </div>

          <p className="label-xs">Menu Cepat</p>
          <div className="adm-nav">
            <button type="button" onClick={() => goto('admin-pesanan')}><b>📦</b><span>Kelola Pesanan</span><small>{data.stats.orders} pesanan</small></button>
            <button type="button" onClick={() => goto('admin-ulasan')}><b>⭐</b><span>Moderasi Ulasan</span><small>{data.stats.reviews} ulasan</small></button>
            <button type="button" onClick={() => goto('admin-pengguna')}><b>👥</b><span>Pengguna</span><small>{data.stats.users} akun</small></button>
            <button type="button" onClick={() => goto('shop')}><b>🛍️</b><span>Buka Toko</span><small>mode pembeli</small></button>
          </div>

          <p className="label-xs">Pesanan Terbaru</p>
          {(data.recentOrders || []).slice(0, 3).map((o) => (
            <div key={o.id + o.buyer} className="adm-order">
              <div className="adm-order__top">
                <span className="adm-order__id">{o.id}</span>
                <span className={`status-chip ${o.statusIndex === 5 ? 'status-chip--done' : 'status-chip--progress'}`}>{ORDER_STAGES[o.statusIndex]}</span>
              </div>
              <p className="adm-order__meta">{o.buyer || ''} · {fmtDate(o.at)} {fmtTime(o.at)} · {fmtIDR(o.totals?.total || 0)}</p>
            </div>
          )) || null}
          {(data.recentOrders || []).length === 0 && <p className="muted-sm" style={{ padding: '6px 2px 14px' }}>Belum ada pesanan.</p>}
          <p className="fineprint" style={{ marginTop: 10 }}>Data langsung dari database toko · <button type="button" className="link-btn" style={{ padding: 0 }} onClick={() => setTick((t) => t + 1)}>Muat ulang</button></p>
        </>)}
      </div>
    </section>
  );
}

export function AdminOrders() {
  const { s, set, toast } = useApp();
  const [tick, setTick] = useState(0);
  const { data, err } = useAdminData('ord' + tick);
  const setOrder = async (buyer: string, id: string, statusIndex: number) => {
    try {
      await Cloud.call('/admin', { method: 'POST', body: { action: 'order', buyer, id, statusIndex } });
      toast(`Status ${id} → ${ORDER_STAGES[statusIndex]}.`);
      set({ adminCache: { at: 0, data: null } });
      setTick((t) => t + 1);
    } catch (e: any) { toast('Gagal: ' + (e.message || e)); }
  };
  void s;
  return (
    <section className="screen is-active screen--sub" id="screen-admin-pesanan" data-tab="admin-pesanan" aria-label="Kelola pesanan">
      <SubbarAdmin title="Kelola Pesanan" sub="semua pembeli" />
      <div className="screen__body" id="admin-pesanan-body">
        {!data && !err && <Loading />}
        {err && <ErrBox msg={err} retry={() => setTick((t) => t + 1)} />}
        {data && (<>
          <p className="label-xs">Semua Pesanan — ubah status pengiriman</p>
          {(data.recentOrders || []).map((o) => (
            <div key={o.id + (o.buyer || '')} className="adm-order">
              <div className="adm-order__top">
                <span className="adm-order__id">{o.id}</span>
                <span className="order-row__total">{fmtIDR(o.totals?.total || 0)}</span>
              </div>
              <p className="adm-order__meta">{o.buyer || ''} · {fmtDate(o.at)} {fmtTime(o.at)} · {(o.items || []).reduce((a, i) => a + (i.qty || 1), 0)} item</p>
              <select className="control" value={o.statusIndex} onChange={(e) => setOrder(o.buyer || '', o.id, Number(e.target.value))}>
                {ORDER_STAGES.map((st, i) => <option key={st} value={i}>{st}</option>)}
              </select>
            </div>
          ))}
          {(data.recentOrders || []).length === 0 && <p className="muted-sm" style={{ padding: '6px 2px 14px' }}>Belum ada pesanan.</p>}
        </>)}
      </div>
    </section>
  );
}

export function AdminReviews() {
  const { set, toast } = useApp();
  const [tick, setTick] = useState(0);
  const { data, err } = useAdminData('rev' + tick);
  const del = async (sku: string, at: string) => {
    try {
      await Cloud.call('/admin', { method: 'POST', body: { action: 'review-del', sku, at } });
      toast('Ulasan dihapus.');
      set({ adminCache: { at: 0, data: null } });
      setTick((t) => t + 1);
    } catch (e: any) { toast('Gagal: ' + (e.message || e)); }
  };
  return (
    <section className="screen is-active screen--sub" id="screen-admin-ulasan" data-tab="admin-ulasan" aria-label="Moderasi ulasan">
      <SubbarAdmin title="Moderasi Ulasan" sub="semua produk" />
      <div className="screen__body" id="admin-ulasan-body">
        {!data && !err && <Loading />}
        {err && <ErrBox msg={err} retry={() => setTick((t) => t + 1)} />}
        {data && (<>
          <p className="label-xs">Moderasi Ulasan Pengguna</p>
          {(data.recentReviews || []).map((r, i) => (
            <div key={(r.sku || '') + (r.at || '') + i} className="adm-review">
              <div>
                <p className="adm-review__text">"{r.text}"</p>
                <p className="adm-review__meta">{r.name || 'Pembeli'} · {'★'.repeat(r.rating || 0)} · {r.sku} · {fmtDate(r.at || '')}</p>
              </div>
              <button type="button" className="btn btn--danger btn--sm" onClick={() => del(r.sku || '', r.at || '')}>Hapus</button>
            </div>
          ))}
          {(data.recentReviews || []).length === 0 && <p className="muted-sm" style={{ padding: '6px 2px 14px' }}>Belum ada ulasan pengguna.</p>}
        </>)}
      </div>
    </section>
  );
}

export function AdminUsers() {
  const [tick, setTick] = useState(0);
  const { data, err } = useAdminData('usr' + tick);
  return (
    <section className="screen is-active screen--sub" id="screen-admin-pengguna" data-tab="admin-pengguna" aria-label="Daftar pengguna">
      <SubbarAdmin title="Pengguna" sub="terdaftar di toko" />
      <div className="screen__body" id="admin-pengguna-body">
        {!data && !err && <Loading />}
        {err && <ErrBox msg={err} retry={() => setTick((t) => t + 1)} />}
        {data && (<>
          <p className="label-xs">Pengguna Terdaftar</p>
          {(data.users || []).map((u, i) => (
            <div key={(u.email || '') + i} className="adm-user">
              <div><b>{u.name || ''}</b><br /><span className="adm-user__email">{u.email || ''}</span></div>
              <span className="mono-muted">{u.createdAt ? fmtDate(u.createdAt) : ''}</span>
            </div>
          ))}
          {(data.users || []).length === 0 && <p className="muted-sm">Belum ada pengguna.</p>}
        </>)}
      </div>
    </section>
  );
}
