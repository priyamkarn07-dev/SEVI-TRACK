(async function () {
  const u = await ST.getUser();
  if (!u) { location.replace('/login.html?next=/submit.html'); return; }
  if (u.role === 'admin') { location.replace('/admin'); return; }
  ST.renderHeader('submit');
  const form = document.getElementById('ad-form');
  const ctx = await ST.adForm.mount(form);
  document.getElementById('loading').remove(); form.classList.remove('hidden');
  document.getElementById('check-ic').innerHTML = ST.icon('check');

  const prefill = () => { form.elements.full_name.value = u.name || ''; form.elements.email.value = u.email || ''; form.elements.whatsapp.value = u.whatsapp || ''; };
  prefill();

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); ST.clearErrors(form); ST.hideBanner(form);
    const errs = ST.validateAdForm(form, { imageRequired: true });
    if (Object.keys(errs).length) { ST.banner(form, 'Please correct the highlighted fields.'); ST.applyErrors(form, errs); return; }
    const btn = document.getElementById('submit-btn'); ST.setLoading(btn, true);
    try {
      const { ad } = await ST.api('/ads', { method: 'POST', body: ST.adForm.toFormData(form) });
      document.getElementById('new-id').textContent = ad.ad_code;
      document.getElementById('form-card').classList.add('hidden');
      document.getElementById('success').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      ST.toast('Advertisement submitted successfully.', 'success');
      ST.refreshUnread();
    } catch (err) {
      if (err.status === 401) { location.href = '/login.html?next=/submit.html'; return; }
      ST.banner(form, err.message); if (err.fields) ST.applyErrors(form, err.fields);
    } finally { ST.setLoading(btn, false); }
  });
  document.getElementById('copy-id').onclick = () => ST.copyText(document.getElementById('new-id').textContent);
  document.getElementById('another').onclick = () => {
    form.reset(); ctx.picker.reset(); ctx.updateCount(); prefill(); ST.clearErrors(form); ST.hideBanner(form);
    document.getElementById('success').classList.add('hidden'); document.getElementById('form-card').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
})();
