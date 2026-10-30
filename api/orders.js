/**
 * GET  /api/orders?email=...   (Bearer token) → { ok, orders }
 * POST /api/orders { order }   (Bearer token) → { ok } — upsert berdasarkan id dengan validasi harga server-side
 */
import { json, preflight, readJSON, writeJSON, verifyToken, checkRateLimit, sanitizeText, withKeyLock } from './_lib.js';

export const OPTIONS = preflight;

const SKU_PRICES = {
  'TSHIRT-BOXY-NOIR-004': 449000,
  'TSHIRT-BOXY-BONE-005': 449000,
  'TSHIRT-CREW-SLATE-006': 379000,
  'LSLEEVE-RIBS-INK-007': 499000,
  'HOODIE-HEAVY-CARBON-008': 749000,
  'HOODIE-HEAVY-MOSS-009': 749000,
  'SHIRT-OVS-ECRU-010': 659000,
  'SHIRT-OVS-INDIGO-011': 659000,
};

export async function GET(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);
  const orders = await readJSON('orders:' + email, []);
  return json({ ok: true, orders });
}

export async function POST(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);
  if (!checkRateLimit(req, 'orders:' + email, 30, 60_000)) {
    return json({ error: 'Terlalu banyak permintaan pesanan' }, 429);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }
  const order = body && body.order;
  if (!order || typeof order.id !== 'string' || !Array.isArray(order.items) || order.items.length === 0 || order.items.length > 50) {
    return json({ error: 'Struktur pesanan tidak valid' }, 400);
  }

  // Sanitasi dan validasi harga item terhadap katalog resmi
  const cleanItems = order.items.map((item) => {
    const sku = sanitizeText(item.sku, 64);
    const qty = Math.max(1, Math.min(99, Math.round(Number(item.qty) || 1)));
    const officialPrice = SKU_PRICES[sku];
    return {
      ...item,
      sku,
      size: sanitizeText(item.size, 8),
      qty,
      ...(officialPrice ? { price: officialPrice } : {}),
    };
  });

  let cleanTotals = order.totals || {};
  if (cleanTotals.subtotal !== undefined) {
    const calcSubtotal = cleanItems.reduce((acc, i) => acc + i.qty * (SKU_PRICES[i.sku] || Number(i.price) || 0), 0);
    const shipping = Math.max(0, Math.min(100000, Math.round(Number(cleanTotals.shipping) || 0)));
    const discount = Math.max(0, Math.min(45000, Math.round(Number(cleanTotals.discount) || 0)));
    cleanTotals = {
      subtotal: calcSubtotal,
      shipping,
      discount,
      total: Math.max(0, calcSubtotal + shipping - discount),
    };
  }

  const cleanAddress = order.address ? {
    nama: sanitizeText(order.address.nama, 60),
    phone: sanitizeText(order.address.phone, 24),
    provinsi: sanitizeText(order.address.provinsi, 40),
    kota: sanitizeText(order.address.kota, 40),
    alamat: sanitizeText(order.address.alamat, 200),
    kodepos: sanitizeText(order.address.kodepos, 10),
    catatan: sanitizeText(order.address.catatan, 120),
  } : undefined;

  const safeOrder = {
    ...order,
    id: sanitizeText(order.id, 32),
    items: cleanItems,
    totals: cleanTotals,
    ...(cleanAddress ? { address: cleanAddress } : {}),
    statusIndex: Math.max(0, Math.min(5, Math.round(Number(order.statusIndex) || 0))),
  };

  const key = 'orders:' + email;
  return withKeyLock(key, async () => {
    const list = await readJSON(key, []);
    const idx = list.findIndex((o) => o.id === safeOrder.id);
    if (idx >= 0) list[idx] = safeOrder; else list.unshift(safeOrder);
    list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    await writeJSON(key, list.slice(0, 100));
    return json({ ok: true, saved: safeOrder.id });
  });
}
