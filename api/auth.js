/** POST /api/auth — { action: 'register'|'login', email, pass, name?, phone? } */
import { json, preflight, readJSON, writeJSON, hashPass, verifyPass, signToken, isAdminEmail, verifyAdminPass, checkRateLimit, sanitizeText, withKeyLock } from './_lib.js';

export const OPTIONS = preflight;

export async function POST(req) {
  if (!checkRateLimit(req, 'auth', 25, 60_000)) {
    return json({ error: 'Terlalu banyak percobaan. Silakan tunggu 1 menit.' }, 429);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }

  const action = body.action === 'register' ? 'register' : 'login';
  const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
  const pass = String(body.pass || '');
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return json({ error: 'Email tidak valid' }, 400);
  if (pass.length < 6 || pass.length > 128) return json({ error: 'Kata sandi minimal 6 karakter' }, 400);

  // Akun admin: kredensial dari env server — role admin pada respons
  if (isAdminEmail(email)) {
    if (action === 'register') return json({ error: 'Email admin tidak dapat didaftarkan' }, 403);
    if (!verifyAdminPass(pass)) return json({ error: 'Email atau kata sandi salah' }, 401);
    return json({
      ok: true,
      user: { email, name: 'Admin Aura Atelier', phone: '—', role: 'admin' },
      token: signToken(email),
    });
  }

  const key = 'user:' + email;

  if (action === 'register') {
    const name = sanitizeText(body.name, 60);
    const phone = sanitizeText(body.phone, 24);
    if (name.length < 3) return json({ error: 'Nama minimal 3 karakter' }, 400);
    if (phone.replace(/\D/g, '').length < 9) return json({ error: 'No. HP tidak valid' }, 400);

    return withKeyLock(key, async () => {
      const existing = await readJSON(key, null);
      if (existing) return json({ error: 'Email sudah terdaftar — silakan masuk' }, 409);

      const { salt, hash } = hashPass(pass);
      const user = { email, name, phone, createdAt: new Date().toISOString() };
      await writeJSON(key, { ...user, salt, hash });
      return json({ ok: true, user, token: signToken(email) });
    });
  }

  const rec = await readJSON(key, null);
  if (!rec || !verifyPass(pass, rec.salt, rec.hash)) {
    return json({ error: 'Email atau kata sandi salah' }, 401);
  }
  return json({ ok: true, user: { email: rec.email, name: rec.name, phone: rec.phone }, token: signToken(email) });
}
