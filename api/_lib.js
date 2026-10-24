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
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
};

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
