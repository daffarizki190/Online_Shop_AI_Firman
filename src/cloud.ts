/** Klien API serverless (cloud-first, fallback lokal ditangani store). */
const API_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? 'https://online-shop-ai-firman.vercel.app/api'
  : '/api';

const TOKEN_KEY = 'aura.token.v1';

export const Cloud = {
  ready: null as boolean | null,
  token: (() => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null') as string | null; } catch { return null; } })(),

  async ping(force = false): Promise<boolean> {
    if (this.ready !== null && !force) return this.ready;
    try {
      const r = await fetch(API_BASE + '/health');
      const j = await r.json();
      this.ready = !!(j as { ok?: boolean }).ok;
    } catch { this.ready = false; }
    return this.ready;
  },

  setToken(t: string | null) {
    this.token = t;
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* ignore */ }
  },

  async call<T = any>(path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}): Promise<T> {
    const r = await fetch(API_BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: 'Bearer ' + this.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error || ('HTTP ' + r.status));
    return j as T;
  },
};
