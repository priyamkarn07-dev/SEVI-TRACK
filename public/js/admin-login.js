(async function () {
  const { api, setLoading, clearErrors, applyErrors, banner, hideBanner } = ST;
  const u = await ST.getUser();
  if (u && u.role === 'admin') { location.replace('/admin'); return; }
  ST.renderHeader('login'); ST.initPassToggles();
  const f = document.getElementById('admin-form');
  f.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid'));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(f); hideBanner(f);
    const email = f.email.value.trim(), password = f.password.value, er = {};
    if (!email) er.email = 'Enter your admin email.';
    if (!password) er.password = 'Enter your password.';
    if (Object.keys(er).length) return applyErrors(f, er);
    const btn = f.querySelector('button[type=submit]'); setLoading(btn, true);
    try { await api('/auth/login', { method: 'POST', body: { email, password, portal: 'admin' } }); location.href = '/admin'; }
    catch (err) { banner(f, err.message); setLoading(btn, false); }
  });
})();
