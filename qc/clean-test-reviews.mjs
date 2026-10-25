#!/usr/bin/env node
/** Bersihkan ulasan uji dari DB live (jalankan sekali): node qc/clean-test-reviews.mjs */
const B = 'https://online-shop-ai-firman.vercel.app/api';

async function login(email, pass) {
  const r = await fetch(B + '/auth', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, pass }),
  });
  const j = await r.json();
  return j.token || null;
}

async function clean(email, pass, sku) {
  const token = await login(email, pass);
  if (!token) return console.log(`${email}: login gagal`);
  const list = await (await fetch(`${B}/reviews?sku=${sku}`)).json();
  const mine = (list.reviews || []).filter((r) => r.email === email);
  for (const rv of mine) {
    const res = await fetch(B + '/reviews', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ sku, at: rv.at }),
    });
    console.log(`${email} @ ${sku} → HTTP ${res.status}`);
  }
  if (!mine.length) console.log(`${email} @ ${sku}: tidak ada ulasan`);
}

await clean('dbtest@aura.id', 'rahasia123', 'TSHIRT-BOXY-NOIR-004');
await clean('cloud2@aura.id', 'cloud123', 'HOODIE-HEAVY-CARBON-008');
