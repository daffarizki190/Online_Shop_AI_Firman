/**
 * GET  /api/orders?email=...   (Bearer token) → { ok, orders }
 * POST /api/orders { order }   (Bearer token) → { ok } — upsert berdasarkan id
 */
import { json, preflight, readJSON, writeJSON, verifyToken } from './_lib.js';

export const OPTIONS = preflight;

export async function GET(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);
  const orders = await readJSON('orders:' + email, []);
  return json({ ok: true, orders });
}

export async function POST(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }
  const order = body && body.order;
  if (!order || typeof order.id !== 'string' || !Array.isArray(order.items)) {
    return json({ error: 'Struktur pesanan tidak valid' }, 400);
  }

  const key = 'orders:' + email;
  const list = await readJSON(key, []);
  const idx = list.findIndex((o) => o.id === order.id);
  if (idx >= 0) list[idx] = order; else list.unshift(order);
  list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  await writeJSON(key, list.slice(0, 100));
  return json({ ok: true, saved: order.id });
}
