(async function () {
  const { api, esc, fmtDate, badge, toast, icon, cap } = ST;
  const u = await ST.getUser();
  if (!u || u.role !== 'admin') { location.replace('/admin-login.html'); return; }
  ST.renderHeader('admin');
  const $ = (id) => document.getElementById(id);
  const STATUSES = ['pending', 'approved', 'rejected', 'published', 'expired'];
  const state = { status: '', q: '', category: '', sort: 'newest', ads: [], stats: null, cats: [] };
  let editCtx = null, editingCode = null, currentAd = null;

  // ---------- tabs ----------
  const tabs = ['ads', 'categories', 'users', 'account'];
  function showTab(t) {
    tabs.forEach((x) => $('tab-' + x).classList.toggle('hidden', x !== t));
    document.querySelectorAll('.subnav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    if (t === 'categories') loadCats(); if (t === 'users') loadUsers(); if (t === 'ads') loadAds();
  }
  document.querySelector('.subnav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

  // 401/403 => session lost
  function handle(err) {
    if (err.status === 401 || err.status === 403) { location.replace('/admin-login.html'); return; }
    toast(err.message, 'error');
  }

  // ---------- stats ----------
  async function loadStats() {
    try {
      const s = await api('/admin/stats'); state.stats = s;
      const items = [['', 'Total', s.total], ...STATUSES.map((x) => [x, cap(x), s.by_status[x]])];
      $('stats').innerHTML = items.map(([k, l, v]) => `<div class="card stat clickable ${state.status === k ? 'active-f' : ''}" data-filter="${k}" role="button" tabindex="0"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
      renderPills();
    } catch (e) { handle(e); }
  }
  $('stats').addEventListener('click', (e) => { const c = e.target.closest('[data-filter]'); if (c) setStatus(c.dataset.filter); });
  $('stats').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const c = e.target.closest('[data-filter]'); if (c) { e.preventDefault(); setStatus(c.dataset.filter); } } });
  function renderPills() {
    const s = state.stats; if (!s) return;
    const list = [['', 'All', s.total], ...STATUSES.map((x) => [x, cap(x), s.by_status[x]])];
    $('pills').innerHTML = list.map(([k, l, c]) => `<button type="button" class="pill ${state.status === k ? 'active' : ''}" data-filter="${k}">${l}<span class="c">${c}</span></button>`).join('');
  }
  $('pills').addEventListener('click', (e) => { const c = e.target.closest('[data-filter]'); if (c) setStatus(c.dataset.filter); });
  function setStatus(s) { state.status = s; renderPills(); document.querySelectorAll('#stats .stat').forEach((c) => c.classList.toggle('active-f', c.dataset.filter === s)); loadAds(); }

  // ---------- ads list ----------
  let seq = 0;
  async function loadAds() {
    const my = ++seq;
    const p = new URLSearchParams();
    if (state.status) p.set('status', state.status); if (state.q) p.set('q', state.q);
    if (state.category) p.set('category', state.category); if (state.sort === 'oldest') p.set('sort', 'oldest');
    try {
      const { ads } = await api('/admin/ads?' + p); if (my !== seq) return;
      state.ads = ads; renderAds();
    } catch (e) { if (my === seq) { $('ads-out').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; handle(e); } }
  }
  function actionButtons(a) {
    const b = [];
    if (a.status !== 'approved') b.push(`<button class="btn btn-sm btn-ok" type="button" data-act="approved" data-code="${esc(a.ad_code)}">Approve</button>`);
    if (a.status !== 'rejected') b.push(`<button class="btn btn-sm btn-bad" type="button" data-act="rejected" data-code="${esc(a.ad_code)}">Reject</button>`);
    return b.join('');
  }
  function renderAds() {
    const ads = state.ads;
    if (!ads.length) {
      const filtered = state.q || state.status || state.category;
      $('ads-out').innerHTML = `<div class="card empty">${icon('inbox', 'icon ic')}<h3>${filtered ? 'No advertisements match your filters' : 'No advertisements submitted yet'}</h3><p>${filtered ? 'Try clearing the search or filters.' : 'Submissions from advertisers will appear here.'}</p></div>`;
      return;
    }
    const rows = ads.map((a) => `<tr>
      <td><img class="thumb-s" src="${esc(a.image_url)}" alt="" loading="lazy" data-view="${esc(a.ad_code)}"></td>
      <td><div class="ttl">${esc(a.title)}</div><div class="mono xs dim">${esc(a.ad_code)}</div></td>
      <td>${esc(a.full_name)}<div class="xs dim">${esc(a.email)}</div></td>
      <td>${esc(a.category)}</td><td>${badge(a.status)}</td><td class="small muted" style="white-space:nowrap">${fmtDate(a.created_at)}</td>
      <td><div class="acts"><button class="btn btn-sm" type="button" data-view="${esc(a.ad_code)}">View</button>${actionButtons(a)}</div></td></tr>`).join('');
    const cards = ads.map((a) => `<article class="card ad-card m" style="margin-bottom:14px">
      <div class="thumb"><img src="${esc(a.image_url)}" alt="" loading="lazy" data-view="${esc(a.ad_code)}"></div>
      <div class="body"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span class="mono xs dim">${esc(a.ad_code)}</span>${badge(a.status)}</div>
        <h3 style="font-size:1rem">${esc(a.title)}</h3>
        <div class="ad-meta"><span>${esc(a.full_name)}</span><span>${esc(a.category)}</span><span>${fmtDate(a.created_at)}</span></div>
        <div class="ad-actions"><button class="btn btn-sm" type="button" data-view="${esc(a.ad_code)}">View</button>${actionButtons(a)}</div></div></article>`).join('');
    $('ads-out').innerHTML = `<div class="small dim" style="margin-bottom:10px">${ads.length} advertisement${ads.length === 1 ? '' : 's'}</div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Banner</th><th>Advertisement</th><th>Advertiser</th><th>Category</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class="cards-m">${cards}</div>`;
  }
  let qt; $('q').addEventListener('input', (e) => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value.trim(); loadAds(); }, 250); });
  $('f-cat').addEventListener('change', (e) => { state.category = e.target.value; loadAds(); });
  $('f-sort').addEventListener('change', (e) => { state.sort = e.target.value; loadAds(); });

  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) return openDetail(v.dataset.view);
    const a = e.target.closest('[data-act]'); if (a) return doAction(a.dataset.act, a.dataset.code);
  });

  async function refreshAll() { await Promise.all([loadStats(), loadAds()]); }

  // ---------- status actions ----------
  async function doAction(status, code, reason) {
    if (status === 'rejected' && reason === undefined) return openReject(code);
    try {
      const { ad } = await api(`/admin/ads/${encodeURIComponent(code)}/status`, { method: 'POST', body: { status, reason } });
      toast(`Advertisement ${ad.ad_code} marked ${status}. The advertiser has been notified.`, 'success');
      await refreshAll();
      if ($('detail-modal').classList.contains('open') && currentAd === code) openDetail(code);
    } catch (e) { handle(e); await refreshAll(); }
  }
  function openReject(code) {
    const f = $('reject-form'); f.reset(); ST.clearErrors(f); ST.hideBanner(f); f.dataset.code = code;
    $('rj-sub').textContent = 'Advertisement ' + code;
    ST.openModal('reject-modal');
  }
  $('reject-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; ST.clearErrors(f); ST.hideBanner(f);
    const reason = f.reason.value.trim();
    if (reason.length < 3) return ST.applyErrors(f, { reason: 'Please give the advertiser a reason (at least 3 characters).' });
    const btn = $('rj-btn'); ST.setLoading(btn, true);
    try {
      await api(`/admin/ads/${encodeURIComponent(f.dataset.code)}/status`, { method: 'POST', body: { status: 'rejected', reason } });
      ST.closeModal('reject-modal'); toast('Advertisement rejected. The advertiser has been notified.', 'success');
      await refreshAll(); if ($('detail-modal').classList.contains('open') && currentAd === f.dataset.code) openDetail(f.dataset.code);
    } catch (err) { if (err.fields) ST.applyErrors(f, err.fields); ST.banner(f, err.message); if (err.status === 401) handle(err); }
    finally { ST.setLoading(btn, false); }
  });
  $('reject-form').addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid'));

  // ---------- detail ----------
  async function openDetail(code) {
    currentAd = code;
    $('dm-body').innerHTML = '<div class="spinner"></div>'; $('dm-foot').innerHTML = ''; ST.openModal('detail-modal');
    try {
      const { ad, history } = await api('/admin/ads/' + encodeURIComponent(code));
      if (currentAd !== code) return;
      $('dm-title').textContent = ad.title;
      const link = (x) => x ? `<a href="${esc(ST.safeLink(x))}" target="_blank" rel="noopener noreferrer nofollow">${esc(x)}</a>` : '—';
      $('dm-body').innerHTML = `<div class="detail-grid">
        <div><div class="banner-view"><img src="${esc(ad.image_url)}" alt="Advertisement banner"></div>
          <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${badge(ad.status)}<span class="idtag" data-copy-id="${esc(ad.ad_code)}">${esc(ad.ad_code)} ${icon('copy')}</span></div>
          ${ad.status === 'rejected' && ad.rejection_reason ? `<div class="reject-note" style="margin-top:14px"><strong>Rejection reason:</strong> ${esc(ad.rejection_reason)}</div>` : ''}
          <h4 style="margin:22px 0 14px">Activity</h4><ul class="timeline">${history.map((h) => `<li><div class="t">${esc(h.event)}</div><div class="d">${fmtDate(h.created_at)} · ${esc(h.actor_role || 'system')}</div>${h.note ? `<div class="nt">${esc(h.note)}</div>` : ''}</li>`).join('')}</ul></div>
        <div><dl class="dl">
          <dt>Advertiser</dt><dd>${esc(ad.full_name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(ad.email)}">${esc(ad.email)}</a></dd>
          <dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(ad.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">${esc(ad.whatsapp)}</a></dd>
          <dt>Business</dt><dd>${esc(ad.company)}</dd><dt>Category</dt><dd>${esc(ad.category)}</dd>
          <dt>Type</dt><dd>${esc(ad.ad_type)}</dd><dt>Duration</dt><dd>${ad.duration_days} days</dd>
          <dt>Description</dt><dd style="white-space:pre-wrap">${esc(ad.description)}</dd>
          <dt>Website</dt><dd>${link(ad.website_url)}</dd><dt>Social link</dt><dd>${link(ad.social_url)}</dd>
          <dt>Instructions</dt><dd style="white-space:pre-wrap">${esc(ad.instructions || '—')}</dd>
          <dt>Submitted</dt><dd>${fmtDate(ad.created_at)}</dd><dt>Last updated</dt><dd>${fmtDate(ad.updated_at)}</dd>
          ${ad.reviewed_at ? `<dt>Reviewed</dt><dd>${fmtDate(ad.reviewed_at)}${ad.reviewed_by_name ? ' by ' + esc(ad.reviewed_by_name) : ''}</dd>` : ''}
          ${ad.published_at ? `<dt>Published</dt><dd>${fmtDate(ad.published_at)}</dd><dt>Expires</dt><dd>${fmtDate(ad.expires_at)}</dd>` : ''}
        </dl></div></div>`;
      const acts = [];
      if (ad.status !== 'approved') acts.push(`<button class="btn btn-ok" type="button" data-act="approved" data-code="${esc(ad.ad_code)}">Approve</button>`);
      if (ad.status !== 'rejected') acts.push(`<button class="btn btn-bad" type="button" data-act="rejected" data-code="${esc(ad.ad_code)}">Reject</button>`);
      if (ad.status === 'approved') acts.push(`<button class="btn btn-primary" type="button" data-act="published" data-code="${esc(ad.ad_code)}">Publish</button>`);
      if (ad.status === 'published') acts.push(`<button class="btn" type="button" data-act="expired" data-code="${esc(ad.ad_code)}">Mark expired</button>`);
      if (ad.status !== 'pending') acts.push(`<button class="btn btn-ghost" type="button" data-act="pending" data-code="${esc(ad.ad_code)}">Back to pending</button>`);
      $('dm-foot').innerHTML = `<div class="act-bar">${acts.join('')}</div><div class="act-bar"><button class="btn" type="button" id="dm-edit">${icon('edit')} Edit</button><button class="btn btn-bad" type="button" id="dm-del">${icon('trash')} Delete</button></div>`;
      $('dm-edit').onclick = () => openEdit(ad);
      $('dm-del').onclick = () => confirmBox('Delete advertisement', `Permanently delete "${ad.title}" (${ad.ad_code}) and its banner? This cannot be undone.`, 'Delete', async () => {
        await api('/admin/ads/' + encodeURIComponent(ad.ad_code), { method: 'DELETE' });
        ST.closeModal('detail-modal'); toast('Advertisement deleted.', 'success'); await refreshAll();
      });
    } catch (e) { $('dm-body').innerHTML = `<div class="empty">${esc(e.message)}</div>`; if (e.status === 401) handle(e); }
  }
  document.addEventListener('click', (e) => { const c = e.target.closest('[data-copy-id]'); if (c) ST.copyText(c.dataset.copyId); });

  // ---------- generic confirm ----------
  let confirmFn = null;
  function confirmBox(title, msg, label, fn) {
    $('cf-title').textContent = title; $('cf-msg').textContent = msg; $('cf-ok').textContent = label; confirmFn = fn; ST.openModal('confirm-modal');
  }
  $('cf-ok').addEventListener('click', async () => {
    const b = $('cf-ok'); ST.setLoading(b, true);
    try { await confirmFn(); ST.closeModal('confirm-modal'); } catch (e) { ST.closeModal('confirm-modal'); handle(e); } finally { ST.setLoading(b, false); }
  });

  // ---------- edit ----------
  async function openEdit(ad) {
    const form = $('edit-form');
    try {
      const meta = await ST.loadMeta();
      // admin may need inactive categories too
      const all = (await api('/admin/categories')).categories;
      meta.categories = all.map((c) => ({ id: c.id, name: c.active ? c.name : c.name + ' (inactive)' }));
      if (editCtx) { form.querySelectorAll('.form-section,.form-alert').forEach((n) => n.remove()); }
      editCtx = await ST.adForm.mount(form, { imageRequired: false, meta, host: $('em-body') });
      ST.adForm.fill(form, ad, editCtx);
      // admin note
      if (!form.querySelector('[data-field=admin_note]')) {
        $('em-body').insertAdjacentHTML('beforeend', '<div class="form-section"><h3><span class="n">4</span>Internal</h3><div class="field" data-field="admin_note"><label for="f-admin_note">Admin note<span class="opt">(visible to admins only)</span></label><textarea class="input" id="f-admin_note" name="admin_note" maxlength="1000" style="min-height:90px"></textarea><div class="err"></div></div></div>');
      }
      form.elements.admin_note.value = ad.admin_note || '';
      editingCode = ad.ad_code; $('em-title').textContent = 'Edit ' + ad.ad_code;
      ST.clearErrors(form); ST.hideBanner(form); ST.openModal('edit-modal');
    } catch (e) { handle(e); }
  }
  $('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget; ST.clearErrors(form); ST.hideBanner(form);
    const errs = ST.validateAdForm(form, { imageRequired: false });
    if (Object.keys(errs).length) { ST.banner(form, 'Please correct the highlighted fields.'); ST.applyErrors(form, errs); return; }
    const fd = ST.adForm.toFormData(form); fd.append('admin_note', form.elements.admin_note.value.trim());
    const btn = $('em-save'); ST.setLoading(btn, true);
    try {
      await api('/admin/ads/' + encodeURIComponent(editingCode), { method: 'PUT', body: fd });
      ST.closeModal('edit-modal'); toast('Advertisement updated.', 'success'); await refreshAll();
      if ($('detail-modal').classList.contains('open')) openDetail(editingCode);
    } catch (err) { ST.banner(form, err.message); if (err.fields) ST.applyErrors(form, err.fields); if (err.status === 401) handle(err); }
    finally { ST.setLoading(btn, false); }
  });

  // ---------- categories ----------
  async function loadCats() {
    try { state.cats = (await api('/admin/categories')).categories; renderCats(); fillCatFilter(); } catch (e) { handle(e); }
  }
  function fillCatFilter() {
    const cur = state.category;
    $('f-cat').innerHTML = '<option value="">All categories</option>' + state.cats.map((c) => `<option value="${c.id}" ${String(c.id) === cur ? 'selected' : ''}>${esc(c.name)}${c.active ? '' : ' (inactive)'}</option>`).join('');
  }
  function renderCats() {
    $('cat-list').innerHTML = state.cats.map((c) => `<div class="cat-row ${c.active ? '' : 'off'}" data-id="${c.id}">
      <div class="nm">${esc(c.name)}</div><span class="count-pill">${c.ad_count} ad${c.ad_count === 1 ? '' : 's'}</span>
      <span class="badge ${c.active ? 'approved' : 'expired'}">${c.active ? 'Active' : 'Inactive'}</span>
      <button class="btn btn-sm" type="button" data-cat-rename="${c.id}">Rename</button>
      <button class="btn btn-sm" type="button" data-cat-toggle="${c.id}">${c.active ? 'Deactivate' : 'Activate'}</button>
      <button class="btn btn-sm btn-bad" type="button" data-cat-del="${c.id}">Delete</button></div>`).join('') || '<div class="card empty">No categories.</div>';
  }
  $('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const name = $('cat-name').value.trim();
    if (name.length < 2) return toast('Enter a category name (at least 2 characters).', 'error');
    try { await api('/admin/categories', { method: 'POST', body: { name } }); $('cat-name').value = ''; toast('Category added.', 'success'); loadCats(); } catch (err) { handle(err); }
  });
  $('cat-list').addEventListener('click', async (e) => {
    const rn = e.target.closest('[data-cat-rename]'), tg = e.target.closest('[data-cat-toggle]'), dl = e.target.closest('[data-cat-del]');
    try {
      if (rn) {
        const c = state.cats.find((x) => x.id === +rn.dataset.catRename);
        const row = rn.closest('.cat-row');
        row.innerHTML = `<input class="input" style="flex:1 1 200px" value="${esc(c.name)}" maxlength="60" aria-label="Category name"><button class="btn btn-sm btn-primary" type="button" data-save>Save</button><button class="btn btn-sm" type="button" data-cancel>Cancel</button>`;
        const inp = row.querySelector('input'); inp.focus(); inp.select();
        const save = async () => { try { await api('/admin/categories/' + c.id, { method: 'PATCH', body: { name: inp.value } }); toast('Category renamed.', 'success'); loadCats(); } catch (err) { handle(err); } };
        row.querySelector('[data-save]').onclick = save; row.querySelector('[data-cancel]').onclick = renderCats;
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') save(); if (ev.key === 'Escape') renderCats(); });
      } else if (tg) {
        const c = state.cats.find((x) => x.id === +tg.dataset.catToggle);
        await api('/admin/categories/' + c.id, { method: 'PATCH', body: { active: !c.active } }); toast(`Category ${c.active ? 'deactivated' : 'activated'}.`, 'success'); loadCats();
      } else if (dl) {
        const c = state.cats.find((x) => x.id === +dl.dataset.catDel);
        confirmBox('Delete category', `Delete the category "${c.name}"? Categories that are used by advertisements cannot be deleted.`, 'Delete', async () => { await api('/admin/categories/' + c.id, { method: 'DELETE' }); toast('Category deleted.', 'success'); loadCats(); });
      }
    } catch (err) { handle(err); }
  });

  // ---------- users ----------
  async function loadUsers() {
    try {
      const { users } = await api('/admin/users');
      $('users-body').innerHTML = users.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.whatsapp || '—')}</td><td><span class="badge ${x.role === 'admin' ? 'published' : 'expired'}">${esc(cap(x.role))}</span></td><td>${x.ad_count}</td><td class="small muted">${fmtDate(x.created_at, false)}</td></tr>`).join('');
    } catch (e) { handle(e); }
  }

  // ---------- account ----------
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; ST.clearErrors(f); ST.hideBanner(f);
    try { await api('/auth/password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } }); f.reset(); toast('Password updated.', 'success'); }
    catch (err) { if (err.fields) ST.applyErrors(f, err.fields); ST.banner(f, err.message); }
  });
  $('pw-form').addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid'));

  // ---------- init ----------
  await loadCats(); await refreshAll();
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal.open') && !$('tab-ads').classList.contains('hidden')) refreshAll(); }, 30000);
})();
