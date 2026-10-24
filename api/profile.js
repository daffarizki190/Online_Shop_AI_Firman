/**
 * GET /api/profile?email=...  (Bearer token) → { ok, profile }
 * PUT /api/profile { profile } (Bearer token) → { ok }
 * Profil fit mengikuti skema `user_body_profiles` (lihat README).
 */
import { json, preflight, readJSON, writeJSON, verifyToken } from './_lib.js';

export const OPTIONS = preflight;

export async function GET(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);
  const profile = await readJSON('profile:' + email, null);
  return json({ ok: true, profile });
}

export async function PUT(req) {
  const email = verifyToken(req);
  if (!email) return json({ error: 'Tidak terautentikasi' }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }
  const profile = body && body.profile;
  if (!profile || !profile.metrics) return json({ error: 'Struktur profil tidak valid' }, 400);

  await writeJSON('profile:' + email, {
    ...profile,
    user_id: email,
    syncedAt: new Date().toISOString(),
  });
  return json({ ok: true });
}
