import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CATALOG, prod, summarize } from './data';
import { estimateBody, recommend } from './engine';
import { Cloud } from './cloud';
export { Cloud };
import type { Address, AuthUser, CartItem, FitProfile, FitResult, Order, ShipOption } from './types';

/* ---------------- konstanta ---------------- */
export const STORE = {
  profile: 'aura.profile.v1', cart: 'aura.cart.v1', feedback: 'aura.fitFeedback.v1',
  saved: 'aura.saved.v1', bagPrefs: 'aura.bagPrefs.v1', auth: 'aura.auth.v1',
  users: 'aura.users.v1', address: 'aura.address.v1', orders: 'aura.orders.v1',
  reviews: 'aura.reviews.v1',
} as const;

const load = <T,>(k: string, fallback: T): T => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return (v ?? fallback) as T; } catch { return fallback; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const SHIP_ZONES: Record<string, { label: string; eco: number; reg: number; exp: number; etas: Record<string, string> }> = {
  'DKI Jakarta': { label: 'Zona Jakarta', eco: 9000, reg: 15000, exp: 28000, etas: { eco: '3–5 hari', reg: '1–2 hari', exp: 'Hari ini' } },
  'Jawa Barat': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
  'Jawa Tengah': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
  'DI Yogyakarta': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
  'Jawa Timur': { label: 'Zona Jawa', eco: 12000, reg: 18000, exp: 32000, etas: { eco: '4–6 hari', reg: '2–3 hari', exp: '1 hari' } },
  'Bali': { label: 'Zona Bali & Nusra', eco: 18000, reg: 26000, exp: 40000, etas: { eco: '5–8 hari', reg: '3–4 hari', exp: '1–2 hari' } },
};
const SHIP_META = { eco: { id: 'eco', label: 'Ekonomis' }, reg: { id: 'reg', label: 'Reguler' }, exp: { id: 'exp', label: 'Ekspres' } } as const;

export function getShipOptions(prov?: string): ShipOption[] {
  const z = SHIP_ZONES[prov || ''] || SHIP_ZONES['Jawa Barat'];
  return (['eco', 'reg', 'exp'] as const).map((id) => ({
    ...(SHIP_META[id] as { id: ShipOption['id']; label: string }),
    cost: z[id], eta: z.etas[id], zone: z.label,
  }));
}

export const VOUCHERS: Record<string, number> = { FITPERTAMA: 45000 };
export const PAYMENTS: [string, string, string][] = [
  ['va', 'Transfer Bank', 'BCA · Virtual Account'],
  ['gopay', 'GoPay', 'Bayar langsung dari aplikasi'],
  ['qris', 'QRIS', 'Scan sekali — semua e-wallet & m-banking'],
  ['cc', 'Kartu Kredit', 'Visa / Mastercard'],
];
export const ORDER_STAGES = ['Pesanan Dibuat', 'Pembayaran Terverifikasi', 'Sedang Dikemas', 'Diserahkan ke Kurir', 'Dalam Perjalanan', 'Tiba di Tujuan'];
export const PROVINSI = Object.keys(SHIP_ZONES);
export const KOTA_BY_PROV: Record<string, string[]> = {
  'DKI Jakarta': ['Jakarta Selatan', 'Jakarta Barat', 'Jakarta Pusat', 'Jakarta Timur', 'Jakarta Utara'],
  'Jawa Barat': ['Bandung', 'Bekasi', 'Bogor', 'Depok', 'Cirebon'],
  'Jawa Tengah': ['Semarang', 'Solo', 'Magelang'],
  'DI Yogyakarta': ['Yogyakarta', 'Sleman', 'Bantul'],
  'Jawa Timur': ['Surabaya', 'Malang', 'Gresik'],
  'Bali': ['Denpasar', 'Badung', 'Ubud'],
};

export const fmtIDR = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
export const fmtK = (n: number) => 'Rp ' + Math.round(n / 1000) + 'k';
export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '–';
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
export const inStock = (sku: string, l: string) => ((prod(sku).stock as Record<string, number>)[l] ?? 0) > 0;

/* ---------------- state ---------------- */
export interface SearchState { q: string; cat: string; sort: string }

export interface AppState {
  route: string; param: string | null;
  currentSku: string; selectedSize: string | null; previewSize: string | null;
  results: Record<string, FitResult>;
  profile: FitProfile | null;
  cart: CartItem[]; saved: string[];
  shippingId: string; payMethod: string;
  voucher: { code: string; amount: number } | null; voucherError: string;
  studioStep: number; draft: Record<string, unknown>;
  auth: AuthUser | null; authMode: 'login' | 'register';
  address: Address | null; addressReturn: string;
  orders: Order[]; activeOrderId: string | null;
  userReviews: Record<string, any[]>; remoteReviews: Record<string, any[] | null>;
  search: SearchState; showAllReviews: boolean;
  mirrorSku: string | null; mirrorSize: string | null;
  toast: string | null; sheet: string | null; paying: boolean;
  reviewDraft: { sku: string | null; rating: number };
  adminCache: { at: number; data: AdminData | null };
  viewers: number;
}

export interface AdminStats { orders: number; revenue: number; itemsSold: number; users: number; reviews: number; avgRating: number | null }
export interface AdminData {
  stats: AdminStats;
  recentOrders: (Order & { buyer?: string })[];
  recentReviews: { name?: string; rating?: number; text?: string; sku?: string; at?: string }[];
  users: { email?: string; name?: string; phone?: string; createdAt?: string }[];
}

const bagPrefs = load(STORE.bagPrefs, {} as any);

export const initialState: AppState = {
  route: 'login', param: null,
  currentSku: CATALOG[0].sku_id, selectedSize: null, previewSize: null,
  results: {},
  profile: load(STORE.profile, null),
  cart: load(STORE.cart, []), saved: load(STORE.saved, []),
  shippingId: bagPrefs.shippingId || 'reg', payMethod: bagPrefs.payMethod || 'va',
  voucher: bagPrefs.voucher || null, voucherError: '',
  studioStep: 1, draft: {},
  auth: load(STORE.auth, null), authMode: 'login',
  address: load(STORE.address, null), addressReturn: 'pengiriman',
  orders: load(STORE.orders, []), activeOrderId: null,
  userReviews: load(STORE.reviews, {}), remoteReviews: {},
  search: { q: '', cat: 'Semua', sort: 'pop' }, showAllReviews: false,
  mirrorSku: null, mirrorSize: null,
  toast: null, sheet: null, paying: false,
  reviewDraft: { sku: null, rating: 0 },
  adminCache: { at: 0, data: null },
  viewers: 18 + Math.floor(Math.random() * 14),
};

/* ---------------- context ---------------- */
interface AppCtx {
  s: AppState;
  set: (patch: Partial<AppState>) => void;
  goto: (path: string) => void;
  toast: (msg: string) => void;
  ensureResult: (sku: string) => FitResult | null;
  cartCount: () => number;
  cartTotals: () => { subtotal: number; shipping: number; discount: number; total: number; ship: ShipOption };
  addToCart: (sku: string, size: string) => void;
  persistBagPrefs: () => void;
  syncPull: (email: string) => Promise<void>;
  fetchRemoteReviews: (sku: string) => void;
  completeOrder: (payLabel: string) => void;
}

const Ctx = createContext<AppCtx>(null!);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<AppState>(initialState);
  const sRef = useRef(s);
  sRef.current = s;
  const set = (patch: Partial<AppState>) => setS((prev) => ({ ...prev, ...patch }));
  const toastTimer = useRef<number | undefined>(undefined);

  const toast = (msg: string) => {
    set({ toast: msg });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => set({ toast: null }), 3400);
  };

  const goto = (path: string) => {
    if (location.hash === '#/' + path) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else location.hash = '#/' + path;
  };

  const ensureResult = (sku: string): FitResult | null => {
    const st = sRef.current;
    if (!st.profile) return null;
    if (!st.results[sku]) {
      const r = recommend(st.profile, prod(sku));
      setS((prev) => ({ ...prev, results: { ...prev.results, [sku]: r } }));
      return r;
    }
    return st.results[sku];
  };

  const cartCount = () => sRef.current.cart.reduce((a, i) => a + i.qty, 0);

  const cartTotals = () => {
    const st = sRef.current;
    const subtotal = st.cart.reduce((a, i) => a + i.qty * prod(i.sku).price, 0);
    const opts = getShipOptions(st.address?.provinsi);
    const ship = opts.find((o) => o.id === st.shippingId) || opts[1];
    const shipping = subtotal > 0 ? ship.cost : 0;
    const discount = st.voucher ? Math.min(st.voucher.amount, subtotal + shipping) : 0;
    return { subtotal, shipping, discount, total: Math.max(0, subtotal + shipping - discount), ship };
  };

  const persistBagPrefs = () => {
    const st = sRef.current;
    save(STORE.bagPrefs, { shippingId: st.shippingId, payMethod: st.payMethod, voucher: st.voucher });
  };

  const addToCart = (sku: string, size: string) => {
    const st = sRef.current;
    const r = st.profile ? ensureResult(sku) : null;
    const verified = !!r && r.best.size_label === size;
    const cart = [...st.cart];
    const ex = cart.find((i) => i.sku === sku && i.size === size);
    if (ex) ex.qty += 1;
    else cart.push({ sku, size, qty: 1, verified, confidence: verified ? r!.confidence : null });
    save(STORE.cart, cart);
    set({ cart });
    toast(verified ? `Size ${size} masuk tas — terverifikasi AI (${r!.confidence}% cocok).` : `Size ${size} masuk tas.`);
  };

  const syncPull = async (email: string) => {
    if (!Cloud.token || !email) return;
    try {
      const { orders } = await Cloud.call<{ orders: Order[] }>('/orders?email=' + encodeURIComponent(email));
      const ids = new Set(sRef.current.orders.map((o) => o.id));
      let added = false;
      const merged = [...sRef.current.orders];
      (orders || []).forEach((o) => { if (o && o.id && !ids.has(o.id)) { merged.push(o); added = true; } });
      if (added) {
        merged.sort((a, b) => String(b.at).localeCompare(String(a.at)));
        save(STORE.orders, merged);
        set({ orders: merged });
      }
    } catch { /* offline */ }
    try {
      const { profile } = await Cloud.call<{ profile: FitProfile | null }>('/profile?email=' + encodeURIComponent(email));
      if (profile && !sRef.current.profile) {
        save(STORE.profile, profile);
        set({ profile });
      }
    } catch { /* offline */ }
  };

  const fetchRemoteReviews = (sku: string) => {
    if (sRef.current.remoteReviews[sku]) return;
    Cloud.call<{ reviews: any[] }>('/reviews?sku=' + encodeURIComponent(sku))
      .then(({ reviews }) => setS((prev) => ({ ...prev, remoteReviews: { ...prev.remoteReviews, [sku]: reviews || [] } })))
      .catch(() => setS((prev) => ({ ...prev, remoteReviews: { ...prev.remoteReviews, [sku]: [] } })));
  };

  const completeOrder = (payLabel: string) => {
    const st = sRef.current;
    const t = cartTotals();
    const orderId = 'AA-' + Date.now().toString(36).toUpperCase().slice(-6);
    const now = new Date().toISOString();
    const order: Order = {
      id: orderId, at: now,
      items: st.cart.map((i) => ({ ...i, name: prod(i.sku).name, variant: prod(i.sku).variant, price: prod(i.sku).price })),
      totals: { subtotal: t.subtotal, shipping: t.shipping, discount: t.discount, total: t.total },
      shipping: t.ship, address: { ...st.address } as Address,
      payMethod: st.payMethod, payLabel,
      statusIndex: 0, timeline: [{ stage: 0, at: now }], feedback: null,
    };
    const orders = [order, ...st.orders];
    save(STORE.orders, orders);
    if (Cloud.token) Cloud.call('/orders', { method: 'POST', body: { order } }).catch(() => {});
    save(STORE.cart, []);
    persistBagPrefs();
    set({ orders, cart: [], voucher: null, voucherError: '', paying: false, activeOrderId: orderId });
    toast(`Pembayaran via ${payLabel} berhasil. Pesanan ${orderId} sedang diproses.`);
    goto('pesanan/' + orderId);
  };

  /* router hash + guard */
  const ROUTES = ['login', 'shop', 'produk', 'studio', 'fitting', 'cermin', 'saved', 'bag', 'pengiriman', 'pembayaran', 'alamat', 'akun', 'pesanan', 'bantuan', 'admin', 'admin-pesanan', 'admin-ulasan', 'admin-pengguna'];
  useEffect(() => {
    const onHash = () => {
      const h = (location.hash || '').replace(/^#\//, '');
      const [r0, p0] = h.split('/');
      let route = ROUTES.includes(r0) ? r0 : 'shop';
      const param = p0 || null;
      const st = sRef.current;

      if (!st.auth && route !== 'login') { location.replace('#/login'); return; }
      if (st.auth && route === 'login') route = st.auth.role === 'admin' ? 'admin' : 'shop';
      if (route.startsWith('admin') && st.auth?.role !== 'admin') { toast('Area ini khusus admin.'); location.replace('#/shop'); return; }

      const patch: Partial<AppState> = { route, param, sheet: null };
      if (route === 'shop' && !['shop', 'produk'].includes(st.route)) {
        patch.search = { q: '', cat: 'Semua', sort: 'pop' };
        const si = document.getElementById('search-input') as HTMLInputElement | null;
        if (si) si.value = '';
        const ss = document.getElementById('sort-select') as HTMLSelectElement | null;
        if (ss) ss.value = 'pop';
      }
      if (route === 'produk') patch.currentSku = prod(param || st.currentSku).sku_id;
      setS((prev) => ({ ...prev, ...patch }));
      document.getElementById('autocomplete')?.setAttribute('hidden', '');
      window.scrollTo(0, 0);
      const body = document.querySelector(`#screen-${route} .screen__body, #screen-${route}.screen--gate .login__body`);
      if (body) (body as HTMLElement).scrollTop = 0;
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /* sinkronisasi awal */
  useEffect(() => {
    Cloud.ping();
    if (s.auth && Cloud.token) syncPull(s.auth.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ticker status pesanan (simulasi maju otomatis) */
  useEffect(() => {
    const iv = window.setInterval(() => {
      const st = sRef.current;
      let changed = false;
      let arrived: Order | null = null;
      const orders = st.orders.map((o) => {
        if (o.statusIndex < ORDER_STAGES.length - 1) {
          changed = true;
          const statusIndex = o.statusIndex + 1;
          if (statusIndex === ORDER_STAGES.length - 1) arrived = { ...o };
          return { ...o, statusIndex, timeline: [...o.timeline, { stage: statusIndex, at: new Date().toISOString() }] };
        }
        return o;
      });
      if (!changed) return;
      save(STORE.orders, orders);
      setS((prev) => ({ ...prev, orders }));
      if (arrived) toast(`Pesanan ${(arrived as Order).id} tiba di ${(arrived as Order).address.kota} — selamat menikmati! 🎉`);
    }, 8000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* live viewers */
  useEffect(() => {
    const iv = window.setInterval(() => {
      const st = sRef.current;
      const v = Math.max(12, Math.min(47, st.viewers + Math.floor(Math.random() * 7) - 3));
      setS((prev) => ({ ...prev, viewers: v }));
    }, 7000);
    return () => window.clearInterval(iv);
  }, []);

  /* service worker */
  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* opsional */ });
    }
  }, []);

  return (
    <Ctx.Provider value={{ s, set, goto, toast, ensureResult, cartCount, cartTotals, addToCart, persistBagPrefs, syncPull, fetchRemoteReviews, completeOrder }}>
      {children}
    </Ctx.Provider>
  );
}
