/** GET /api/health — cek koneksi database (roundtrip tulis-baca). */
import { put, get, list } from '@vercel/blob';
import { json, preflight } from './_lib.js';

export const OPTIONS = preflight;

export async function GET() {
  const diag = { ok: false, mode: 'vercel-blob', steps: {} };
  try {
    diag.steps.storeId = !!process.env.BLOB_STORE_ID;
    const at = Date.now();
    const putRes = await put('health:ping', JSON.stringify({ at }), {
      access: 'private',
      contentType: 'application/json',
      allowOverwrite: true,
    });
    diag.steps.put = { url: putRes.url, pathname: putRes.pathname };

    try {
      const byPath = await get('health:ping');
      diag.steps.getByPath = byPath ? 'found' : 'null';
    } catch (e) { diag.steps.getByPath = 'ERR:' + String(e && e.message || e); }

    try {
      const byUrl = await get(putRes.url);
      diag.steps.getByUrl = byUrl ? 'found' : 'null';
      if (byUrl) {
        const txt = await byUrl.blob.text();
        diag.steps.readBack = JSON.parse(txt);
      }
    } catch (e) { diag.steps.getByUrl = 'ERR:' + String(e && e.message || e); }

    try {
      const ls = await list({ prefix: 'health:' });
      diag.steps.listCount = ls.blobs.length;
    } catch (e) { diag.steps.list = 'ERR:' + String(e && e.message || e); }

    diag.ok = !!diag.steps.readBack;
  } catch (e) {
    diag.error = String(e && e.message || e);
    diag.name = e && e.constructor && e.constructor.name;
  }
  return json(diag);
}
