/**
 * Helper bersama untuk API Aura Atelier.
 * Database: Vercel Blob (document store, akses privat via OIDC project).
 * Skema data (key → JSON):
 *   user:<email>    → { email, name, phone, salt, hash, createdAt }
 *   orders:<email>  → [ order ]
 *   reviews:<sku>   → [ { name, rating, text, size, at, email } ]
 *   profile:<email> → profil fit (skema user_body_profiles)
 */
import { put, get } from '@vercel/blob';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=()',
};

/* ---------------- rate limiter & sanitasi ---------------- */
const rateBuckets = new Map();

export function getClientIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Sliding-window rate limiter per instance serverless. */
export function checkRateLimit(req, bucketKey, maxReq = 30, windowMs = 60_000) {
  const ip = getClientIp(req);
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();
  const prev = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (prev.length >= maxReq) return false;
  prev.push(now);
  rateBuckets.set(key, prev);
  if (rateBuckets.size > 2000) {
    for (const [k, arr] of rateBuckets.entries()) {
      if (arr.every((t) => now - t >= windowMs)) rateBuckets.delete(k);
    }
  }
  return true;
}

/** Sanitasi string input untuk mencegah karakter kontrol & XSS payload. */
export function sanitizeText(val, maxLen = 250) {
  return String(val ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\/?(?:script|iframe|object|embed|svg|math|style|link|meta)\b[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, maxLen);
}

/* Antrean per-key agar tidak terjadi race condition saat read-modify-write di instance yang sama */
const keyLocks = new Map();
export async function withKeyLock(key, fn) {
  const prev = keyLocks.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  keyLocks.set(key, next);
  try {
    return await next;
  } finally {
    if (keyLocks.get(key) === next) keyLocks.delete(key);
  }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function readJSON(key, fallback) {
  try {
    const res = await get(key, { access: 'private', useCache: false });
    if (!res || !res.stream) return fallback;
    const txt = await new Response(res.stream).text();
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

export async function writeJSON(key, value) {
  await put(key, JSON.stringify(value), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
  });
}

/* ---------------- auth: hash sandi + token HMAC ---------------- */
const SECRET = process.env.AUTH_SECRET || 'aura-dev-insecure-secret';

export function hashPass(pass, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(pass, salt, 32).toString('hex') };
}

export function verifyPass(pass, salt, hash) {
  try {
    const a = scryptSync(pass, salt, 32);
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function signToken(email) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 30 * 24 * 3600 * 1000 })).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}

/** Mengembalikan email bila token valid, atau null. */
export function verifyToken(req) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [payload, sig] = t.split('.');
  if (!payload || !sig) return null;
  if (createHmac('sha256', SECRET).update(payload).digest('base64url') !== sig) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.exp > Date.now() ? String(d.email).toLowerCase() : null;
  } catch {
    return null;
  }
}

/* ---------------- admin ---------------- */
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || '';

export function isAdminEmail(email) {
  return !!ADMIN_EMAIL && email === ADMIN_EMAIL;
}

/** Autentikasi khusus admin (kredensial dari env, tidak pernah dikirim ke klien). */
export function verifyAdminPass(pass) {
  return !!ADMIN_PASS && typeof pass === 'string' && pass.length === ADMIN_PASS.length
    && timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASS));
}

/** Token valid + email = admin → email; selain itu null. */
export function verifyAdmin(req) {
  const email = verifyToken(req);
  return isAdminEmail(email) ? email : null;
}
