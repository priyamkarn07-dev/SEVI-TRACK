(async function () {
  const { api, setLoading, clearErrors, applyErrors, banner, hideBanner } = ST;
  const u = await ST.getUser();
  const next = (() => { const n = new URLSearchParams(location.search).get('next'); return n && /^\/[A-Za-z0-9_\-./]*$/.test(n) && !n.startsWith('//') ? n : null; })();
  const home = (user) => next || (user.role === 'admin' ? '/admin' : '/dashboard.html');
  if (u) { location.replace(home(u)); return; }
  ST.renderHeader('login'); ST.initPassToggles();

  const lf = document.getElementById('login-form'), rf = document.getElementById('register-form');
  const tl = document.getElementById('tab-login'), tr = document.getElementById('tab-register');
  function tab(which) {
    const reg = which === 'register';
    lf.classList.toggle('hidden', reg); rf.classList.toggle('hidden', !reg);
    tl.classList.toggle('active', !reg); tr.classList.toggle('active', reg);
    tl.setAttribute('aria-selected', !reg); tr.setAttribute('aria-selected', reg);
  }
  tl.onclick = () => tab('login'); tr.onclick = () => tab('register');
  if (new URLSearchParams(location.search).get('tab') === 'register') tab('register');
  [lf, rf].forEach((f) => f.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid')));

  lf.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(lf); hideBanner(lf);
    const email = lf.email.value.trim(), password = lf.password.value;
    const f = {};
    if (!email) f.email = 'Enter your email address.';
    if (!password) f.password = 'Enter your password.';
    if (Object.keys(f).length) return applyErrors(lf, f);
    const btn = lf.querySelector('button[type=submit]'); setLoading(btn, true);
    try { const { user } = await api('/auth/login', { method: 'POST', body: { email, password, portal: 'user' } }); location.href = home(user); }
    catch (err) { banner(lf, err.message); setLoading(btn, false); }
  });

  rf.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(rf); hideBanner(rf);
    const body = { name: rf.name.value.trim(), email: rf.email.value.trim(), whatsapp: rf.whatsapp.value.trim(), password: rf.password.value };
    const f = {};
    if (body.name.length < 2) f.name = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) f.email = 'Enter a valid email address.';
    if (body.password.length < 8 || !/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) f.password = 'Use at least 8 characters with letters and numbers.';
    if (Object.keys(f).length) return applyErrors(rf, f);
    const btn = rf.querySelector('button[type=submit]'); setLoading(btn, true);
    try { const { user } = await api('/auth/register', { method: 'POST', body }); location.href = home(user); }
    catch (err) { if (err.fields) applyErrors(rf, err.fields); banner(rf, err.message); setLoading(btn, false); }
  });
})();
