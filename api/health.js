/** GET /api/health — cek koneksi database (roundtrip tulis-baca). */
import { put, get } from '@vercel/blob';
import { json, preflight } from './_lib.js';

export const OPTIONS = preflight;

export async function GET() {
  const diag = { ok: false, mode: 'vercel-blob' };
  try {
    await put('health:ping', JSON.stringify({ at: Date.now() }), {
      access: 'private', contentType: 'application/json', allowOverwrite: true,
    });
    diag.put = 'ok';
    try {
      const res = await get('health:ping', { access: 'private', useCache: false });
      diag.getFound = !!res;
      if (res) {
        diag.readBack = JSON.parse(await res.blob.text());
        diag.ok = true;
      }
    } catch (e) {
      diag.getError = String(e && e.message || e);
      diag.errName = e && e.constructor && e.constructor.name;
      diag.errBody = await Promise.resolve(e && e.text && typeof e.text === 'function' ? e.text().catch?.(() => '') : '').catch(() => '');
    }
  } catch (e) {
    diag.putError = String(e && e.message || e);
  }
  return json(diag);
}
