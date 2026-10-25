/** POST /api/auth — { action: 'register'|'login', email, pass, name?, phone? } */
import { json, preflight, readJSON, writeJSON, hashPass, verifyPass, signToken, isAdminEmail, verifyAdminPass } from './_lib.js';

export const OPTIONS = preflight;

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body tidak valid' }, 400); }

  const action = body.action === 'register' ? 'register' : 'login';
  const email = String(body.email || '').trim().toLowerCase();
  const pass = String(body.pass || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Email tidak valid' }, 400);
  if (pass.length < 6) return json({ error: 'Kata sandi minimal 6 karakter' }, 400);

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
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    if (name.length < 3) return json({ error: 'Nama minimal 3 karakter' }, 400);
    if (phone.replace(/\D/g, '').length < 9) return json({ error: 'No. HP tidak valid' }, 400);

    const existing = await readJSON(key, null);
    if (existing) return json({ error: 'Email sudah terdaftar — silakan masuk' }, 409);

    const { salt, hash } = hashPass(pass);
    const user = { email, name, phone, createdAt: new Date().toISOString() };
    await writeJSON(key, { ...user, salt, hash });
    return json({ ok: true, user, token: signToken(email) });
  }

  const rec = await readJSON(key, null);
  if (!rec || !verifyPass(pass, rec.salt, rec.hash)) {
    return json({ error: 'Email atau kata sandi salah' }, 401);
  }
  return json({ ok: true, user: { email: rec.email, name: rec.name, phone: rec.phone }, token: signToken(email) });
}
