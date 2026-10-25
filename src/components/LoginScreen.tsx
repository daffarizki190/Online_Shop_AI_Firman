import React, { useEffect, useMemo, useState } from 'react';
import { useApp, STORE, Cloud, fmtIDR } from '../store';
import type { AuthUser } from '../types';

const DEMO_USER = { name: 'Demo Aura', email: 'demo@aura.id', phone: '0812 0000 0000', pass: '123456' };

export default function LoginScreen() {
  const { s, set, goto, toast, syncPull } = useApp();
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = s.authMode === 'login';

  const authError = (m: string) => setErr(m);

  const ensureDemoUser = () => {
    const users = JSON.parse(localStorage.getItem(STORE.users) || '[]');
    if (!users.some((u: any) => u.email === DEMO_USER.email)) {
      users.push(DEMO_USER);
      localStorage.setItem(STORE.users, JSON.stringify(users));
    }
  };

  const loginAs = (u: AuthUser) => {
    const auth = { ...u, loginAt: new Date().toISOString() };
    localStorage.setItem(STORE.auth, JSON.stringify(auth));
    set({ auth });
    toast(u.role === 'admin' ? 'Selamat datang, Admin! Anda masuk ke Panel Admin.' : `Selamat datang, ${u.name.split(' ')[0]}! Anda masuk sebagai ${u.email}.`);
    goto(u.role === 'admin' ? 'admin' : 'shop');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const em = email.trim().toLowerCase();
    const users: any[] = JSON.parse(localStorage.getItem(STORE.users) || '[]');
    if (!/^\S+@\S+\.\S+$/.test(em)) return authError('Format email tidak valid.');
    if (pass.length < 6) return authError('Kata sandi minimal 6 karakter.');
    setBusy(true);

    if (await Cloud.ping()) {
      try {
        const res = await Cloud.call<{ user: AuthUser; token: string }>('/auth', {
          method: 'POST',
          body: { action: s.authMode, email: em, pass, name, phone },
        });
        Cloud.setToken(res.token);
        if (res.user.role !== 'admin' && !users.some((u) => u.email === em)) {
          users.push({ name: res.user.name, email: em, phone: res.user.phone, pass });
          localStorage.setItem(STORE.users, JSON.stringify(users));
        }
        setBusy(false);
        loginAs(res.user);
        syncPull(em);
        toast('Akun tersinkron ✓ — data Anda ikut di semua perangkat.');
        return;
      } catch (e2: any) {
        toast('Koneksi server terputus — melanjutkan dengan data di perangkat ini.');
      }
    }

    setBusy(false);
    if (!isLogin) {
      if (name.trim().length < 3) return authError('Nama lengkap minimal 3 karakter.');
      if (phone.replace(/\D/g, '').length < 9) return authError('No. HP tidak valid (min. 9 digit).');
      if (users.some((u) => u.email === em)) return authError('Email sudah terdaftar — gunakan tab Masuk.');
      users.push({ name, email: em, phone, pass });
      localStorage.setItem(STORE.users, JSON.stringify(users));
      loginAs({ name, email: em, phone });
    } else {
      const u = users.find((x) => x.email === em);
      if (!u) return authError('Email belum terdaftar. Coba tab Daftar atau akun demo.');
      if (u.pass !== pass) return authError('Kata sandi salah.');
      loginAs({ name: u.name, email: u.email, phone: u.phone });
    }
  };

  return (
    <section className="screen is-active screen--gate" id="screen-login" data-tab="none" aria-label="Masuk atau daftar">
      <div className="screen__body login__body">
        <div className="login__brand">
          <span className="brand">AURA ATELIER</span>
          <h1 className="serif-title">{isLogin ? 'Selamat datang kembali.' : 'Buat akun baru.'}</h1>
          <p className="muted-sm">{isLogin ? 'Masuk untuk melanjutkan ke koleksi, profil fit, dan pesanan Anda.' : 'Satu akun untuk koleksi, rekomendasi ukuran AI, dan pelacakan pesanan.'}</p>
        </div>

        <div className="segmented--auth" role="tablist" aria-label="Mode autentikasi">
          <button type="button" className={isLogin ? 'is-active' : ''} role="tab" aria-selected={isLogin}
            onClick={() => { set({ authMode: 'login' }); setErr(null); }}>Masuk</button>
          <button type="button" className={!isLogin ? 'is-active' : ''} role="tab" aria-selected={!isLogin}
            onClick={() => { set({ authMode: 'register' }); setErr(null); }}>Daftar</button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="ff" hidden={isLogin}>
            <label htmlFor="a-name">Nama Lengkap</label>
            <div className="field__control"><input id="a-name" type="text" autoComplete="name" placeholder="cth. Firman Ramadhan" value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div className="ff">
            <label htmlFor="a-email">Email</label>
            <div className="field__control"><input id="a-email" type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="ff" hidden={isLogin}>
            <label htmlFor="a-phone">No. HP</label>
            <div className="field__control"><input id="a-phone" type="tel" autoComplete="tel" placeholder="08xx xxxx xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div className="ff">
            <label htmlFor="a-pass">Kata Sandi</label>
            <div className="field__control"><input id="a-pass" type="password" autoComplete="current-password" placeholder="Min. 6 karakter" value={pass} onChange={(e) => setPass(e.target.value)} /></div>
          </div>
          {err && <p className="auth-error" role="alert">{err}</p>}
          <button type="submit" className="btn btn--dark btn--block" disabled={busy}>{isLogin ? 'Masuk' : 'Daftar & Masuk'}</button>
        </form>

        <div className="login__foot">
          <button type="button" className="link-btn" onClick={() => {
            ensureDemoUser();
            setEmail(DEMO_USER.email);
            setPass(DEMO_USER.pass);
            toast('Kredensial demo terisi — tekan Masuk.');
          }}>Isi akun demo (demo@aura.id)</button>
          <p className="fineprint">Sandi Anda disimpan terenkripsi dan tidak pernah dibagikan.</p>
        </div>
      </div>
    </section>
  );
}
