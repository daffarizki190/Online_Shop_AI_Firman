/**
 * GET    /api/reviews?sku=...                       → { ok, reviews }  (publik)
 * POST   /api/reviews { sku, review }               (Bearer token) → { ok, reviews }
 * DELETE /api/reviews { sku, at }                   (Bearer token) → hapus ulasan milik sendiri
 */
import { json, preflight, readJSON, writeJSON, verifyToken } from './_lib.js';

export const OPTIONS = preflight;

export async function GET(req) {
  const url = new URL(req.url);
  const sku = String(url.searchParams.get('sku') || '').slice(0, 64);
  if (!sku) return json({ error: 'sku wajib diisi' }, 400);
  const reviews = await readJSON('reviews:' + sku, []);
  return json({ ok: true, reviews });
}

export async function POST(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Login dulu untuk mengirim ulasan' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }
  const sku = String(body.sku || '').slice(0, 64);
  const r = body.review || {};
  const rating = Math.round(Number(r.rating));
  const text = String(r.text || '').trim();
  if (!sku || rating < 1 || rating > 5 || text.length < 10) {
    return json({ error: 'Ulasan tidak lengkap (rating 1–5, min. 10 karakter)' }, 400);
  }

  const key = 'reviews:' + sku;
  const list = await readJSON(key, []);
  list.push({
    name: String(r.name || 'Pembeli').slice(0, 40),
    rating,
    text: text.slice(0, 500),
    size: String(r.size || '—').slice(0, 8),
    at: new Date().toISOString(),
    email,
  });
  await writeJSON(key, list.slice(-200));
  return json({ ok: true, reviews: list });
}

/** Hapus ulasan milik sendiri (identifikasi via sku + timestamp unik). */
export async function DELETE(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }
  const sku = String(body.sku || '').slice(0, 64);
  const at = String(body.at || '');
  if (!sku || !at) return json({ error: 'sku dan at wajib diisi' }, 400);

  const key = 'reviews:' + sku;
  const list = await readJSON(key, []);
  const next = list.filter((rv) => !(rv.at === at && rv.email === email));
  if (next.length === list.length) return json({ error: 'Ulasan tidak ditemukan' }, 404);
  await writeJSON(key, next);
  return json({ ok: true, reviews: next });
}
