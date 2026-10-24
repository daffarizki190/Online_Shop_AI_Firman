/** GET /api/health — cek koneksi database (roundtrip tulis-baca). */
import { json, preflight, readJSON, writeJSON } from './_lib.js';

export const OPTIONS = preflight;

export async function GET() {
  try {
    const at = Date.now();
    await writeJSON('health:ping', { at });
    const back = await readJSON('health:ping', null);
    return json({ ok: !!back, mode: 'vercel-blob', at: back?.at });
  } catch (e) {
    return json({ ok: false, error: String(e && e.message || e) });
  }
}
