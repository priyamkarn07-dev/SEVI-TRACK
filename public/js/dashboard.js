(async function () {
  const { api, esc, fmtDate, badge, toast, icon } = ST;
  const u = await ST.getUser();
  if (!u) { location.replace('/login.html?next=/dashboard.html'); return; }
  if (u.role === 'admin') { location.replace('/admin'); return; }
  ST.renderHeader('dashboard');
  document.getElementById('hello').textContent = `Welcome, ${u.name.split(' ')[0]}`;

  let ads = [], notifs = [], editCtx = null, editing = null;
  const $ = (id) => document.getElementById(id);

  // ---------- tabs ----------
  const tabs = ['ads', 'notifications', 'history', 'account'];
  function showTab(t) {
    tabs.forEach((x) => { $('tab-' + x).classList.toggle('hidden', x !== t); });
    document.querySelectorAll('.subnav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    if (t === 'notifications') loadNotifs();
    if (t === 'history') loadHistory();
    if (t === 'account') fillAccount();
    history.replaceState(null, '', '#' + t);
  }
  document.querySelector('.subnav').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

  // ---------- ads ----------
  async function loadAds() {
    try { ads = (await api('/ads/mine')).ads; renderStats(); renderAds(); }
    catch (e) { $('ads-list').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  }
  function renderStats() {
    const c = (s) => ads.filter((a) => a.status === s).length;
    const items = [['Total submitted', ads.length], ['Pending', c('pending')], ['Approved / Published', c('approved') + c('published')], ['Rejected', c('rejected')]];
    $('stats').innerHTML = items.map(([l, v]) => `<div class="card stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  }
  function renderAds() {
    const f = $('f-status').value;
    const list = ads.filter((a) => !f || a.status === f);
    if (!list.length) {
      $('ads-list').innerHTML = `<div class="card empty">${icon('inbox', 'icon ic')}<h3>${ads.length ? 'No advertisements match this filter' : 'No advertisements yet'}</h3><p>${ads.length ? 'Try a different status filter.' : 'Submit your first advertisement to get started.'}</p>${ads.length ? '' : '<a class="btn btn-primary" href="/submit.html">Submit an advertisement</a>'}</div>`;
      return;
    }
    $('ads-list').innerHTML = list.map((a) => `
      <article class="card ad-card" style="margin-bottom:16px" data-code="${esc(a.ad_code)}">
        <div class="thumb"><img src="${esc(a.image_url)}" alt="Banner for ${esc(a.title)}" loading="lazy"></div>
        <div class="body">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><button class="idtag" type="button" data-copy="${esc(a.ad_code)}" title="Copy ID">${esc(a.ad_code)} ${icon('copy')}</button>${badge(a.status)}</div>
          <h3>${esc(a.title)}</h3>
          <div class="ad-meta"><span>${esc(a.category)}</span><span>${esc(a.ad_type)}</span><span>${a.duration_days} days</span><span>Submitted ${fmtDate(a.created_at)}</span></div>
          ${a.status === 'rejected' && a.rejection_reason ? `<div class="reject-note"><strong>Rejection reason:</strong> ${esc(a.rejection_reason)}</div>` : ''}
          ${a.status === 'published' && a.expires_at ? `<div class="small muted">Live until ${fmtDate(a.expires_at, false)}</div>` : ''}
          <div class="ad-actions"><button class="btn btn-sm" type="button" data-view="${esc(a.ad_code)}">${icon('eye')} View details</button>${a.status === 'pending' ? `<button class="btn btn-sm btn-primary" type="button" data-edit="${esc(a.ad_code)}">${icon('edit')} Edit</button>` : ''}</div>
        </div>
      </article>`).join('');
  }
  $('f-status').addEventListener('change', renderAds);
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-copy]'); if (c) ST.copyText(c.dataset.copy);
    const v = e.target.closest('[data-view]'); if (v) openDetail(v.dataset.view);
    const ed = e.target.closest('[data-edit]'); if (ed) openEdit(ed.dataset.edit);
  });

  async function openDetail(code) {
    $('dm-body').innerHTML = '<div class="spinner"></div>'; $('dm-foot').innerHTML = ''; ST.openModal('detail-modal');
    try {
      const { ad, history } = await api('/ads/' + encodeURIComponent(code));
      $('dm-title').textContent = ad.title;
      const link = (x) => x ? `<a href="${esc(ST.safeLink(x))}" target="_blank" rel="noopener noreferrer nofollow">${esc(x)}</a>` : '—';
      $('dm-body').innerHTML = `<div class="detail-grid">
        <div><div class="banner-view"><img src="${esc(ad.image_url)}" alt="Advertisement banner"></div>
          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${badge(ad.status)}<span class="idtag" data-copy="${esc(ad.ad_code)}">${esc(ad.ad_code)} ${icon('copy')}</span></div>
          ${ad.status === 'rejected' && ad.rejection_reason ? `<div class="reject-note" style="margin-top:14px"><strong>Rejection reason:</strong> ${esc(ad.rejection_reason)}</div>` : ''}
          <h4 style="margin:22px 0 14px">Status history</h4><ul class="timeline">${history.map((h) => `<li><div class="t">${esc(h.event)}</div><div class="d">${fmtDate(h.created_at)}</div>${h.note ? `<div class="nt">${esc(h.note)}</div>` : ''}</li>`).join('')}</ul></div>
        <div><dl class="dl">
          <dt>Business</dt><dd>${esc(ad.company)}</dd><dt>Category</dt><dd>${esc(ad.category)}</dd>
          <dt>Type</dt><dd>${esc(ad.ad_type)}</dd><dt>Duration</dt><dd>${ad.duration_days} days</dd>
          <dt>Description</dt><dd style="white-space:pre-wrap">${esc(ad.description)}</dd>
          <dt>Website</dt><dd>${link(ad.website_url)}</dd><dt>Social link</dt><dd>${link(ad.social_url)}</dd>
          <dt>Contact</dt><dd>${esc(ad.full_name)}<br>${esc(ad.email)}<br>${esc(ad.whatsapp)}</dd>
          <dt>Instructions</dt><dd style="white-space:pre-wrap">${esc(ad.instructions || '—')}</dd>
          <dt>Submitted</dt><dd>${fmtDate(ad.created_at)}</dd><dt>Last updated</dt><dd>${fmtDate(ad.updated_at)}</dd>
          ${ad.published_at ? `<dt>Published</dt><dd>${fmtDate(ad.published_at)}</dd><dt>Expires</dt><dd>${fmtDate(ad.expires_at)}</dd>` : ''}
        </dl></div></div>`;
      $('dm-foot').innerHTML = (ad.status === 'pending' ? `<button class="btn btn-primary" type="button" id="dm-edit">Edit advertisement</button>` : '') + '<button class="btn" type="button" data-close>Close</button>';
      const b = $('dm-edit'); if (b) b.onclick = () => { ST.closeModal('detail-modal'); openEdit(code); };
    } catch (e) { $('dm-body').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  async function openEdit(code) {
    const form = $('edit-form');
    try {
      const { ad } = await api('/ads/' + encodeURIComponent(code));
      if (ad.status !== 'pending') { toast('Only pending advertisements can be edited.', 'error'); return loadAds(); }
      if (!editCtx) editCtx = await ST.adForm.mount(form, { imageRequired: false, host: $('em-body') });
      ST.clearErrors(form); ST.hideBanner(form);
      ST.adForm.fill(form, ad, editCtx);
      editing = ad.ad_code;
      $('em-title').textContent = 'Edit ' + ad.ad_code;
      ST.openModal('edit-modal');
    } catch (e) { toast(e.message, 'error'); }
  }
  $('edit-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const form = e.currentTarget;
    ST.clearErrors(form); ST.hideBanner(form);
    const errs = ST.validateAdForm(form, { imageRequired: false });
    if (Object.keys(errs).length) { ST.banner(form, 'Please correct the highlighted fields.'); ST.applyErrors(form, errs); return; }
    const btn = $('em-save'); ST.setLoading(btn, true);
    try {
      await api('/ads/' + encodeURIComponent(editing), { method: 'PUT', body: ST.adForm.toFormData(form) });
      ST.closeModal('edit-modal'); toast('Advertisement updated.', 'success'); await loadAds();
    } catch (err) {
      ST.banner(form, err.message); if (err.fields) ST.applyErrors(form, err.fields);
      if (err.status === 409) { loadAds(); }
    } finally { ST.setLoading(btn, false); }
  });

  // ---------- notifications ----------
  const NICON = { submitted: 'send', approved: 'check', published: 'check', rejected: 'x', expired: 'bell2', edited: 'edit', pending: 'bell' };
  function setUnread(n) {
    ['tab-unread', 'nav-unread'].forEach((id) => { const el = $(id); if (el) { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', !n); } });
  }
  async function loadNotifs() {
    $('notif-list').innerHTML = '<div class="spinner"></div>';
    try {
      const d = await api('/notifications'); notifs = d.notifications; setUnread(d.unread); renderNotifs();
    } catch (e) { $('notif-list').innerHTML = `<div class="card empty">${esc(e.message)}</div>`; }
  }
  function renderNotifs() {
    if (!notifs.length) { $('notif-list').innerHTML = `<div class="card empty">${icon('bell', 'icon ic')}<h3>No notifications yet</h3><p>You'll be notified here when your advertisements are submitted, approved or rejected.</p></div>`; return; }
    $('notif-list').innerHTML = notifs.map((n) => `<div class="notif ${esc(n.type)} ${n.is_read ? '' : 'unread'}" data-nid="${n.id}">
      <div class="dot">${icon(NICON[n.type] || 'bell')}</div>
      <div style="flex:1;min-width:0"><h4>${esc(n.title)}</h4><p>${esc(n.message)}</p><div class="xs dim" style="margin-top:6px">${fmtDate(n.created_at)}${n.ad_code ? ` · <button class="idtag" type="button" data-view="${esc(n.ad_code)}" style="padding:1px 8px">${esc(n.ad_code)}</button>` : ''}</div></div>
      ${n.is_read ? '' : `<button class="btn btn-sm" type="button" data-read="${n.id}">Mark read</button>`}</div>`).join('');
  }
  document.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-read]'); if (!r) return;
    try { await api(`/notifications/${r.dataset.read}/read`, { method: 'POST' }); await loadNotifs(); } catch (err) { toast(err.message, 'error'); }
  });
  $('read-all').addEventListener('click', async () => {
    try { await api('/notifications/read-all', { method: 'POST' }); await loadNotifs(); toast('All notifications marked as read.', 'success'); } catch (err) { toast(err.message, 'error'); }
  });

  // ---------- history ----------
  async function loadHistory() {
    const ul = $('history-list'); ul.innerHTML = '<div class="spinner"></div>';
    try {
      const { history: h } = await api('/history');
      ul.innerHTML = h.length ? h.map((x) => `<li><div class="t">${esc(x.event)} — <span class="muted" style="font-weight:500">${esc(x.title)}</span></div><div class="d">${fmtDate(x.created_at)} · ${esc(x.ad_code)}</div>${x.note ? `<div class="nt">${esc(x.note)}</div>` : ''}</li>`).join('') : '<li class="muted">No activity yet.</li>';
    } catch (e) { ul.innerHTML = `<li class="muted">${esc(e.message)}</li>`; }
  }

  // ---------- account ----------
  function fillAccount() { const f = $('profile-form'); f.name.value = u.name; $('p-email').value = u.email; f.whatsapp.value = u.whatsapp || ''; }
  $('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; ST.clearErrors(f); ST.hideBanner(f);
    try {
      const { user } = await api('/auth/profile', { method: 'PATCH', body: { name: f.name.value, whatsapp: f.whatsapp.value } });
      Object.assign(u, user); toast('Profile saved.', 'success'); $('hello').textContent = `Welcome, ${u.name.split(' ')[0]}`;
    } catch (err) { if (err.fields) ST.applyErrors(f, err.fields); ST.banner(f, err.message); }
  });
  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.currentTarget; ST.clearErrors(f); ST.hideBanner(f);
    try {
      await api('/auth/password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
      f.reset(); toast('Password updated.', 'success');
    } catch (err) { if (err.fields) ST.applyErrors(f, err.fields); ST.banner(f, err.message); }
  });
  [$('profile-form'), $('pw-form')].forEach((f) => f.addEventListener('input', (e) => e.target.closest('.field')?.classList.remove('invalid')));

  // ---------- init ----------
  await loadAds();
  const unread = (await api('/notifications').catch(() => ({ unread: 0 }))).unread; setUnread(unread);
  const start = location.hash.slice(1); if (tabs.includes(start)) showTab(start);
  // keep status fresh while the page is open
  setInterval(() => { if (!document.hidden && !document.querySelector('.modal.open')) { loadAds(); api('/notifications').then((d) => { setUnread(d.unread); if (!$('tab-notifications').classList.contains('hidden')) { notifs = d.notifications; renderNotifs(); } }).catch(() => {}); } }, 30000);
})();
