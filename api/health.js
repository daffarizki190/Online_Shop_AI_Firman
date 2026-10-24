/** GET /api/health — cek koneksi database (roundtrip tulis-baca). */
import { json, preflight, readJSON, writeJSON } from './_lib.js';

export const OPTIONS = preflight;

export async function GET() {
  const diag = { ok: false, mode: 'vercel-blob', env: {} };
  try {
    diag.env.hasStoreId = !!process.env.BLOB_STORE_ID;
    const at = Date.now();
    await writeJSON('health:ping', { at });
    const back = await readJSON('health:ping', null);
    diag.ok = !!back;
    diag.at = back?.at;
  } catch (e) {
    diag.error = String(e && e.message || e);
    diag.raw = String(e);
    diag.name = e && e.constructor && e.constructor.name;
    if (e && typeof e === 'object') {
      try { diag.props = Object.keys(e); } catch { /* ignore */ }
    }
  }
  return json(diag);
}
