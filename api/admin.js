/**
 * API Panel Admin — semua endpoint wajib token admin (env ADMIN_EMAIL).
 *
 * GET  /api/admin/overview   → statistik + pesanan/ulasan/pengguna terbaru
 * POST /api/admin/order      { buyer, id, statusIndex } → ubah status pesanan pembeli
 * POST /api/admin/review-del { sku, at } → hapus ulasan (moderasi, ulasan siapa pun)
 */
import { list } from '@vercel/blob';
import { json, preflight, readJSON, writeJSON, verifyAdmin } from './_lib.js';

export const OPTIONS = preflight;

const ORDER_STAGES = 6;

async function collect(prefix, withBuyer) {
  const ls = await list({ prefix });
  const blobs = ls.blobs || [];
  const out = [];
  // Batch paralel (concurrency = 10) untuk mencegah timeout O(N) sekuensial
  const BATCH_SIZE = 10;
  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const chunk = blobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      chunk.map(async (b) => {
        const buyer = withBuyer ? b.pathname.slice(prefix.length) : null;
        const data = await readJSON(b.pathname, null);
        return { buyer, data };
      })
    );
    for (const { buyer, data } of results) {
      if (Array.isArray(data)) data.forEach((x) => out.push({ ...x, ...(buyer ? { buyer } : {}) }));
      else if (data) out.push({ ...data, ...(buyer ? { buyer } : {}) });
    }
  }
  return out;
}

export async function GET(req) {
  if (!verifyAdmin(req)) return json({ error: 'Khusus admin' }, 403);

  const [orders, reviews, users] = await Promise.all([
    collect('orders:', true),
    // key "reviews:<sku>" → suffix = sku ulasan
    collect('reviews:', true).then((rs) => rs.map(({ buyer, ...r }) => ({ ...r, sku: buyer }))),
    collect('user:', false),
  ]);

  const revenue = orders.reduce((a, o) => a + (o.totals?.total || 0), 0);
  const itemsSold = orders.reduce((a, o) => a + (o.items || []).reduce((x, i) => x + (i.qty || 1), 0), 0);
  const avgRating = reviews.length ? Math.round((reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) * 10) / 10 : null;

  const recentOrders = [...orders].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  const recentReviews = [...reviews].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);

  return json({
    ok: true,
    stats: {
      orders: orders.length,
      revenue,
      itemsSold,
      users: users.length,
      reviews: reviews.length,
      avgRating,
    },
    recentOrders,
    recentReviews,
    users: users
      .map((u) => ({ email: u.email, name: u.name, phone: u.phone, createdAt: u.createdAt }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 30),
  });
}

export async function POST(req) {
  if (!verifyAdmin(req)) return json({ error: 'Khusus admin' }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }

  if (body.action === 'order') {
    const buyer = String(body.buyer || '').toLowerCase();
    const id = String(body.id || '');
    const statusIndex = Math.max(0, Math.min(ORDER_STAGES - 1, Math.round(Number(body.statusIndex))));
    if (!buyer || !id) return json({ error: 'buyer dan id wajib' }, 400);

    const key = 'orders:' + buyer;
    const listOrders = await readJSON(key, []);
    const order = listOrders.find((o) => o.id === id);
    if (!order) return json({ error: 'Pesanan tidak ditemukan' }, 404);
    order.statusIndex = statusIndex;
    order.timeline = order.timeline || [];
    order.timeline.push({ stage: statusIndex, at: new Date().toISOString(), by: 'admin' });
    await writeJSON(key, listOrders);
    return json({ ok: true, order: { id, statusIndex } });
  }

  if (body.action === 'review-del') {
    const sku = String(body.sku || '');
    const at = String(body.at || '');
    if (!sku || !at) return json({ error: 'sku dan at wajib' }, 400);
    const key = 'reviews:' + sku;
    const listRv = await readJSON(key, []);
    const next = listRv.filter((r) => r.at !== at);
    if (next.length === listRv.length) return json({ error: 'Ulasan tidak ditemukan' }, 404);
    await writeJSON(key, next);
    return json({ ok: true, deleted: at });
  }

  return json({ error: 'Aksi tidak dikenal' }, 400);
}
